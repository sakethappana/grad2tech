import { z } from "zod";
import type { Assignment, Submission } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { getVisibleAssignment, resolveTargetStudents } from "@/server/access";
import { audit } from "@/server/audit";
import { AppError, conflict, invalid, notFound } from "@/server/errors";
import { saveUploads } from "@/server/files";
import { notify } from "@/server/notifications";

export const RESPONSE_TYPES = ["TEXT", "CODE", "LINK", "FILE"] as const;

export const assignmentSchema = z
  .object({
    title: z.string().trim().min(3, "Enter a title").max(150),
    instructions: z.string().trim().min(1, "Write the instructions").max(30_000),
    topic: z.string().trim().min(1, "Enter a topic").max(80),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
    dueAt: z.date({ message: "Choose a due date" }),
    allowLate: z.boolean(),
    maxMarks: z.coerce.number().int().min(1).max(1000),
    responseTypes: z.array(z.enum(RESPONSE_TYPES)).min(1, "Allow at least one response type"),
    batchIds: z.array(z.string()).default([]),
    studentIds: z.array(z.string()).default([]),
  })
  .refine((v) => v.batchIds.length + v.studentIds.length > 0, { message: "Choose at least one batch or student", path: ["batchIds"] });

export type AssignmentInput = z.infer<typeof assignmentSchema>;

async function replaceTargets(tx: Tx, assignmentId: string, batchIds: string[], studentIds: string[]) {
  await tx.assignmentTarget.deleteMany({ where: { assignmentId } });
  const data = [
    ...[...new Set(batchIds)].map((batchId) => ({ assignmentId, batchId })),
    ...[...new Set(studentIds)].map((studentId) => ({ assignmentId, studentId })),
  ];
  if (data.length) await tx.assignmentTarget.createMany({ data });
}

export async function createAssignment(adminId: string, input: AssignmentInput, files: File[] = []) {
  const { batchIds, studentIds, ...fields } = input;
  const a = await prisma.$transaction(async (tx) => {
    const a = await tx.assignment.create({ data: { ...fields, createdById: adminId } });
    await replaceTargets(tx, a.id, batchIds, studentIds);
    await audit({ actorId: adminId, action: "assignment.created", entityType: "Assignment", entityId: a.id }, tx);
    return a;
  });
  if (files.length) await saveUploads(files, { ownerId: adminId, purpose: "ASSIGNMENT_RESOURCE", assignmentId: a.id });
  return a;
}

export async function updateAssignment(adminId: string, id: string, input: AssignmentInput, files: File[] = []) {
  const existing = await prisma.assignment.findUnique({ where: { id } });
  if (!existing) throw notFound("Assignment");
  if (existing.status === "CANCELLED") throw conflict("Cancelled assignments cannot be edited.");
  const { batchIds, studentIds, ...fields } = input;
  await prisma.$transaction(async (tx) => {
    await tx.assignment.update({ where: { id }, data: fields });
    await replaceTargets(tx, id, batchIds, studentIds);
    await audit({
      actorId: adminId,
      action: "assignment.updated",
      entityType: "Assignment",
      entityId: id,
      metadata: { dueAt: fields.dueAt.toISOString(), previousDueAt: existing.dueAt.toISOString() },
    }, tx);
  });
  if (files.length) await saveUploads(files, { ownerId: adminId, purpose: "ASSIGNMENT_RESOURCE", assignmentId: id });
}

/** Publishes now, or schedules publication at `publishAt`. Students see it without a redeploy. */
export async function publishAssignment(adminId: string, id: string, publishAt: Date | null, now = new Date()) {
  const a = await prisma.assignment.findUnique({ where: { id }, include: { targets: true } });
  if (!a) throw notFound("Assignment");
  if (a.status !== "DRAFT") throw conflict("Only drafts can be published.");
  if (a.targets.length === 0) throw invalid("Choose at least one batch or student.");
  const when = publishAt && publishAt > now ? publishAt : now;
  if (a.dueAt <= when) throw invalid("The due date must be after the publication time.");
  await prisma.$transaction(async (tx) => {
    await tx.assignment.update({ where: { id }, data: { status: "PUBLISHED", publishAt: when } });
    await audit({ actorId: adminId, action: "assignment.published", entityType: "Assignment", entityId: id, metadata: { publishAt: when.toISOString() } }, tx);
  });
  if (when <= now) await notifyAssignmentPublished(id);
}

export async function notifyAssignmentPublished(id: string) {
  const a = await prisma.assignment.findUnique({ where: { id }, include: { targets: true } });
  if (!a || a.status !== "PUBLISHED" || a.notifiedAt) return;
  const students = await resolveTargetStudents(a.targets);
  await notify(students, {
    type: "ASSIGNMENT_PUBLISHED",
    title: `New assignment: ${a.title}`,
    body: `Topic: ${a.topic}`,
    link: `/portal/student/assignments/${a.id}`,
    dedupeKey: `assignment-published:${a.id}`,
  });
  await prisma.assignment.update({ where: { id }, data: { notifiedAt: new Date() } });
}

/** Cancelled assignments disappear for students and are excluded from completion metrics. */
export async function cancelAssignment(adminId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    const res = await tx.assignment.updateMany({ where: { id, status: { not: "CANCELLED" } }, data: { status: "CANCELLED" } });
    if (res.count === 0) throw conflict("This assignment is already cancelled.");
    await audit({ actorId: adminId, action: "assignment.cancelled", entityType: "Assignment", entityId: id }, tx);
  });
}

// ── Student submissions ────────────────────────────────────────

export type StudentAssignmentStatus = "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "OVERDUE" | "REVIEWED" | "RESUBMIT_REQUESTED";

export const STUDENT_STATUS_LABEL: Record<StudentAssignmentStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted",
  OVERDUE: "Overdue",
  REVIEWED: "Reviewed",
  RESUBMIT_REQUESTED: "Resubmission requested",
};

export function studentAssignmentStatus(
  a: Pick<Assignment, "dueAt">,
  s: Pick<Submission, "status" | "submittedAt"> | null | undefined,
  now = new Date(),
): StudentAssignmentStatus {
  if (s?.status === "REVIEWED") return "REVIEWED";
  if (s?.status === "RESUBMIT_REQUESTED") return "RESUBMIT_REQUESTED";
  if (s?.status === "SUBMITTED") return "SUBMITTED";
  if (now > a.dueAt) return "OVERDUE";
  return s ? "IN_PROGRESS" : "NOT_STARTED";
}

export const submissionSchema = z.object({
  textResponse: z.string().max(30_000).nullable().default(null),
  code: z.string().max(100_000).nullable().default(null),
  codeLanguage: z.string().max(30).nullable().default(null),
  linkUrl: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .default(null)
    .refine((v) => !v || /^https?:\/\//i.test(v), "Links must start with http:// or https://"),
});

export type SubmissionInput = z.infer<typeof submissionSchema>;

function contentFor(a: Assignment, input: SubmissionInput) {
  const allow = new Set(a.responseTypes);
  return {
    textResponse: allow.has("TEXT") ? input.textResponse || null : null,
    code: allow.has("CODE") ? input.code || null : null,
    codeLanguage: allow.has("CODE") ? input.codeLanguage || null : null,
    linkUrl: allow.has("LINK") ? input.linkUrl || null : null,
  };
}

function assertOpenForWork(a: Assignment, existing: Submission | null, now: Date) {
  if (a.status !== "PUBLISHED") throw conflict("This assignment is no longer accepting work.");
  if (existing?.status === "REVIEWED") throw conflict("This work has been reviewed. Ask your trainer if you need to resubmit.");
  if (existing?.status === "SUBMITTED") throw conflict("You have already submitted this assignment.");
  const resubmission = existing?.status === "RESUBMIT_REQUESTED";
  if (now > a.dueAt && !a.allowLate && !resubmission) {
    throw new AppError("The deadline has passed and late submissions are not accepted for this assignment.", 409, "DEADLINE_PASSED");
  }
}

export async function saveSubmissionDraft(studentId: string, assignmentId: string, input: SubmissionInput, files: File[] = [], now = new Date()) {
  const a = await getVisibleAssignment(studentId, assignmentId);
  const existing = await prisma.submission.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId } } });
  assertOpenForWork(a, existing, now);
  const content = contentFor(a, input);
  const sub = await prisma.submission.upsert({
    where: { assignmentId_studentId: { assignmentId, studentId } },
    create: { assignmentId, studentId, ...content },
    update: content,
  });
  if (files.length) {
    if (!a.responseTypes.includes("FILE")) throw invalid("File uploads are not accepted for this assignment.");
    await saveUploads(files, { ownerId: studentId, purpose: "SUBMISSION", submissionId: sub.id });
  }
  return sub;
}

export async function submitAssignment(studentId: string, assignmentId: string, input: SubmissionInput, files: File[] = [], now = new Date()) {
  const a = await getVisibleAssignment(studentId, assignmentId);
  const draft = await saveSubmissionDraft(studentId, assignmentId, input, files, now);
  const fileCount = await prisma.fileObject.count({ where: { submissionId: draft.id } });
  const hasContent = Boolean(draft.textResponse?.trim() || draft.code?.trim() || draft.linkUrl || fileCount > 0);
  if (!hasContent) throw invalid("Add your work before submitting.");
  const isLate = now > a.dueAt;
  const submitted = await prisma.$transaction(async (tx) => {
    const res = await tx.submission.updateMany({
      where: { id: draft.id, status: { in: ["DRAFT", "RESUBMIT_REQUESTED"] } },
      data: { status: "SUBMITTED", submittedAt: now, isLate, revision: { increment: 1 } },
    });
    if (res.count === 0) throw conflict("You have already submitted this assignment.");
    const s = await tx.submission.findUniqueOrThrow({ where: { id: draft.id }, include: { files: { select: { id: true, filename: true } } } });
    await tx.submissionHistory.create({
      data: {
        submissionId: s.id,
        revision: s.revision,
        submittedAt: now,
        isLate,
        content: { textResponse: s.textResponse, code: s.code, codeLanguage: s.codeLanguage, linkUrl: s.linkUrl, files: s.files },
      },
    });
    return s;
  });
  return submitted;
}

// ── Review ─────────────────────────────────────────────────────

export const reviewSchema = z.object({
  marks: z.coerce.number().min(0, "Marks cannot be negative"),
  feedback: z.string().trim().max(10_000).nullable().default(null),
});

export async function reviewSubmission(adminId: string, submissionId: string, input: z.infer<typeof reviewSchema>) {
  const sub = await prisma.submission.findUnique({ where: { id: submissionId }, include: { assignment: true } });
  if (!sub) throw notFound("Submission");
  if (sub.status === "DRAFT") throw conflict("This work has not been submitted yet.");
  if (input.marks > sub.assignment.maxMarks) throw invalid(`Marks cannot exceed ${sub.assignment.maxMarks}.`);
  await prisma.$transaction(async (tx) => {
    await tx.submission.update({
      where: { id: submissionId },
      data: { status: "REVIEWED", marks: input.marks, feedback: input.feedback, reviewedById: adminId, reviewedAt: new Date() },
    });
    await audit({
      actorId: adminId,
      action: "submission.reviewed",
      entityType: "Submission",
      entityId: submissionId,
      metadata: { marks: input.marks, previousMarks: sub.marks },
    }, tx);
    await notify([sub.studentId], {
      type: "FEEDBACK",
      title: `Feedback on "${sub.assignment.title}"`,
      body: `Marks: ${input.marks} / ${sub.assignment.maxMarks}`,
      link: `/portal/student/assignments/${sub.assignmentId}`,
      dedupeKey: `review:${submissionId}:${Date.now()}`,
    }, tx);
  });
}

export async function requestResubmission(adminId: string, submissionId: string, feedback: string) {
  const sub = await prisma.submission.findUnique({ where: { id: submissionId }, include: { assignment: true } });
  if (!sub) throw notFound("Submission");
  if (sub.status === "DRAFT") throw conflict("This work has not been submitted yet.");
  if (!feedback.trim()) throw invalid("Explain what needs to change.");
  await prisma.$transaction(async (tx) => {
    await tx.submission.update({
      where: { id: submissionId },
      data: { status: "RESUBMIT_REQUESTED", feedback: feedback.trim(), reviewedById: adminId, reviewedAt: new Date() },
    });
    await audit({ actorId: adminId, action: "submission.resubmit_requested", entityType: "Submission", entityId: submissionId }, tx);
    await notify([sub.studentId], {
      type: "FEEDBACK",
      title: `Resubmission requested: "${sub.assignment.title}"`,
      body: feedback.trim().slice(0, 200),
      link: `/portal/student/assignments/${sub.assignmentId}`,
      dedupeKey: `resubmit:${submissionId}:${Date.now()}`,
    }, tx);
  });
}
