import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { activeBatchIds, getVisibleAssignment, getVisibleDoubt, visibleAssignmentWhere } from "@/server/access";
import { createAssignment, publishAssignment, reviewSubmission, submitAssignment } from "@/server/assignments";
import { authorizeFile, saveUploads } from "@/server/files";
import { publishNotices } from "@/server/jobs";
import { acceptInvitation, findPendingInvitation, generateResetLink, inviteUser, moveStudent, setSuspended } from "@/server/people";
import { enrol, makeBatch, makeUser, minutes, prisma, resetDb } from "./helpers";

beforeEach(resetDb);

const assignmentInput = (batchIds: string[], studentIds: string[] = [], dueInMinutes = 600) => ({
  title: "Build a card",
  instructions: "Do it",
  topic: "CSS",
  difficulty: "EASY" as const,
  dueAt: new Date(Date.now() + minutes(dueInMinutes)),
  allowLate: false,
  maxMarks: 10,
  responseTypes: ["TEXT" as const, "FILE" as const],
  batchIds,
  studentIds,
});

describe("invitations and enrolment (workflow 1)", () => {
  it("an admin invites a student, who sets a password and is enrolled with the server-assigned role", async () => {
    const admin = await makeUser("ADMIN");
    const batch = await makeBatch(admin.id);
    const { link } = await inviteUser(admin.id, { name: "Ravi Kumar", email: "ravi@example.test", role: "STUDENT", batchId: batch.id, startDate: null });
    const token = link.split("/").pop()!;
    expect(await findPendingInvitation(token)).toBeTruthy();

    const user = await acceptInvitation(token, "a-strong-password-1");
    expect(user.role).toBe("STUDENT");
    expect(await activeBatchIds(user.id)).toEqual([batch.id]);
    // One-time: the link cannot be reused.
    await expect(acceptInvitation(token, "another-password-2")).rejects.toMatchObject({ status: 410 });
    // The new student can sign in with Better Auth.
    const res = await auth.api.signInEmail({ body: { email: "ravi@example.test", password: "a-strong-password-1" }, asResponse: true });
    expect(res.status).toBe(200);
    expect(await prisma.auditEvent.count({ where: { action: { in: ["user.invited", "user.invitation_accepted"] } } })).toBe(2);
  });

  it("there is no public sign-up, so applicants never get student access", async () => {
    const res = await auth.api.signUpEmail({ body: { name: "Applicant", email: "applicant@example.test", password: "a-strong-password-1" }, asResponse: true }).catch((e) => e);
    const status = res instanceof Response ? res.status : (res as { statusCode?: number; status?: string }).statusCode;
    expect(status === undefined ? true : status >= 400).toBe(true);
    expect(await prisma.user.count({ where: { email: "applicant@example.test" } })).toBe(0);
  });

  it("moving a student keeps their history and changes what they can see", async () => {
    const admin = await makeUser("ADMIN");
    const student = await makeUser("STUDENT");
    const a = await makeBatch(admin.id);
    const b = await makeBatch(admin.id);
    await enrol(student.id, a.id);
    await moveStudent(admin.id, student.id, a.id, b.id, new Date());
    expect(await activeBatchIds(student.id)).toEqual([b.id]);
    const history = await prisma.enrolment.findMany({ where: { studentId: student.id } });
    expect(history).toHaveLength(2);
    expect(history.find((e) => e.batchId === a.id)?.status).toBe("ENDED");
  });

  it("suspension blocks sign-in and ends sessions without deleting records", async () => {
    const admin = await makeUser("ADMIN");
    const batch = await makeBatch(admin.id);
    const { link } = await inviteUser(admin.id, { name: "Meera", email: "meera@example.test", role: "STUDENT", batchId: batch.id, startDate: null });
    const user = await acceptInvitation(link.split("/").pop()!, "a-strong-password-1");
    await setSuspended(admin.id, user.id, true, "Fees pending review");
    const res = await auth.api.signInEmail({ body: { email: "meera@example.test", password: "a-strong-password-1" }, asResponse: true }).catch((e) => e);
    const status = res instanceof Response ? res.status : (res as { statusCode?: number }).statusCode;
    expect(status).toBe(403);
    expect(await prisma.enrolment.count({ where: { studentId: user.id } })).toBe(1);
    await expect(setSuspended(user.id, user.id, true, null)).rejects.toMatchObject({ status: 403 });
  });

  it("admins can generate a one-time password-reset link without email", async () => {
    const admin = await makeUser("ADMIN");
    const batch = await makeBatch(admin.id);
    const { link } = await inviteUser(admin.id, { name: "Kiran", email: "kiran@example.test", role: "STUDENT", batchId: batch.id, startDate: null });
    const user = await acceptInvitation(link.split("/").pop()!, "a-strong-password-1");
    const url = await generateResetLink(admin.id, user.id);
    expect(url).toMatch(/reset-password/);
  });
});

describe("batch-scoped visibility (workflows 2, 3, 13)", () => {
  it("published assignments appear for targeted students only; drafts and scheduled work stay hidden", async () => {
    const admin = await makeUser("ADMIN");
    const s1 = await makeUser("STUDENT", "One");
    const s2 = await makeUser("STUDENT", "Two");
    const b1 = await makeBatch(admin.id);
    const b2 = await makeBatch(admin.id);
    await enrol(s1.id, b1.id);
    await enrol(s2.id, b2.id);

    const a = await createAssignment(admin.id, assignmentInput([b1.id]));
    await expect(getVisibleAssignment(s1.id, a.id)).rejects.toMatchObject({ status: 404 }); // draft

    await publishAssignment(admin.id, a.id, null);
    expect((await getVisibleAssignment(s1.id, a.id)).id).toBe(a.id);
    await expect(getVisibleAssignment(s2.id, a.id)).rejects.toMatchObject({ status: 404 });
    const notified = await prisma.notification.findMany({ where: { type: "ASSIGNMENT_PUBLISHED" } });
    expect(notified.map((n) => n.userId)).toEqual([s1.id]);

    // Scheduled publication becomes visible once its time arrives (no redeploy).
    const later = await createAssignment(admin.id, assignmentInput([b1.id], [], 2000));
    const publishAt = new Date(Date.now() + minutes(30));
    await publishAssignment(admin.id, later.id, publishAt);
    const list = (when: Date) => prisma.assignment.findMany({ where: visibleAssignmentWhere(s1.id, [b1.id], when) });
    expect((await list(new Date())).map((x) => x.id)).not.toContain(later.id);
    expect((await list(new Date(publishAt.getTime() + 1000))).map((x) => x.id)).toContain(later.id);
    expect(await publishNotices(new Date(publishAt.getTime() + 1000))).toBe(1);
  });

  it("students cannot read other students' files or private doubts", async () => {
    const admin = await makeUser("ADMIN");
    const s1 = await makeUser("STUDENT", "One");
    const s2 = await makeUser("STUDENT", "Two");
    const batch = await makeBatch(admin.id);
    await enrol(s1.id, batch.id);
    await enrol(s2.id, batch.id);
    const a = await createAssignment(admin.id, assignmentInput([batch.id]));
    await publishAssignment(admin.id, a.id, null);
    const file = new File([Buffer.from("my answer")], "answer.txt", { type: "text/plain" });
    const sub = await submitAssignment(s1.id, a.id, { textResponse: "see file", code: null, codeLanguage: null, linkUrl: null }, [file]);
    const stored = await prisma.fileObject.findFirstOrThrow({ where: { submissionId: sub.id } });

    expect((await authorizeFile(s1, stored.id)).id).toBe(stored.id);
    expect((await authorizeFile(admin, stored.id)).id).toBe(stored.id);
    await expect(authorizeFile(s2, stored.id)).rejects.toMatchObject({ status: 404 });

    const thread = await prisma.doubtThread.create({ data: { studentId: s1.id, batchId: batch.id, title: "Private", topic: "x" } });
    await expect(getVisibleDoubt(s2.id, thread.id)).rejects.toMatchObject({ status: 404 });
  });

  it("rejects disallowed upload types and spoofed files", async () => {
    const admin = await makeUser("ADMIN");
    const exe = new File([Buffer.from("MZ...")], "tool.exe", { type: "application/octet-stream" });
    await expect(saveUploads([exe], { ownerId: admin.id, purpose: "ASSIGNMENT_RESOURCE" })).rejects.toMatchObject({ status: 422 });
    const fakePng = new File([Buffer.from("not really a png")], "pic.png", { type: "image/png" });
    await expect(saveUploads([fakePng], { ownerId: admin.id, purpose: "DOUBT_ATTACHMENT", imagesOnly: true })).rejects.toMatchObject({ status: 422 });
  });

  it("late submissions follow the assignment's policy; reviewed work is locked", async () => {
    const admin = await makeUser("ADMIN");
    const s = await makeUser("STUDENT");
    const batch = await makeBatch(admin.id);
    await enrol(s.id, batch.id);
    const a = await createAssignment(admin.id, assignmentInput([batch.id], [], 60));
    await publishAssignment(admin.id, a.id, null);
    const afterDue = new Date(Date.now() + minutes(120));
    await expect(submitAssignment(s.id, a.id, { textResponse: "late", code: null, codeLanguage: null, linkUrl: null }, [], afterDue)).rejects.toMatchObject({ code: "DEADLINE_PASSED" });

    const sub = await submitAssignment(s.id, a.id, { textResponse: "on time", code: null, codeLanguage: null, linkUrl: null });
    expect(sub.isLate).toBe(false);
    await reviewSubmission(admin.id, sub.id, { marks: 8, feedback: "Nice" });
    await expect(submitAssignment(s.id, a.id, { textResponse: "again", code: null, codeLanguage: null, linkUrl: null })).rejects.toMatchObject({ status: 409 });
    await expect(reviewSubmission(admin.id, sub.id, { marks: 11, feedback: null })).rejects.toMatchObject({ status: 422 });
  });
});
