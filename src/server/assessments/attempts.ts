import { randomInt } from "node:crypto";
import { Prisma, type AttemptAnswer, type Question } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getVisibleAssessment, isAssessmentOpen } from "@/server/access";
import { AppError, conflict, invalid, notFound } from "@/server/errors";
import { enqueue, QUEUES } from "@/server/queue";
import { gradeMcq, notifyVisibleResults, recomputeAttempt } from "./grading";
import { computeDeadline, resultsVisible, solutionsVisible } from "./lifecycle";

const MAX_TEXT = 10_000;
const MAX_CODE = 100_000;

export class DeadlinePassedError extends AppError {
  constructor() {
    super("Time is up for this attempt. Your saved answers have been submitted.", 409, "DEADLINE_PASSED");
  }
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function latestLockedVersion(assessmentId: string) {
  return prisma.assessmentVersion.findFirst({
    where: { assessmentId, lockedAt: { not: null } },
    orderBy: { number: "desc" },
    include: { questions: { select: { id: true, marks: true, order: true }, orderBy: { order: "asc" } } },
  });
}

/**
 * Starts (or resumes) an attempt. Idempotent: refreshing or double-clicking returns the same
 * in-progress attempt; the unique (assessment, student, number) constraint blocks duplicates.
 */
export async function startAttempt(studentId: string, assessmentId: string, now = new Date()) {
  const assessment = await getVisibleAssessment(studentId, assessmentId);

  const inProgress = await prisma.attempt.findFirst({ where: { assessmentId, studentId, status: "IN_PROGRESS" } });
  if (inProgress) {
    if (now < inProgress.deadlineAt) return inProgress;
    await finalizeAttempt(inProgress.id, "SYSTEM", now);
  }

  if (!isAssessmentOpen(assessment, now)) {
    throw new AppError(now < assessment.opensAt ? "This test has not opened yet." : "This test is closed.", 409, "NOT_OPEN");
  }
  const used = await prisma.attempt.count({ where: { assessmentId, studentId } });
  if (used >= assessment.maxAttempts) throw conflict("You have used all allowed attempts for this test.");

  const version = await latestLockedVersion(assessmentId);
  if (!version || version.questions.length === 0) throw conflict("This test is not ready yet. Please contact your trainer.");

  const order = version.questions.map((q) => q.id);
  const questionOrder = assessment.randomizeQuestions ? shuffle(order) : order;
  const maxScore = version.questions.reduce((s, q) => s + q.marks, 0);
  const deadlineAt = computeDeadline(now, assessment.durationMinutes, assessment.closesAt);

  try {
    const attempt = await prisma.attempt.create({
      data: {
        assessmentId,
        versionId: version.id,
        studentId,
        number: used + 1,
        startedAt: now,
        deadlineAt,
        questionOrder,
        maxScore,
      },
    });
    // Finalise exactly at the deadline even if the browser is closed (the sweep is a backup).
    await enqueue(QUEUES.finalizeAttempt, { attemptId: attempt.id }, deadlineAt);
    return attempt;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await prisma.attempt.findFirst({ where: { assessmentId, studentId, status: "IN_PROGRESS" } });
      if (again) return again;
    }
    throw e;
  }
}

async function ownedAttempt(studentId: string, attemptId: string) {
  const attempt = await prisma.attempt.findFirst({ where: { id: attemptId, studentId } });
  if (!attempt) throw notFound("Attempt");
  return attempt;
}

export type AnswerPayload = {
  selectedOptionIds?: string[];
  textAnswer?: string;
  code?: string;
  languageKey?: string;
};

function validatePayload(q: Pick<Question, "type" | "options" | "allowedLanguages">, p: AnswerPayload) {
  const data: Prisma.AttemptAnswerUncheckedUpdateInput = {};
  if (q.type === "MCQ_SINGLE" || q.type === "MCQ_MULTI") {
    const ids = [...new Set(p.selectedOptionIds ?? [])];
    const valid = new Set(((q.options as { id: string }[] | null) ?? []).map((o) => o.id));
    if (ids.some((id) => !valid.has(id))) throw invalid("Unknown option selected.");
    if (q.type === "MCQ_SINGLE" && ids.length > 1) throw invalid("Select only one option.");
    data.selectedOptionIds = ids;
  } else if (q.type === "SHORT_ANSWER") {
    const t = p.textAnswer ?? "";
    if (t.length > MAX_TEXT) throw invalid(`Answers are limited to ${MAX_TEXT} characters.`);
    data.textAnswer = t;
  } else {
    const code = p.code ?? "";
    if (code.length > MAX_CODE) throw invalid("Code is too long.");
    if (p.languageKey && q.allowedLanguages.length && !q.allowedLanguages.includes(p.languageKey)) {
      throw invalid("That language is not allowed for this question.");
    }
    data.code = code;
    if (p.languageKey) data.languageKey = p.languageKey;
  }
  return data;
}

/** Autosave a single answer. Rejected after the server deadline. Returns the acknowledged revision. */
export async function saveAnswer(studentId: string, attemptId: string, questionId: string, payload: AnswerPayload, now = new Date()) {
  const attempt = await ownedAttempt(studentId, attemptId);
  if (attempt.status !== "IN_PROGRESS") throw new AppError("This attempt has already been submitted.", 409, "ALREADY_SUBMITTED");
  if (now >= attempt.deadlineAt) {
    await finalizeAttempt(attempt.id, "SYSTEM", now);
    throw new DeadlinePassedError();
  }
  if (!attempt.questionOrder.includes(questionId)) throw notFound("Question");
  const q = await prisma.question.findFirst({
    where: { id: questionId, versionId: attempt.versionId },
    select: { type: true, options: true, allowedLanguages: true },
  });
  if (!q) throw notFound("Question");
  const data = validatePayload(q, payload);

  // Guard the write with the in-progress status so a concurrent finalisation wins cleanly.
  const saved = await prisma.$transaction(async (tx) => {
    const still = await tx.attempt.count({ where: { id: attemptId, status: "IN_PROGRESS", deadlineAt: { gt: now } } });
    if (!still) throw new DeadlinePassedError();
    return tx.attemptAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      create: { ...(data as Prisma.AttemptAnswerUncheckedCreateInput), attemptId, questionId, revision: 1, savedAt: now },
      update: { ...data, revision: { increment: 1 }, savedAt: now },
      select: { revision: true, savedAt: true },
    });
  });
  return saved;
}

/** Student submits. Duplicate requests return the same finalised attempt. */
export async function submitAttempt(studentId: string, attemptId: string, now = new Date()) {
  await ownedAttempt(studentId, attemptId);
  return finalizeAttempt(attemptId, "STUDENT", now);
}

/**
 * Finalises an attempt exactly once (guarded conditional update), grades MCQs inline,
 * queues written answers for review and coding answers for the grading worker.
 */
export async function finalizeAttempt(attemptId: string, by: "STUDENT" | "SYSTEM", now = new Date()) {
  const outcome = await prisma.$transaction(async (tx) => {
    const att = await tx.attempt.findUnique({ where: { id: attemptId } });
    if (!att) throw notFound("Attempt");
    if (att.status !== "IN_PROGRESS") return { attempt: att, jobIds: [] as string[], finalized: false };
    const expired = now >= att.deadlineAt;
    if (by === "SYSTEM" && !expired) return { attempt: att, jobIds: [] as string[], finalized: false };

    const upd = await tx.attempt.updateMany({
      where: { id: attemptId, status: "IN_PROGRESS" },
      data: {
        status: expired ? "AUTO_SUBMITTED" : "SUBMITTED",
        submittedAt: expired ? att.deadlineAt : now,
        gradingStatus: "AWAITING_GRADING",
      },
    });
    if (upd.count === 0) return { attempt: att, jobIds: [] as string[], finalized: false };

    const questions = await tx.question.findMany({ where: { versionId: att.versionId } });
    const answers = await tx.attemptAnswer.findMany({ where: { attemptId } });
    const byQ = new Map<string, AttemptAnswer>(answers.map((a) => [a.questionId, a]));
    const jobIds: string[] = [];

    for (const q of questions) {
      let ans = byQ.get(q.id);
      if (!ans) ans = await tx.attemptAnswer.create({ data: { attemptId, questionId: q.id } });
      if (q.type === "MCQ_SINGLE" || q.type === "MCQ_MULTI") {
        const empty = ans.selectedOptionIds.length === 0;
        await tx.attemptAnswer.update({
          where: { id: ans.id },
          data: {
            gradeStatus: empty ? "UNANSWERED" : "AUTO_GRADED",
            marksAwarded: empty ? 0 : gradeMcq(ans.selectedOptionIds, q.correctOptionIds, q.marks),
            gradedAt: now,
          },
        });
      } else if (q.type === "SHORT_ANSWER") {
        const empty = !(ans.textAnswer ?? "").trim();
        await tx.attemptAnswer.update({
          where: { id: ans.id },
          data: empty ? { gradeStatus: "UNANSWERED", marksAwarded: 0, gradedAt: now } : { gradeStatus: "NEEDS_REVIEW" },
        });
      } else {
        const empty = !(ans.code ?? "").trim() || !ans.languageKey;
        if (empty) {
          await tx.attemptAnswer.update({ where: { id: ans.id }, data: { gradeStatus: "UNANSWERED", marksAwarded: 0, gradedAt: now } });
        } else {
          await tx.attemptAnswer.update({ where: { id: ans.id }, data: { gradeStatus: "PENDING" } });
          const job = await tx.gradingJob.upsert({ where: { answerId: ans.id }, create: { answerId: ans.id }, update: {} });
          jobIds.push(job.id);
        }
      }
    }
    await recomputeAttempt(attemptId, tx);
    const attempt = await tx.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    return { attempt, jobIds, finalized: true };
  });

  for (const jobId of outcome.jobIds) await enqueue(QUEUES.gradeCode, { jobId });
  if (outcome.finalized) await notifyVisibleResults(outcome.attempt.assessmentId);
  return outcome.attempt;
}

/** Worker sweep: finalises every attempt whose deadline has passed. */
export async function sweepExpiredAttempts(now = new Date()) {
  const expired = await prisma.attempt.findMany({
    where: { status: "IN_PROGRESS", deadlineAt: { lte: now } },
    select: { id: true },
    take: 200,
  });
  for (const a of expired) await finalizeAttempt(a.id, "SYSTEM", now);
  return expired.length;
}

// ── Student-facing views (no secrets) ──────────────────────────

type Option = { id: string; text: string };

/** Question as shown to a student. Hidden cases, answer keys and solutions are never included. */
export function studentQuestionView(
  q: Question & { cases: { isSample: boolean; input: string; expectedOutput: string; order: number }[] },
  opts: { includeSolution: boolean },
) {
  return {
    id: q.id,
    type: q.type,
    topic: q.topic,
    prompt: q.prompt,
    marks: q.marks,
    options: q.type === "MCQ_SINGLE" || q.type === "MCQ_MULTI" ? ((q.options as Option[] | null) ?? []) : [],
    inputFormat: q.inputFormat,
    outputFormat: q.outputFormat,
    constraints: q.constraints,
    starterCode: (q.starterCode as Record<string, string> | null) ?? {},
    allowedLanguages: q.allowedLanguages,
    timeLimitMs: q.timeLimitMs,
    memoryLimitKb: q.memoryLimitKb,
    samples: q.cases
      .filter((c) => c.isSample)
      .sort((a, b) => a.order - b.order)
      .map((c) => ({ input: c.input, expectedOutput: c.expectedOutput })),
    hiddenCaseCount: q.cases.filter((c) => !c.isSample).length,
    correctOptionIds: opts.includeSolution ? q.correctOptionIds : undefined,
    solution: opts.includeSolution ? q.solution : undefined,
  };
}

export type StudentQuestionView = ReturnType<typeof studentQuestionView>;

/** Everything the attempt page needs, shaped for the student. */
export async function getStudentAttempt(studentId: string, attemptId: string, now = new Date()) {
  let attempt = await ownedAttempt(studentId, attemptId);
  if (attempt.status === "IN_PROGRESS" && now >= attempt.deadlineAt) {
    attempt = await finalizeAttempt(attempt.id, "SYSTEM", now);
  }
  const assessment = await prisma.assessment.findUniqueOrThrow({ where: { id: attempt.assessmentId } });
  const showResult = resultsVisible(assessment, attempt, now);
  const showSolution = solutionsVisible(assessment, attempt, now);
  const questions = await prisma.question.findMany({
    where: { versionId: attempt.versionId },
    include: { cases: { select: { isSample: true, input: true, expectedOutput: true, order: true } } },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));
  const answers = await prisma.attemptAnswer.findMany({
    where: { attemptId },
    include: { caseResults: { include: { case: { select: { isSample: true, order: true } } } } },
  });
  const answerBy = new Map(answers.map((a) => [a.questionId, a]));

  return {
    attempt: {
      id: attempt.id,
      number: attempt.number,
      status: attempt.status,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      submittedAt: attempt.submittedAt,
      gradingStatus: attempt.gradingStatus,
      score: showResult ? attempt.score : null,
      maxScore: attempt.maxScore,
    },
    assessment: {
      id: assessment.id,
      title: assessment.title,
      instructions: assessment.instructions,
      kind: assessment.kind,
      passPercent: assessment.passPercent,
      helpPolicy: assessment.helpPolicy,
      closesAt: assessment.closesAt,
    },
    resultsVisible: showResult,
    serverNow: now,
    questions: attempt.questionOrder
      .map((id) => byId.get(id))
      .filter((q): q is NonNullable<typeof q> => Boolean(q))
      .map((q) => {
        const a = answerBy.get(q.id);
        const sampleResults = (a?.caseResults ?? []).filter((r) => r.case.isSample);
        const hiddenResults = (a?.caseResults ?? []).filter((r) => !r.case.isSample);
        return {
          question: studentQuestionView(q, { includeSolution: showSolution }),
          answer: {
            selectedOptionIds: a?.selectedOptionIds ?? [],
            textAnswer: a?.textAnswer ?? "",
            code: a?.code ?? "",
            languageKey: a?.languageKey ?? null,
            revision: a?.revision ?? 0,
            savedAt: a?.savedAt ?? null,
          },
          result: showResult
            ? {
                gradeStatus: a?.gradeStatus ?? "UNANSWERED",
                marksAwarded: a?.marksAwarded ?? 0,
                feedback: a?.feedback ?? null,
                samples: sampleResults
                  .sort((x, y) => x.case.order - y.case.order)
                  .map((r) => ({ outcome: r.outcome, stdoutPreview: r.stdoutPreview })),
                // Hidden cases: only counts, never inputs or outputs.
                hiddenPassed: hiddenResults.filter((r) => r.outcome === "PASSED").length,
                hiddenTotal: q.cases.filter((c) => !c.isSample).length,
              }
            : { gradeStatus: a?.gradeStatus === "EXECUTION_ERROR" ? "EXECUTION_ERROR" : null },
        };
      }),
  };
}
