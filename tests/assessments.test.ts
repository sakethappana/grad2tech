import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { finalizeAttempt, getStudentAttempt, saveAnswer, startAttempt, submitAttempt, sweepExpiredAttempts } from "@/server/assessments/attempts";
import { notifyAssessmentPublished, publishAssessment, createAssessment, upsertQuestion, createRevision, publishRevision } from "@/server/assessments/admin";
import { gradeAnswerManually, processGradingJob, retryGrading } from "@/server/assessments/grading";
import { computeDeadline } from "@/server/assessments/lifecycle";
import { setExecutionProvider } from "@/server/execution";
import { sweepGrading } from "@/server/jobs";
import { enrol, FakeProvider, makeBatch, makeOpenTest, makeUser, minutes, prisma, resetDb, sumJudge } from "./helpers";

let provider: FakeProvider;

beforeEach(async () => {
  await resetDb();
  provider = new FakeProvider(sumJudge);
  setExecutionProvider(provider);
});
afterEach(() => setExecutionProvider(null));

async function setup(opts?: Parameters<typeof makeOpenTest>[2]) {
  const admin = await makeUser("ADMIN");
  const student = await makeUser("STUDENT", "Asha");
  const batch = await makeBatch(admin.id);
  await enrol(student.id, batch.id);
  const t = await makeOpenTest(admin.id, batch.id, opts);
  return { admin, student, batch, ...t };
}

describe("attempt lifecycle", () => {
  it("deadline is the earlier of close time and start + duration", () => {
    const start = new Date("2026-01-01T10:00:00Z");
    expect(computeDeadline(start, 30, new Date("2026-01-01T12:00:00Z")).toISOString()).toBe("2026-01-01T10:30:00.000Z");
    expect(computeDeadline(start, 30, new Date("2026-01-01T10:10:00Z")).toISOString()).toBe("2026-01-01T10:10:00.000Z");
  });

  it("refreshing does not create a new attempt or reset the timer (workflow 4)", async () => {
    const { student, assessment } = await setup();
    const a1 = await startAttempt(student.id, assessment.id);
    const a2 = await startAttempt(student.id, assessment.id, new Date(Date.now() + minutes(5)));
    expect(a2.id).toBe(a1.id);
    expect(a2.deadlineAt.getTime()).toBe(a1.deadlineAt.getTime());
    expect(await prisma.attempt.count()).toBe(1);
  });

  it("concurrent starts create exactly one attempt", async () => {
    const { student, assessment } = await setup({ maxAttempts: 3 });
    const results = await Promise.allSettled([1, 2, 3, 4].map(() => startAttempt(student.id, assessment.id)));
    const ids = new Set(results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id));
    expect(ids.size).toBe(1);
    expect(await prisma.attempt.count()).toBe(1);
  });

  it("saves, restores saved work on reload, and submits (workflow 4)", async () => {
    const { student, assessment, mcq, short, coding } = await setup();
    const attempt = await startAttempt(student.id, assessment.id);
    const r1 = await saveAnswer(student.id, attempt.id, mcq.id, { selectedOptionIds: ["a"] });
    const r2 = await saveAnswer(student.id, attempt.id, mcq.id, { selectedOptionIds: ["b"] });
    expect(r2.revision).toBe(r1.revision + 1);
    await saveAnswer(student.id, attempt.id, short.id, { textAnswer: "A promise is a future value." });
    await saveAnswer(student.id, attempt.id, coding.id, { code: "print-sum", languageKey: "71" });

    // "Refresh": load the attempt view again from the server.
    const view = await getStudentAttempt(student.id, attempt.id);
    const byId = Object.fromEntries(view.questions.map((q) => [q.question.id, q.answer]));
    expect(byId[mcq.id].selectedOptionIds).toEqual(["b"]);
    expect(byId[short.id].textAnswer).toContain("future value");
    expect(byId[coding.id].code).toBe("print-sum");

    const submitted = await submitAttempt(student.id, attempt.id);
    expect(submitted.status).toBe("SUBMITTED");
    await expect(saveAnswer(student.id, attempt.id, mcq.id, { selectedOptionIds: ["a"] })).rejects.toMatchObject({ status: 409 });
  });

  it("rejects disallowed languages and invalid options", async () => {
    const { student, assessment, mcq, coding } = await setup();
    const attempt = await startAttempt(student.id, assessment.id);
    await expect(saveAnswer(student.id, attempt.id, mcq.id, { selectedOptionIds: ["zzz"] })).rejects.toMatchObject({ status: 422 });
    await expect(saveAnswer(student.id, attempt.id, coding.id, { code: "x", languageKey: "999" })).rejects.toMatchObject({ status: 422 });
  });

  it("server finalises expired attempts even if the browser is gone (workflow 5)", async () => {
    const { student, assessment, mcq } = await setup({ durationMinutes: 10 });
    const attempt = await startAttempt(student.id, assessment.id);
    await saveAnswer(student.id, attempt.id, mcq.id, { selectedOptionIds: ["b"] });

    // No further client requests. The worker sweep runs after the deadline.
    const later = new Date(attempt.deadlineAt.getTime() + 1000);
    expect(await sweepExpiredAttempts(later)).toBe(1);
    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.status).toBe("AUTO_SUBMITTED");
    expect(after.submittedAt?.getTime()).toBe(attempt.deadlineAt.getTime());
    // The saved MCQ answer was graded.
    const ans = await prisma.attemptAnswer.findFirstOrThrow({ where: { attemptId: attempt.id, questionId: mcq.id } });
    expect(ans.marksAwarded).toBe(2);
    // Saving after the deadline is rejected.
    await expect(saveAnswer(student.id, attempt.id, mcq.id, { selectedOptionIds: ["a"] }, later)).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a save that arrives after the deadline and finalises the attempt", async () => {
    const { student, assessment, mcq } = await setup({ durationMinutes: 5 });
    const attempt = await startAttempt(student.id, assessment.id);
    const late = new Date(attempt.deadlineAt.getTime() + 500);
    await expect(saveAnswer(student.id, attempt.id, mcq.id, { selectedOptionIds: ["b"] }, late)).rejects.toMatchObject({ code: "DEADLINE_PASSED" });
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe("AUTO_SUBMITTED");
  });

  it("enforces the allowed number of attempts", async () => {
    const { student, assessment } = await setup({ maxAttempts: 1 });
    const a = await startAttempt(student.id, assessment.id);
    await submitAttempt(student.id, a.id);
    await expect(startAttempt(student.id, assessment.id)).rejects.toMatchObject({ status: 409 });
  });
});

describe("grading", () => {
  it("duplicate submissions do not create duplicate grades (workflow 6)", async () => {
    const { student, assessment, mcq, coding } = await setup();
    const attempt = await startAttempt(student.id, assessment.id);
    await saveAnswer(student.id, attempt.id, mcq.id, { selectedOptionIds: ["b"] });
    await saveAnswer(student.id, attempt.id, coding.id, { code: "print-sum", languageKey: "71" });

    await Promise.all([submitAttempt(student.id, attempt.id), submitAttempt(student.id, attempt.id), finalizeAttempt(attempt.id, "SYSTEM", new Date(Date.now() + minutes(60)))]);
    expect(await prisma.gradingJob.count()).toBe(1);
    const job = await prisma.gradingJob.findFirstOrThrow();

    // The same job delivered twice (e.g. a retry racing the original) grades once.
    const outcomes = await Promise.all([processGradingJob(job.id), processGradingJob(job.id)]);
    expect(outcomes.filter((o) => o === "done")).toHaveLength(1);
    expect(await prisma.codeCaseResult.count()).toBe(3);
    expect(provider.submissions).toHaveLength(3);

    const codingAnswer = await prisma.attemptAnswer.findFirstOrThrow({ where: { attemptId: attempt.id, questionId: coding.id } });
    expect(codingAnswer.gradeStatus).toBe("AUTO_GRADED");
    expect(codingAnswer.marksAwarded).toBe(5);
  });

  it("scores coding answers proportionally and catches compile errors", async () => {
    const { student, assessment, coding } = await setup();
    const attempt = await startAttempt(student.id, assessment.id);
    await saveAnswer(student.id, attempt.id, coding.id, { code: "syntax error here", languageKey: "71" });
    await submitAttempt(student.id, attempt.id);
    const job = await prisma.gradingJob.findFirstOrThrow();
    await processGradingJob(job.id);
    const results = await prisma.codeCaseResult.findMany();
    expect(results.every((r) => r.outcome === "COMPILE_ERROR")).toBe(true);
    // Compilation is attempted once; remaining cases reuse the result.
    expect(provider.submissions).toHaveLength(1);
    const ans = await prisma.attemptAnswer.findFirstOrThrow({ where: { questionId: coding.id } });
    expect(ans.marksAwarded).toBe(0);
  });

  it("runner outages are not marked wrong and recover on retry (workflow 14)", async () => {
    const { admin, student, assessment, coding } = await setup();
    const attempt = await startAttempt(student.id, assessment.id);
    await saveAnswer(student.id, attempt.id, coding.id, { code: "print-sum", languageKey: "71" });
    await submitAttempt(student.id, attempt.id);
    const job = await prisma.gradingJob.findFirstOrThrow();

    provider.down = true;
    expect(await processGradingJob(job.id)).toBe("retry");
    let ans = await prisma.attemptAnswer.findFirstOrThrow({ where: { questionId: coding.id } });
    expect(ans.gradeStatus).toBe("EXECUTION_ERROR");
    expect(ans.marksAwarded).toBeNull();
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).gradingStatus).not.toBe("GRADED");

    // Service recovers: the worker sweep (or an admin retry) grades it correctly.
    provider.down = false;
    await retryGrading(admin.id, ans.id);
    expect(await processGradingJob(job.id)).toBe("done");
    ans = await prisma.attemptAnswer.findFirstOrThrow({ where: { questionId: coding.id } });
    expect(ans.gradeStatus).toBe("AUTO_GRADED");
    expect(ans.marksAwarded).toBe(5);
  });

  it("the worker sweep picks up grading jobs whose queue message was lost", async () => {
    const { student, assessment, coding } = await setup();
    const attempt = await startAttempt(student.id, assessment.id);
    await saveAnswer(student.id, attempt.id, coding.id, { code: "print-sum", languageKey: "71" });
    await submitAttempt(student.id, attempt.id);
    expect(await sweepGrading(new Date(Date.now() + minutes(2)))).toBe(1);
    expect((await prisma.gradingJob.findFirstOrThrow()).status).toBe("SUCCEEDED");
  });

  it("written answers await manual grading; marks are audited", async () => {
    const { admin, student, assessment, short } = await setup();
    const attempt = await startAttempt(student.id, assessment.id);
    await saveAnswer(student.id, attempt.id, short.id, { textAnswer: "Explanation" });
    await submitAttempt(student.id, attempt.id);
    const a = await prisma.attemptAnswer.findFirstOrThrow({ where: { questionId: short.id } });
    expect(a.gradeStatus).toBe("NEEDS_REVIEW");
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).gradingStatus).toBe("PARTIALLY_GRADED");
    await expect(gradeAnswerManually(admin.id, a.id, 99, null)).rejects.toMatchObject({ status: 422 });
    await gradeAnswerManually(admin.id, a.id, 2.5, "Good start");
    expect(await prisma.auditEvent.count({ where: { action: "attempt.answer_graded", entityId: a.id } })).toBe(1);
  });
});

describe("hidden data (workflow 9)", () => {
  it("student views never contain answer keys, solutions or hidden cases", async () => {
    const { student, assessment, mcq, coding } = await setup({ resultPolicy: "MANUAL" });
    const attempt = await startAttempt(student.id, assessment.id);
    const view = await getStudentAttempt(student.id, attempt.id);
    const json = JSON.stringify(view);
    expect(json).not.toContain("4071"); // hidden input
    expect(json).not.toContain("4073"); // hidden expected output
    expect(json).not.toContain("9123");
    expect(json).not.toContain("B is right"); // solution
    expect(json).not.toContain("correctOptionIds\":[\"b");
    const q = view.questions.find((x) => x.question.id === coding.id)!.question;
    expect(q.samples).toEqual([{ input: "1 2\n", expectedOutput: "3\n" }]);
    expect(q.hiddenCaseCount).toBe(2);

    // After grading but before release, the score is still hidden.
    await saveAnswer(student.id, attempt.id, mcq.id, { selectedOptionIds: ["b"] });
    await submitAttempt(student.id, attempt.id);
    const after = await getStudentAttempt(student.id, attempt.id);
    expect(after.resultsVisible).toBe(false);
    expect(after.attempt.score).toBeNull();
  });

  it("another student cannot open someone else's attempt", async () => {
    const { student, assessment, batch } = await setup();
    const other = await makeUser("STUDENT", "Other");
    await enrol(other.id, batch.id);
    const attempt = await startAttempt(student.id, assessment.id);
    await expect(getStudentAttempt(other.id, attempt.id)).rejects.toMatchObject({ status: 404 });
    await expect(saveAnswer(other.id, attempt.id, "x", {})).rejects.toMatchObject({ status: 404 });
    await expect(submitAttempt(other.id, attempt.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("publishing and versions", () => {
  it("publishing makes a test visible to targeted students only and freezes questions (workflow 3)", async () => {
    const admin = await makeUser("ADMIN");
    const inBatch = await makeUser("STUDENT", "In");
    const outside = await makeUser("STUDENT", "Out");
    const b1 = await makeBatch(admin.id);
    const b2 = await makeBatch(admin.id);
    await enrol(inBatch.id, b1.id);
    await enrol(outside.id, b2.id);
    const now = Date.now();
    const a = await createAssessment(admin.id, {
      title: "Weekly 1",
      instructions: "",
      kind: "WEEKLY",
      opensAt: new Date(now - minutes(1)),
      closesAt: new Date(now + minutes(120)),
      durationMinutes: 45,
      maxAttempts: 1,
      passPercent: 40,
      randomizeQuestions: true,
      resultPolicy: "MANUAL",
      solutionPolicy: "NEVER",
      helpPolicy: "NO_HELP_WHILE_OPEN",
      batchIds: [b1.id],
      studentIds: [],
    });
    await upsertQuestion(admin.id, a.id, null, {
      type: "MCQ_SINGLE",
      topic: "HTML",
      prompt: "Q",
      marks: 1,
      options: [{ id: "x", text: "X" }, { id: "y", text: "Y" }],
      correctOptionIds: ["x"],
      solution: null,
      inputFormat: null,
      outputFormat: null,
      constraints: null,
      starterCode: {},
      allowedLanguages: [],
      timeLimitMs: null,
      memoryLimitKb: null,
      scoring: null,
      cases: [],
    });
    await expect(startAttempt(inBatch.id, a.id)).rejects.toMatchObject({ status: 404 }); // still a draft
    await publishAssessment(admin.id, a.id, null);
    const n = await prisma.notification.findMany({ where: { type: "TEST_PUBLISHED" } });
    expect(n.map((x) => x.userId)).toEqual([inBatch.id]);
    await notifyAssessmentPublished(a.id); // idempotent
    expect(await prisma.notification.count({ where: { type: "TEST_PUBLISHED" } })).toBe(1);

    const attempt = await startAttempt(inBatch.id, a.id);
    expect(attempt).toBeTruthy();
    await expect(startAttempt(outside.id, a.id)).rejects.toMatchObject({ status: 404 });

    // Frozen: editing a published version is refused; a revision does not change the running attempt.
    await expect(
      upsertQuestion(admin.id, a.id, null, { type: "SHORT_ANSWER", topic: "x", prompt: "y", marks: 1, options: [], correctOptionIds: [], solution: null, inputFormat: null, outputFormat: null, constraints: null, starterCode: {}, allowedLanguages: [], timeLimitMs: null, memoryLimitKb: null, scoring: null, cases: [] }),
    ).rejects.toMatchObject({ status: 409 });
    await createRevision(admin.id, a.id);
    await upsertQuestion(admin.id, a.id, null, { type: "SHORT_ANSWER", topic: "x", prompt: "new", marks: 1, options: [], correctOptionIds: [], solution: null, inputFormat: null, outputFormat: null, constraints: null, starterCode: {}, allowedLanguages: [], timeLimitMs: null, memoryLimitKb: null, scoring: null, cases: [] });
    await publishRevision(admin.id, a.id);
    const view = await getStudentAttempt(inBatch.id, attempt.id);
    expect(view.questions).toHaveLength(1);
  });

  it("scheduled publication stays hidden until its time", async () => {
    const { admin, student, batch } = await setup();
    const now = Date.now();
    const a = await createAssessment(admin.id, {
      title: "Later",
      instructions: "",
      kind: "PRACTICE",
      opensAt: new Date(now + minutes(60)),
      closesAt: new Date(now + minutes(180)),
      durationMinutes: 20,
      maxAttempts: 1,
      passPercent: null,
      randomizeQuestions: false,
      resultPolicy: "MANUAL",
      solutionPolicy: "NEVER",
      helpPolicy: "NO_HELP_WHILE_OPEN",
      batchIds: [batch.id],
      studentIds: [],
    });
    await upsertQuestion(admin.id, a.id, null, { type: "SHORT_ANSWER", topic: "x", prompt: "y", marks: 1, options: [], correctOptionIds: [], solution: null, inputFormat: null, outputFormat: null, constraints: null, starterCode: {}, allowedLanguages: [], timeLimitMs: null, memoryLimitKb: null, scoring: null, cases: [] });
    await publishAssessment(admin.id, a.id, new Date(now + minutes(30)));
    await expect(startAttempt(student.id, a.id)).rejects.toMatchObject({ status: 404 });
    expect(await prisma.notification.count({ where: { type: "TEST_PUBLISHED" } })).toBe(0);
  });
});
