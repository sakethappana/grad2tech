import { vi } from "vitest";

// Background-queue messages are recorded instead of sent; tests call the worker's job functions directly.
export const enqueued: { queue: string; data: object; startAfter?: Date }[] = [];

vi.mock("@/server/queue", () => ({
  QUEUES: {
    gradeCode: "grade-code",
    finalizeAttempt: "finalize-attempt",
    sweepAttempts: "sweep-attempts",
    sweepGrading: "sweep-grading",
    publishNotices: "publish-notices",
    deadlineReminders: "deadline-reminders",
    releaseResults: "release-results",
    cleanupRuns: "cleanup-runs",
  },
  enqueue: async (queue: string, data: object, startAfter?: Date) => {
    enqueued.push({ queue, data, startAfter });
  },
}));
