import { PgBoss } from "pg-boss";

/**
 * Durable background jobs (pg-boss on PostgreSQL). The web app only enqueues; the worker
 * process (worker/index.ts) runs handlers and cron schedules.
 * Every job is also recoverable from database state by the worker's sweeps, so a failed
 * enqueue never loses work.
 */
export const QUEUES = {
  gradeCode: "grade-code",
  finalizeAttempt: "finalize-attempt",
  sweepAttempts: "sweep-attempts",
  sweepGrading: "sweep-grading",
  publishNotices: "publish-notices",
  deadlineReminders: "deadline-reminders",
  releaseResults: "release-results",
  cleanupRuns: "cleanup-runs",
} as const;

const g = globalThis as unknown as { __g2tBoss?: Promise<PgBoss> };

/** Lightweight sender for the web app (no maintenance, scheduling or migrations). */
function sender(): Promise<PgBoss> {
  g.__g2tBoss ??= (async () => {
    const boss = new PgBoss({
      connectionString: process.env.DATABASE_URL!,
      supervise: false,
      schedule: false,
      migrate: false,
      createSchema: false,
      max: 2,
    });
    boss.on("error", (e) => console.error("[queue] error:", e instanceof Error ? e.message : e));
    await boss.start();
    return boss;
  })().catch((e) => {
    g.__g2tBoss = undefined;
    throw e;
  });
  return g.__g2tBoss;
}

export async function enqueue(queue: string, data: object, startAfter?: Date) {
  try {
    const boss = await sender();
    if (startAfter) await boss.sendAfter(queue, data, { retryLimit: 3, retryBackoff: true }, startAfter);
    else await boss.send(queue, data, { retryLimit: 3, retryBackoff: true });
  } catch (e) {
    // The worker's sweeps recover this from database state.
    console.warn("[queue] enqueue failed; work will be picked up by the next sweep:", e instanceof Error ? e.message : e);
  }
}
