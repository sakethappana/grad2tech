import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/db";

/** Audit actions recorded for publishing, grade changes, enrolment changes and account actions. */
export type AuditAction =
  | "user.invited"
  | "user.invitation_revoked"
  | "user.invitation_accepted"
  | "user.suspended"
  | "user.reactivated"
  | "user.password_reset_link"
  | "user.admin_created"
  | "user.profile_updated"
  | "batch.created"
  | "batch.updated"
  | "batch.archived"
  | "batch.unarchived"
  | "enrolment.created"
  | "enrolment.moved"
  | "enrolment.ended"
  | "assignment.created"
  | "assignment.updated"
  | "assignment.published"
  | "assignment.cancelled"
  | "submission.reviewed"
  | "submission.resubmit_requested"
  | "assessment.created"
  | "assessment.updated"
  | "assessment.published"
  | "assessment.revision_created"
  | "assessment.revision_published"
  | "assessment.cancelled"
  | "assessment.results_released"
  | "attempt.answer_graded"
  | "attempt.regrade_requested"
  | "project.brief_published"
  | "project.reviewed"
  | "class.scheduled"
  | "class.updated"
  | "class.cancelled"
  | "attendance.recorded"
  | "doubt.assigned"
  | "doubt.status_changed"
  | "announcement.published"
  | "placement.review_updated"
  | "placement.interview_recorded"
  | "report.exported"
  | "file.uploaded";

export async function audit(
  entry: {
    actorId: string | null;
    action: AuditAction;
    entityType: string;
    entityId: string;
    metadata?: Prisma.InputJsonValue;
  },
  tx?: Tx,
) {
  const client = tx ?? prisma;
  await client.auditEvent.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata,
    },
  });
}
