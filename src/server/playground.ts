import { z } from "zod";
import type { CodeRun } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError, invalid, notFound, tooMany, unavailable } from "@/server/errors";
import { executionProvider, ExecutionUnavailableError, refineOutcome, type ExecLanguage } from "@/server/execution";

export const runSchema = z.object({
  languageKey: z.string().min(1, "Choose a language"),
  code: z.string().min(1, "Write some code first").max(100_000, "Code is too long"),
  stdin: z.string().max(100_000, "Input is too long").default(""),
  attemptId: z.string().nullable().default(null),
  questionId: z.string().nullable().default(null),
});

export type LanguagesResult = { configured: boolean; languages: ExecLanguage[]; error?: string };

/** Languages offered to students, discovered from the provider (never hard-coded). */
export async function availableLanguages(): Promise<LanguagesResult> {
  const p = executionProvider();
  if (!p.configured()) return { configured: false, languages: [], error: "Code execution is not configured yet." };
  try {
    return { configured: true, languages: await p.languages() };
  } catch (e) {
    return { configured: true, languages: [], error: e instanceof ExecutionUnavailableError ? e.message : "The code runner is unavailable." };
  }
}

export async function saveDraft(userId: string, languageKey: string, code: string, stdin: string) {
  if (code.length > 100_000 || stdin.length > 100_000) throw invalid("Draft is too large.");
  await prisma.codeDraft.upsert({
    where: { userId_languageKey: { userId, languageKey } },
    create: { userId, languageKey, code, stdin },
    update: { code, stdin },
  });
}

async function enforceQuota(userId: string, now: Date) {
  const e = env();
  const [inFlight, lastMinute, lastDay] = await Promise.all([
    prisma.codeRun.count({ where: { userId, status: { in: ["QUEUED", "RUNNING"] }, createdAt: { gt: new Date(now.getTime() - 2 * 60_000) } } }),
    prisma.codeRun.count({ where: { userId, createdAt: { gt: new Date(now.getTime() - 60_000) } } }),
    prisma.codeRun.count({ where: { userId, createdAt: { gt: new Date(now.getTime() - 86_400_000) } } }),
  ]);
  if (inFlight >= e.RUN_MAX_CONCURRENT) throw tooMany("Wait for your current run to finish before starting another.");
  if (lastMinute >= e.RUN_MAX_PER_MINUTE) throw tooMany("You're running code very quickly. Please wait a minute and try again.");
  if (lastDay >= e.RUN_MAX_PER_DAY) throw tooMany("You've reached today's run limit. It resets within 24 hours.");
}

/** Starts a run on the isolated execution service. Student code never runs on the web server. */
export async function startRun(userId: string, input: z.infer<typeof runSchema>, now = new Date()) {
  const p = executionProvider();
  if (!p.configured()) throw unavailable("Code execution is not configured yet. Ask an admin to connect the code runner.");

  let purpose: "PLAYGROUND" | "ASSESSMENT_PRACTICE" = "PLAYGROUND";
  let cpu = env().RUN_CPU_TIME_LIMIT_S;
  let memory = env().RUN_MEMORY_LIMIT_KB;
  if (input.attemptId) {
    // Practice runs inside a test: only the student's own in-progress attempt, allowed languages only.
    const attempt = await prisma.attempt.findFirst({ where: { id: input.attemptId, studentId: userId, status: "IN_PROGRESS", deadlineAt: { gt: now } } });
    if (!attempt) throw notFound("Attempt");
    const q = input.questionId
      ? await prisma.question.findFirst({ where: { id: input.questionId, versionId: attempt.versionId, type: "CODING" } })
      : null;
    if (!q) throw notFound("Question");
    if (q.allowedLanguages.length && !q.allowedLanguages.includes(input.languageKey)) throw invalid("That language is not allowed for this question.");
    purpose = "ASSESSMENT_PRACTICE";
    cpu = (q.timeLimitMs ?? 2000) / 1000;
    memory = q.memoryLimitKb ?? memory;
  }

  let languages: ExecLanguage[];
  try {
    languages = await p.languages();
  } catch (e) {
    throw unavailable(e instanceof Error ? e.message : "The code runner is unavailable.");
  }
  const lang = languages.find((l) => l.key === input.languageKey);
  if (!lang) throw invalid("That language is not available.");

  await enforceQuota(userId, now);
  const run = await prisma.codeRun.create({
    data: {
      userId,
      purpose,
      attemptId: input.attemptId,
      languageKey: lang.key,
      languageLabel: lang.name,
      sourceCode: input.code,
      stdin: input.stdin,
      status: "QUEUED",
    },
  });
  try {
    const token = await p.submit({
      languageKey: lang.key,
      source: input.code,
      stdin: input.stdin,
      cpuTimeLimitS: cpu,
      wallTimeLimitS: Math.max(env().RUN_WALL_TIME_LIMIT_S, cpu * 2),
      memoryLimitKb: memory,
    });
    return prisma.codeRun.update({ where: { id: run.id }, data: { status: "RUNNING", providerToken: token } });
  } catch (e) {
    const message = e instanceof ExecutionUnavailableError ? e.message : "The code runner is unavailable right now.";
    return prisma.codeRun.update({ where: { id: run.id }, data: { status: "SERVICE_ERROR", errorMessage: message, finishedAt: new Date() } });
  }
}

const RUN_TIMEOUT_MS = 90_000;

/** Polls the provider for a running job and stores the result. Owner-only. */
export async function refreshRun(userId: string, runId: string, now = new Date()): Promise<CodeRun> {
  const run = await prisma.codeRun.findFirst({ where: { id: runId, userId } });
  if (!run) throw notFound("Run");
  if (run.status !== "RUNNING" || !run.providerToken) return run;
  if (now.getTime() - run.createdAt.getTime() > RUN_TIMEOUT_MS) {
    return prisma.codeRun.update({
      where: { id: run.id },
      data: { status: "SERVICE_ERROR", errorMessage: "The code runner did not respond in time. Please try again.", finishedAt: now },
    });
  }
  try {
    const polled = await executionProvider().poll(run.providerToken);
    if (!polled.done) return run;
    const r = refineOutcome(polled.result, env().RUN_MEMORY_LIMIT_KB);
    const serviceError = r.outcome === "SERVICE_ERROR";
    // A conditional update keeps a concurrent cancel from being overwritten.
    await prisma.codeRun.updateMany({
      where: { id: run.id, status: "RUNNING" },
      data: {
        status: serviceError ? "SERVICE_ERROR" : "COMPLETED",
        verdict: r.verdict,
        stdout: r.stdout,
        stderr: r.stderr,
        compileOutput: r.compileOutput,
        exitCode: r.exitCode,
        timeMs: r.timeMs,
        memoryKb: r.memoryKb,
        errorMessage: serviceError ? "The code runner had an internal error. This is not a problem with your code — please run it again." : null,
        finishedAt: now,
      },
    });
    return prisma.codeRun.findUniqueOrThrow({ where: { id: run.id } });
  } catch (e) {
    if (e instanceof ExecutionUnavailableError) {
      // Transient: keep it running; the client keeps polling until the timeout above.
      return run;
    }
    throw e;
  }
}

/**
 * Stops waiting for a run. Judge0 has no reliable cancel for an executing sandbox, so the
 * process itself is stopped by its CPU and wall-clock limits.
 */
export async function cancelRun(userId: string, runId: string) {
  const res = await prisma.codeRun.updateMany({
    where: { id: runId, userId, status: { in: ["QUEUED", "RUNNING"] } },
    data: { status: "CANCELLED", finishedAt: new Date() },
  });
  if (res.count === 0) throw new AppError("This run has already finished.", 409, "CONFLICT");
}

export async function runHistory(userId: string, limit = 20) {
  return prisma.codeRun.findMany({
    where: { userId, purpose: "PLAYGROUND" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, languageLabel: true, status: true, verdict: true, timeMs: true, memoryKb: true, createdAt: true },
  });
}

/** Retention: drop runs older than RUN_HISTORY_DAYS and keep only the newest RUN_HISTORY_KEEP per user. */
export async function cleanupRuns(now = new Date()) {
  const e = env();
  const old = await prisma.codeRun.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - e.RUN_HISTORY_DAYS * 86_400_000) } } });
  const users = await prisma.codeRun.groupBy({ by: ["userId"], _count: { _all: true }, having: { userId: { _count: { gt: e.RUN_HISTORY_KEEP } } } });
  let trimmed = 0;
  for (const u of users) {
    const keep = await prisma.codeRun.findMany({ where: { userId: u.userId }, orderBy: { createdAt: "desc" }, take: e.RUN_HISTORY_KEEP, select: { id: true } });
    const res = await prisma.codeRun.deleteMany({ where: { userId: u.userId, id: { notIn: keep.map((k) => k.id) } } });
    trimmed += res.count;
  }
  return old.count + trimmed;
}
