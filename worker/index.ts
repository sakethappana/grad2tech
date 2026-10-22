/**
 * Grad2Tech background worker. Run as a separate process: `npm run worker`.
 * Uses pg-boss (PostgreSQL) for durable jobs and cron schedules. Student code is never
 * executed here: grading calls the isolated execution service through its API.
 */
import "dotenv/config";
import { PgBoss } from "pg-boss";
import { finalizeAttempt } from "@/server/assessments/attempts";
import { processGradingJob } from "@/server/assessments/grading";
import { cleanupRuns, deadlineReminders, publishNotices, releaseResults, sweepExpiredAttempts, sweepGrading } from "@/server/jobs";
import { QUEUES } from "@/server/queue";

const log = (...args: unknown[]) => console.log(new Date().toISOString(), "[worker]", ...args);

const SCHEDULES: { queue: string; cron: string; run: () => Promise<number> }[] = [
  { queue: QUEUES.sweepAttempts, cron: "* * * * *", run: () => sweepExpiredAttempts() },
  { queue: QUEUES.sweepGrading, cron: "*/2 * * * *", run: () => sweepGrading() },
  { queue: QUEUES.publishNotices, cron: "* * * * *", run: () => publishNotices() },
  { queue: QUEUES.deadlineReminders, cron: "*/15 * * * *", run: () => deadlineReminders() },
  { queue: QUEUES.releaseResults, cron: "*/5 * * * *", run: () => releaseResults() },
  { queue: QUEUES.cleanupRuns, cron: "17 21 * * *", run: () => cleanupRuns() },
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL });
  boss.on("error", (e) => log("error:", e instanceof Error ? e.message : e));
  await boss.start();

  for (const q of Object.values(QUEUES)) {
    try {
      await boss.createQueue(q);
    } catch {
      // already exists
    }
  }

  await boss.work<{ jobId: string }>(QUEUES.gradeCode, { localConcurrency: 2 }, async ([job]) => {
    const result = await processGradingJob(job.data.jobId);
    log("grade-code", job.data.jobId, result);
    // Throwing lets pg-boss retry with backoff (bounded by retryLimit and MAX_GRADING_TRIES).
    if (result === "retry") throw new Error("Execution service unavailable; will retry");
  });

  await boss.work<{ attemptId: string }>(QUEUES.finalizeAttempt, async ([job]) => {
    await finalizeAttempt(job.data.attemptId, "SYSTEM");
  });

  for (const s of SCHEDULES) {
    await boss.schedule(s.queue, s.cron);
    await boss.work(s.queue, async () => {
      const n = await s.run();
      if (n > 0) log(s.queue, "processed", n);
    });
  }

  // Run the sweeps once at start-up so nothing waits for the first cron tick.
  for (const s of SCHEDULES.slice(0, 3)) await s.run().catch((e) => log(s.queue, "failed:", e instanceof Error ? e.message : e));

  log("ready");
  const stop = async () => {
    log("stopping");
    await boss.stop({ graceful: true, timeout: 20_000 });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});
