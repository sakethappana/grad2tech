import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { notFound } from "@/server/errors";

/**
 * Central visibility rules for students. Every student-facing query and action uses these,
 * so batch membership and ownership are enforced in one place.
 * Missing or forbidden resources both return 404 to avoid leaking existence.
 */

type Client = Tx | typeof prisma;

export async function activeBatchIds(studentId: string, db: Client = prisma): Promise<string[]> {
  const rows = await db.enrolment.findMany({
    where: { studentId, status: "ACTIVE", batch: { archivedAt: null } },
    select: { batchId: true },
  });
  return rows.map((r) => r.batchId);
}

/** Batches the student has ever belonged to (for reading their own history). */
export async function anyBatchIds(studentId: string, db: Client = prisma): Promise<string[]> {
  const rows = await db.enrolment.findMany({ where: { studentId }, select: { batchId: true } });
  return [...new Set(rows.map((r) => r.batchId))];
}

function targetMatch(studentId: string, batchIds: string[]) {
  return { some: { OR: [{ studentId }, { batchId: { in: batchIds } }] } };
}

export function visibleAssignmentWhere(studentId: string, batchIds: string[], now = new Date()): Prisma.AssignmentWhereInput {
  return {
    status: "PUBLISHED",
    archivedAt: null,
    publishAt: { lte: now },
    targets: targetMatch(studentId, batchIds),
  };
}

export function visibleAssessmentWhere(studentId: string, batchIds: string[], now = new Date()): Prisma.AssessmentWhereInput {
  return {
    status: "PUBLISHED",
    archivedAt: null,
    publishAt: { lte: now },
    targets: targetMatch(studentId, batchIds),
  };
}

export function visibleBriefWhere(studentId: string, batchIds: string[], now = new Date()): Prisma.ProjectBriefWhereInput {
  return {
    status: "PUBLISHED",
    archivedAt: null,
    publishAt: { lte: now },
    targets: targetMatch(studentId, batchIds),
  };
}

export async function getVisibleAssignment(studentId: string, assignmentId: string, db: Client = prisma) {
  const batchIds = await activeBatchIds(studentId, db);
  const a = await db.assignment.findFirst({
    where: {
      id: assignmentId,
      OR: [
        visibleAssignmentWhere(studentId, batchIds),
        // A student keeps access to work they already submitted, even after moving batch.
        { submissions: { some: { studentId, status: { not: "DRAFT" } } }, status: { not: "DRAFT" } },
      ],
    },
  });
  if (!a) throw notFound("Assignment");
  return a;
}

export async function getVisibleAssessment(studentId: string, assessmentId: string, db: Client = prisma) {
  const batchIds = await activeBatchIds(studentId, db);
  const a = await db.assessment.findFirst({
    where: {
      id: assessmentId,
      OR: [visibleAssessmentWhere(studentId, batchIds), { attempts: { some: { studentId } }, status: { not: "DRAFT" } }],
    },
  });
  if (!a) throw notFound("Test");
  return a;
}

export async function getVisibleBrief(studentId: string, briefId: string, db: Client = prisma) {
  const batchIds = await activeBatchIds(studentId, db);
  const b = await db.projectBrief.findFirst({
    where: { id: briefId, OR: [visibleBriefWhere(studentId, batchIds), { submissions: { some: { studentId } } }] },
  });
  if (!b) throw notFound("Project");
  return b;
}

/** Student ids targeted by a set of targets (direct students + active members of targeted batches). */
export async function resolveTargetStudents(
  targets: { batchId: string | null; studentId: string | null }[],
  db: Client = prisma,
): Promise<string[]> {
  const direct = targets.map((t) => t.studentId).filter((x): x is string => Boolean(x));
  const batchIds = targets.map((t) => t.batchId).filter((x): x is string => Boolean(x));
  const viaBatch = batchIds.length
    ? await db.enrolment.findMany({
        where: { batchId: { in: batchIds }, status: "ACTIVE" },
        select: { studentId: true },
      })
    : [];
  const ids = new Set([...direct, ...viaBatch.map((e) => e.studentId)]);
  if (ids.size === 0) return [];
  const active = await db.user.findMany({
    where: { id: { in: [...ids] }, role: "STUDENT", suspendedAt: null },
    select: { id: true },
  });
  return active.map((u) => u.id);
}

/** Whether a test is currently open (published, visible and inside its window). */
export function isAssessmentOpen(a: { status: string; publishAt: Date | null; opensAt: Date; closesAt: Date }, now = new Date()) {
  return a.status === "PUBLISHED" && !!a.publishAt && a.publishAt <= now && a.opensAt <= now && now < a.closesAt;
}

/**
 * Doubt threads a student may read: their own, plus batch-shared threads in their active batches.
 * Shared threads linked to a test are hidden from other students until the test closes.
 */
export function visibleDoubtWhere(studentId: string, batchIds: string[], now = new Date()): Prisma.DoubtThreadWhereInput {
  return {
    OR: [
      { studentId },
      {
        visibility: "BATCH",
        batchId: { in: batchIds },
        OR: [{ assessmentId: null }, { assessment: { closesAt: { lte: now } } }],
      },
    ],
  };
}

export async function getVisibleDoubt(studentId: string, threadId: string, db: Client = prisma) {
  const batchIds = await activeBatchIds(studentId, db);
  const t = await db.doubtThread.findFirst({ where: { id: threadId, ...visibleDoubtWhere(studentId, batchIds) } });
  if (!t) throw notFound("Doubt");
  return t;
}

export function visibleAnnouncementWhere(batchIds: string[]): Prisma.AnnouncementWhereInput {
  return { archivedAt: null, OR: [{ batchId: null }, { batchId: { in: batchIds } }] };
}
