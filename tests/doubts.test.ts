import { beforeEach, describe, expect, it } from "vitest";
import { getVisibleDoubt } from "@/server/access";
import { assignDoubt, createDoubt, replyToDoubt, setDoubtStatus } from "@/server/doubts";
import { enrol, makeBatch, makeOpenTest, makeUser, prisma, resetDb } from "./helpers";

beforeEach(resetDb);

const base = { codeSnippet: null, codeLanguage: null, assignmentId: null, assessmentId: null, projectBriefId: null };

describe("doubt discussions (workflow 10)", () => {
  it("student asks, admin replies, student is notified, then resolves and reopens", async () => {
    const admin = await makeUser("ADMIN");
    const student = await makeUser("STUDENT", "Dev");
    const batch = await makeBatch(admin.id);
    await enrol(student.id, batch.id);

    const thread = await createDoubt(student, { ...base, title: "Why is my fetch undefined?", body: "I return inside then() but get undefined.", topic: "Promises", visibility: "PRIVATE" });
    expect(await prisma.notification.count({ where: { userId: admin.id, type: "NEW_DOUBT" } })).toBe(1);

    await replyToDoubt(admin, thread.id, { body: "Return the promise from your function.", codeSnippet: "return fetch(url)", codeLanguage: "js" });
    const t1 = await prisma.doubtThread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(t1.status).toBe("IN_PROGRESS");
    expect(t1.firstResponseAt).not.toBeNull();
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: student.id, type: "DOUBT_REPLY" } });
    expect(n.link).toBe(`/portal/student/doubts/${thread.id}`);

    await setDoubtStatus(student, thread.id, "RESOLVED");
    expect((await prisma.doubtThread.findUniqueOrThrow({ where: { id: thread.id } })).status).toBe("RESOLVED");
    // Replying to a resolved doubt reopens it.
    await replyToDoubt(student, thread.id, { body: "Still confused about async/await.", codeSnippet: null, codeLanguage: null });
    expect((await prisma.doubtThread.findUniqueOrThrow({ where: { id: thread.id } })).status).toBe("OPEN");
    await expect(setDoubtStatus(student, thread.id, "IN_PROGRESS")).rejects.toMatchObject({ status: 422 });

    await assignDoubt(admin.id, thread.id, admin.id);
    expect((await prisma.doubtThread.findUniqueOrThrow({ where: { id: thread.id } })).assignedToId).toBe(admin.id);
  });

  it("private doubts stay private; shared doubts are visible to the batch", async () => {
    const admin = await makeUser("ADMIN");
    const a = await makeUser("STUDENT", "A");
    const b = await makeUser("STUDENT", "B");
    const outsider = await makeUser("STUDENT", "C");
    const batch = await makeBatch(admin.id);
    const other = await makeBatch(admin.id);
    await enrol(a.id, batch.id);
    await enrol(b.id, batch.id);
    await enrol(outsider.id, other.id);
    const priv = await createDoubt(a, { ...base, title: "Private question", body: "Something personal about my code", topic: "x", visibility: "PRIVATE" });
    const shared = await createDoubt(a, { ...base, title: "Shared question", body: "Others may have the same issue", topic: "x", visibility: "BATCH" });
    await expect(getVisibleDoubt(b.id, priv.id)).rejects.toMatchObject({ status: 404 });
    expect((await getVisibleDoubt(b.id, shared.id)).id).toBe(shared.id);
    await expect(getVisibleDoubt(outsider.id, shared.id)).rejects.toMatchObject({ status: 404 });
    await expect(setDoubtStatus(b, shared.id, "RESOLVED")).rejects.toMatchObject({ status: 404 });
  });

  it("applies the test's help policy and never shares test doubts while it is open", async () => {
    const admin = await makeUser("ADMIN");
    const s = await makeUser("STUDENT");
    const batch = await makeBatch(admin.id);
    await enrol(s.id, batch.id);
    const { assessment } = await makeOpenTest(admin.id, batch.id);
    // Default policy: no help while open.
    await prisma.assessment.update({ where: { id: assessment.id }, data: { helpPolicy: "NO_HELP_WHILE_OPEN" } });
    await expect(createDoubt(s, { ...base, assessmentId: assessment.id, title: "Question 3 help", body: "What does the output mean?", topic: "x", visibility: "PRIVATE" })).rejects.toMatchObject({ status: 403 });

    await prisma.assessment.update({ where: { id: assessment.id }, data: { helpPolicy: "PRIVATE_CLARIFICATION" } });
    const t = await createDoubt(s, { ...base, assessmentId: assessment.id, title: "Clarify input", body: "Is the input on one line?", topic: "x", visibility: "BATCH" });
    expect(t.visibility).toBe("PRIVATE");
  });
});
