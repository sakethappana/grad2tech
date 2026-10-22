import { beforeEach, describe, expect, it } from "vitest";
import { cancelAssignment, createAssignment, publishAssignment, reviewSubmission, submitAssignment } from "@/server/assignments";
import { recordAttendance } from "@/server/classes";
import { studentAssignmentMetrics, studentReport, studentSummaryCsv, toCsv } from "@/server/reports";
import { enrol, makeBatch, makeUser, minutes, prisma, resetDb } from "./helpers";

beforeEach(resetDb);

const input = (batchIds: string[], dueInMinutes: number, topic = "CSS") => ({
  title: `Task due ${dueInMinutes}`,
  instructions: "x",
  topic,
  difficulty: "EASY" as const,
  dueAt: new Date(Date.now() + minutes(dueInMinutes)),
  allowLate: true,
  maxMarks: 10,
  responseTypes: ["TEXT" as const],
  batchIds,
  studentIds: [],
});

describe("performance reports (workflow 11)", () => {
  it("counts only due, assigned, non-cancelled work and reflects reviews", async () => {
    const admin = await makeUser("ADMIN");
    const s = await makeUser("STUDENT");
    const batch = await makeBatch(admin.id);
    await enrol(s.id, batch.id);

    const onTime = await createAssignment(admin.id, input([batch.id], 30, "HTML"));
    const missed = await createAssignment(admin.id, input([batch.id], 60, "JS"));
    const cancelled = await createAssignment(admin.id, input([batch.id], 60));
    const future = await createAssignment(admin.id, input([batch.id], 5000));
    for (const a of [onTime, missed, cancelled, future]) await publishAssignment(admin.id, a.id, null);
    await cancelAssignment(admin.id, cancelled.id);

    const sub = await submitAssignment(s.id, onTime.id, { textResponse: "done", code: null, codeLanguage: null, linkUrl: null });
    const later = new Date(Date.now() + minutes(120));

    let m = await studentAssignmentMetrics(s.id, later);
    expect(m.summary.due).toBe(2); // onTime + missed (cancelled and future excluded)
    expect(m.summary.onTime).toBe(1);
    expect(m.summary.missing).toBe(1);
    expect(m.summary.awaitingReview).toBe(1); // ungraded is not missing or failed
    expect(m.summary.onTimeRate).toBe(50);

    await reviewSubmission(admin.id, sub.id, { marks: 7, feedback: "Good" });
    m = await studentAssignmentMetrics(s.id, later);
    expect(m.summary.awaitingReview).toBe(0);
    expect(m.summary.marksPct).toBe(70);

    const report = await studentReport(s.id, "student", later);
    expect(report.topics.find((t) => t.topic === "HTML")).toMatchObject({ earned: 7, possible: 10, percent: 70 });
  });

  it("excludes assignments due before the student joined the batch", async () => {
    const admin = await makeUser("ADMIN");
    const s = await makeUser("STUDENT");
    const batch = await makeBatch(admin.id);
    const old = await createAssignment(admin.id, input([batch.id], 10));
    await publishAssignment(admin.id, old.id, null);
    await enrol(s.id, batch.id, new Date(Date.now() + minutes(60))); // joined after it was due
    const m = await studentAssignmentMetrics(s.id, new Date(Date.now() + minutes(120)));
    expect(m.summary.due).toBe(0);
  });

  it("attendance rate uses recorded sessions as the denominator and ignores meeting-link clicks", async () => {
    const admin = await makeUser("ADMIN");
    const s = await makeUser("STUDENT");
    const batch = await makeBatch(admin.id);
    await enrol(s.id, batch.id);
    const mk = (offsetMin: number) =>
      prisma.classSession.create({ data: { batchId: batch.id, topic: "Class", instructorId: admin.id, startsAt: new Date(Date.now() - minutes(offsetMin)), durationMinutes: 60, meetingUrl: "https://meet.example.com/x", createdById: admin.id } });
    const c1 = await mk(300);
    const c2 = await mk(200);
    await mk(100); // no attendance recorded → not in the denominator
    await recordAttendance(admin.id, c1.id, [{ studentId: s.id, status: "PRESENT" }]);
    await recordAttendance(admin.id, c2.id, [{ studentId: s.id, status: "ABSENT" }]);
    const r = await studentReport(s.id, "admin");
    expect(r.attendance.denominator).toBe(2);
    expect(r.attendance.rate).toBe(50);
  });

  it("CSV export neutralises formula injection", async () => {
    expect(toCsv([["=HYPERLINK(\"x\")", "+1", "-2", "@x", "plain, text"]])).toBe(`"'=HYPERLINK(""x"")",'+1,'-2,'@x,"plain, text"\r\n`);
    const admin = await makeUser("ADMIN");
    const batch = await makeBatch(admin.id);
    const s = await makeUser("STUDENT", "=cmd");
    await enrol(s.id, batch.id);
    const csv = await studentSummaryCsv(batch.id);
    expect(csv.split("\r\n")[1].startsWith("'=cmd")).toBe(true);
  });
});
