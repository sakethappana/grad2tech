import type { Assessment, Attempt } from "@/generated/prisma/client";

export type AssessmentPhase = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "OPEN" | "CLOSED" | "CANCELLED";

/**
 * Lifecycle: Draft → Published/Scheduled → Open → Closed.
 * "Published" means visible to students but not yet open. Result release is tracked separately.
 */
export function assessmentPhase(
  a: Pick<Assessment, "status" | "publishAt" | "opensAt" | "closesAt">,
  now = new Date(),
): AssessmentPhase {
  if (a.status === "CANCELLED") return "CANCELLED";
  if (a.status === "DRAFT" || !a.publishAt) return "DRAFT";
  if (now < a.publishAt) return "SCHEDULED";
  if (now >= a.closesAt) return "CLOSED";
  if (now >= a.opensAt) return "OPEN";
  return "PUBLISHED";
}

export const PHASE_LABEL: Record<AssessmentPhase, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
  OPEN: "Open",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

/** Attempt deadline: the earlier of the test closing time and start + allowed duration. */
export function computeDeadline(startedAt: Date, durationMinutes: number, closesAt: Date): Date {
  const byDuration = new Date(startedAt.getTime() + durationMinutes * 60_000);
  return byDuration < closesAt ? byDuration : closesAt;
}

/** Whether a student may see their result (score, per-question marks) for an attempt. */
export function resultsVisible(
  a: Pick<Assessment, "resultPolicy" | "resultsReleasedAt" | "closesAt">,
  attempt: Pick<Attempt, "status" | "gradingStatus">,
  now = new Date(),
): boolean {
  if (attempt.status === "IN_PROGRESS" || attempt.gradingStatus !== "GRADED") return false;
  if (a.resultsReleasedAt) return true;
  if (a.resultPolicy === "WHEN_GRADED") return true;
  if (a.resultPolicy === "AFTER_CLOSE") return now >= a.closesAt;
  return false;
}

export function solutionsVisible(
  a: Pick<Assessment, "resultPolicy" | "resultsReleasedAt" | "closesAt" | "solutionPolicy">,
  attempt: Pick<Attempt, "status" | "gradingStatus">,
  now = new Date(),
): boolean {
  // Solutions are never shown while the test is still open for others.
  return a.solutionPolicy === "WITH_RESULTS" && now >= a.closesAt && resultsVisible(a, attempt, now);
}

export const GRADING_LABEL = {
  NOT_STARTED: "Not submitted",
  AWAITING_GRADING: "Awaiting grading",
  PARTIALLY_GRADED: "Partially graded",
  GRADED: "Graded",
} as const;
