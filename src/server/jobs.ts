import { prisma } from "@/lib/db";
import { resolveTargetStudents } from "@/server/access";
import { notifyAssessmentPublished } from "@/server/assessments/admin";
import { sweepExpiredAttempts } from "@/server/assessments/attempts";
import { MAX_GRADING_TRIES, notifyVisibleResults, processGradingJob } from "@/server/assessments/grading";
import { notifyAssignmentPublished } from "@/server/assignments";
import { notify } from "@/server/notifications";
import { cleanupRuns } from "@/server/playground";
import { notifyBriefPublished } from "@/server/workspace/projects";
import { formatDateTime } from "@/lib/time";

/** Job bodies run by the worker. Each one is idempotent and derives its work from the database. */

export { sweepExpiredAttempts, cleanupRuns };

/** Backup for grading jobs whose queue message was lost, failed jobs awaiting retry, or stuck jobs. */
export async function sweepGrading(now = new Date()) {
  const jobs = await prisma.gradingJob.findMany({
    where: {
      tries: { lt: MAX_GRADING_TRIES },
      OR: [
        { status: "QUEUED", createdAt: { lt: new Date(now.getTime() - 60_000) } },
        { status: "FAILED", startedAt: { lt: new Date(now.getTime() - 2 * 60_000) } },
        { status: "RUNNING", startedAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
      ],
    },
    select: { id: true },
    take: 20,
  });
  for (const j of jobs) await processGradingJob(j.id, now);
  return jobs.length;
}

/** Sends "published" notifications for scheduled items whose publication time has arrived. */
export async function publishNotices(now = new Date()) {
  const [assignments, tests, briefs] = await Promise.all([
    prisma.assignment.findMany({ where: { status: "PUBLISHED", notifiedAt: null, publishAt: { lte: now } }, select: { id: true } }),
    prisma.assessment.findMany({ where: { status: "PUBLISHED", notifiedAt: null, publishAt: { lte: now } }, select: { id: true } }),
    prisma.projectBrief.findMany({ where: { status: "PUBLISHED", notifiedAt: null, publishAt: { lte: now } }, select: { id: true } }),
  ]);
  for (const a of assignments) await notifyAssignmentPublished(a.id);
  for (const t of tests) await notifyAssessmentPublished(t.id);
  for (const b of briefs) await notifyBriefPublished(b.id);
  return assignments.length + tests.length + briefs.length;
}

/** "Due soon" reminders: assignments due and tests closing within 24 hours, for students who haven't finished. */
export async function deadlineReminders(now = new Date()) {
  const soon = new Date(now.getTime() + 24 * 3_600_000);
  let sent = 0;
  const assignments = await prisma.assignment.findMany({
    where: { status: "PUBLISHED", publishAt: { lte: now }, dueAt: { gt: now, lte: soon } },
    include: { targets: true, submissions: { where: { status: { not: "DRAFT" } }, select: { studentId: true } } },
  });
  for (const a of assignments) {
    const done = new Set(a.submissions.map((s) => s.studentId));
    const students = (await resolveTargetStudents(a.targets)).filter((id) => !done.has(id));
    sent += await notify(students, {
      type: "DEADLINE_SOON",
      title: `Due soon: ${a.title}`,
      body: `Due ${formatDateTime(a.dueAt)}`,
      link: `/portal/student/assignments/${a.id}`,
      dedupeKey: `due-soon:assignment:${a.id}`,
    });
  }
  const tests = await prisma.assessment.findMany({
    where: { status: "PUBLISHED", publishAt: { lte: now }, opensAt: { lte: now }, closesAt: { gt: now, lte: soon } },
    include: { targets: true, attempts: { select: { studentId: true } } },
  });
  for (const t of tests) {
    const attempted = new Set(t.attempts.map((a) => a.studentId));
    const students = (await resolveTargetStudents(t.targets)).filter((id) => !attempted.has(id));
    sent += await notify(students, {
      type: "DEADLINE_SOON",
      title: `Closing soon: ${t.title}`,
      body: `Closes ${formatDateTime(t.closesAt)}`,
      link: `/portal/student/tests/${t.id}`,
      dedupeKey: `due-soon:test:${t.id}`,
    });
  }
  return sent;
}

/** Releases "after close" results and catches any results that became visible after late grading. */
export async function releaseResults(now = new Date()) {
  const recent = await prisma.assessment.findMany({
    where: {
      status: "PUBLISHED",
      closesAt: { lte: now, gte: new Date(now.getTime() - 14 * 86_400_000) },
      OR: [{ resultPolicy: "AFTER_CLOSE" }, { resultPolicy: "WHEN_GRADED" }, { resultsReleasedAt: { not: null } }],
    },
    select: { id: true },
  });
  let count = 0;
  for (const a of recent) count += await notifyVisibleResults(a.id, now);
  return count;
}
