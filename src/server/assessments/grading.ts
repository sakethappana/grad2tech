import type { AnswerGradeStatus, AttemptGradingStatus, CaseOutcome } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { audit } from "@/server/audit";
import { AppError, invalid, notFound } from "@/server/errors";
import { ExecutionUnavailableError, normalizeOutput, refineOutcome, runAndWait } from "@/server/execution";
import { notify } from "@/server/notifications";
import { enqueue, QUEUES } from "@/server/queue";
import { resultsVisible } from "./lifecycle";

export const MAX_GRADING_TRIES = 4;
const STALE_RUNNING_MS = 10 * 60_000;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** MCQ grading: full marks only for an exactly correct selection. */
export function gradeMcq(selected: string[], correct: string[], marks: number): number {
  const a = [...new Set(selected)].sort();
  const b = [...new Set(correct)].sort();
  return a.length === b.length && a.every((v, i) => v === b[i]) ? marks : 0;
}

/** Coding score from per-case results. */
export function scoreCoding(
  scoring: "ALL_OR_NOTHING" | "PROPORTIONAL",
  marks: number,
  cases: { weight: number; passed: boolean }[],
): number {
  if (cases.length === 0) return 0;
  if (scoring === "ALL_OR_NOTHING") return cases.every((c) => c.passed) ? marks : 0;
  const total = cases.reduce((s, c) => s + c.weight, 0);
  if (total <= 0) return 0;
  const passed = cases.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0);
  return round2((marks * passed) / total);
}

const GRADED: AnswerGradeStatus[] = ["AUTO_GRADED", "REVIEWED", "UNANSWERED"];

/** Recomputes the attempt's grading status and score from its answers. */
export async function recomputeAttempt(attemptId: string, tx?: Tx) {
  const db = tx ?? prisma;
  const attempt = await db.attempt.findUnique({
    where: { id: attemptId },
    select: { id: true, status: true, answers: { select: { gradeStatus: true, marksAwarded: true } } },
  });
  if (!attempt || attempt.status === "IN_PROGRESS") return null;
  const answers = attempt.answers;
  const graded = answers.filter((a) => GRADED.includes(a.gradeStatus));
  let gradingStatus: AttemptGradingStatus;
  if (graded.length === answers.length) gradingStatus = "GRADED";
  else if (graded.some((a) => a.gradeStatus !== "UNANSWERED")) gradingStatus = "PARTIALLY_GRADED";
  else gradingStatus = graded.length > 0 ? "PARTIALLY_GRADED" : "AWAITING_GRADING";
  const score = round2(graded.reduce((s, a) => s + (a.marksAwarded ?? 0), 0));
  await db.attempt.update({ where: { id: attemptId }, data: { gradingStatus, score } });
  return { gradingStatus, score };
}

/** Sends "result released" notifications for every attempt whose result has become visible. */
export async function notifyVisibleResults(assessmentId: string, now = new Date()) {
  const a = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, title: true, resultPolicy: true, resultsReleasedAt: true, closesAt: true },
  });
  if (!a) return 0;
  const attempts = await prisma.attempt.findMany({
    where: { assessmentId, status: { not: "IN_PROGRESS" }, gradingStatus: "GRADED" },
    select: { id: true, studentId: true, status: true, gradingStatus: true },
  });
  let count = 0;
  for (const at of attempts) {
    if (!resultsVisible(a, at, now)) continue;
    count += await notify([at.studentId], {
      type: "RESULT_RELEASED",
      title: `Result released: ${a.title}`,
      link: `/portal/student/tests/${a.id}/attempts/${at.id}`,
      dedupeKey: `result:${at.id}`,
    });
  }
  return count;
}

/**
 * Processes one coding grading job. Safe to call repeatedly: the job is claimed with a
 * conditional update, and finished case results are reused, so retries never double-grade.
 * Runner failures mark the answer EXECUTION_ERROR (not wrong) and are retried.
 */
export async function processGradingJob(jobId: string, now = new Date()): Promise<"done" | "skipped" | "retry"> {
  const claimed = await prisma.gradingJob.updateMany({
    where: {
      id: jobId,
      tries: { lt: MAX_GRADING_TRIES },
      OR: [
        { status: "QUEUED" },
        { status: "FAILED" },
        { status: "RUNNING", startedAt: { lt: new Date(now.getTime() - STALE_RUNNING_MS) } },
      ],
    },
    data: { status: "RUNNING", startedAt: now, tries: { increment: 1 } },
  });
  if (claimed.count === 0) return "skipped";

  const job = await prisma.gradingJob.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      answer: {
        include: {
          question: { include: { cases: { orderBy: { order: "asc" } } } },
          caseResults: true,
          attempt: { select: { id: true, assessmentId: true } },
        },
      },
    },
  });
  const { answer } = job;
  const q = answer.question;
  const memoryLimitKb = q.memoryLimitKb ?? 256000;
  const cpu = Math.max(0.5, (q.timeLimitMs ?? 2000) / 1000);
  const existing = new Map(answer.caseResults.map((r) => [r.caseId, r]));

  try {
    let compileFailed = false;
    for (const c of q.cases) {
      const prior = existing.get(c.id);
      if (prior && prior.outcome !== "EXECUTION_ERROR") continue;
      let outcome: CaseOutcome;
      let timeMs: number | null = null;
      let memoryKb: number | null = null;
      let stdoutPreview: string | null = null;
      if (compileFailed) {
        outcome = "COMPILE_ERROR";
      } else {
        const raw = await runAndWait({
          languageKey: answer.languageKey ?? "",
          source: answer.code ?? "",
          stdin: c.input,
          cpuTimeLimitS: cpu,
          wallTimeLimitS: Math.max(cpu * 3, cpu + 2),
          memoryLimitKb,
        });
        const r = refineOutcome(raw, memoryLimitKb);
        timeMs = r.timeMs;
        memoryKb = r.memoryKb;
        if (r.outcome === "SERVICE_ERROR") throw new ExecutionUnavailableError();
        if (r.outcome === "OK") {
          outcome = normalizeOutput(r.stdout) === normalizeOutput(c.expectedOutput) ? "PASSED" : "WRONG_ANSWER";
        } else if (r.outcome === "COMPILE_ERROR") {
          outcome = "COMPILE_ERROR";
          compileFailed = true;
        } else if (r.outcome === "TIME_LIMIT") outcome = "TIME_LIMIT";
        else if (r.outcome === "MEMORY_LIMIT") outcome = "MEMORY_LIMIT";
        else outcome = "RUNTIME_ERROR";
        // Output is kept only for visible sample cases. Hidden inputs/outputs never leave the server.
        if (c.isSample) stdoutPreview = r.stdout.slice(0, 2000);
      }
      await prisma.codeCaseResult.upsert({
        where: { answerId_caseId: { answerId: answer.id, caseId: c.id } },
        create: { answerId: answer.id, caseId: c.id, outcome, timeMs, memoryKb, stdoutPreview },
        update: { outcome, timeMs, memoryKb, stdoutPreview },
      });
    }

    const results = await prisma.codeCaseResult.findMany({ where: { answerId: answer.id } });
    const byCase = new Map(results.map((r) => [r.caseId, r.outcome]));
    const marks = scoreCoding(
      q.scoring ?? "PROPORTIONAL",
      q.marks,
      q.cases.map((c) => ({ weight: c.weight, passed: byCase.get(c.id) === "PASSED" })),
    );
    await prisma.$transaction(async (tx) => {
      // Do not overwrite a trainer's manual review.
      await tx.attemptAnswer.updateMany({
        where: { id: answer.id, gradeStatus: { not: "REVIEWED" } },
        data: { gradeStatus: "AUTO_GRADED", marksAwarded: marks, gradedAt: new Date() },
      });
      await tx.gradingJob.update({ where: { id: jobId }, data: { status: "SUCCEEDED", finishedAt: new Date(), lastError: null } });
      await recomputeAttempt(answer.attempt.id, tx);
    });
    await notifyVisibleResults(answer.attempt.assessmentId);
    return "done";
  } catch (e) {
    const unavailable = e instanceof ExecutionUnavailableError;
    const message = unavailable ? e.message : "Unexpected grading error";
    if (!unavailable) console.error("[grading] job failed:", jobId, e instanceof Error ? e.message : e);
    await prisma.$transaction(async (tx) => {
      await tx.attemptAnswer.updateMany({
        where: { id: answer.id, gradeStatus: { not: "REVIEWED" } },
        data: { gradeStatus: "EXECUTION_ERROR" },
      });
      await tx.gradingJob.update({ where: { id: jobId }, data: { status: "FAILED", lastError: message.slice(0, 300) } });
      await recomputeAttempt(answer.attempt.id, tx);
    });
    return "retry";
  }
}

/** Admin: queue a failed (or any) coding answer for grading again. */
export async function retryGrading(adminId: string, answerId: string) {
  const job = await prisma.gradingJob.findUnique({ where: { answerId } });
  if (!job) throw notFound("Grading job");
  await prisma.$transaction(async (tx) => {
    await tx.gradingJob.update({ where: { id: job.id }, data: { status: "QUEUED", tries: 0, lastError: null } });
    await tx.attemptAnswer.updateMany({ where: { id: answerId, gradeStatus: "EXECUTION_ERROR" }, data: { gradeStatus: "PENDING" } });
    await audit({ actorId: adminId, action: "attempt.regrade_requested", entityType: "AttemptAnswer", entityId: answerId }, tx);
  });
  await enqueue(QUEUES.gradeCode, { jobId: job.id });
}

/** Admin: manual marks for any answer (written answers, or overriding automatic grading). */
export async function gradeAnswerManually(adminId: string, answerId: string, marks: number, feedback: string | null) {
  const answer = await prisma.attemptAnswer.findUnique({
    where: { id: answerId },
    include: { question: { select: { marks: true } }, attempt: { select: { id: true, status: true, assessmentId: true } } },
  });
  if (!answer) throw notFound("Answer");
  if (answer.attempt.status === "IN_PROGRESS") throw new AppError("This attempt is still in progress.", 409, "CONFLICT");
  if (!Number.isFinite(marks) || marks < 0 || marks > answer.question.marks) {
    throw invalid(`Marks must be between 0 and ${answer.question.marks}.`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.attemptAnswer.update({
      where: { id: answerId },
      data: { marksAwarded: marks, feedback: feedback || null, gradeStatus: "REVIEWED", gradedById: adminId, gradedAt: new Date() },
    });
    await audit(
      {
        actorId: adminId,
        action: "attempt.answer_graded",
        entityType: "AttemptAnswer",
        entityId: answerId,
        metadata: { previousMarks: answer.marksAwarded, marks, previousStatus: answer.gradeStatus },
      },
      tx,
    );
    await recomputeAttempt(answer.attempt.id, tx);
  });
  await notifyVisibleResults(answer.attempt.assessmentId);
}
