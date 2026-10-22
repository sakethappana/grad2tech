import { z } from "zod";
import type { DoubtStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  activeBatchIds,
  getVisibleAssessment,
  getVisibleAssignment,
  getVisibleBrief,
  getVisibleDoubt,
  isAssessmentOpen,
} from "@/server/access";
import { audit } from "@/server/audit";
import { AppError, conflict, invalid, notFound } from "@/server/errors";
import { saveUploads } from "@/server/files";
import { activeAdminIds, notify } from "@/server/notifications";
import type { CurrentUser } from "@/server/session";

export const DOUBT_STATUS_LABEL: Record<DoubtStatus, string> = { OPEN: "Open", IN_PROGRESS: "In progress", RESOLVED: "Resolved" };

export const doubtSchema = z.object({
  title: z.string().trim().min(5, "Give the doubt a short title").max(150),
  body: z.string().trim().min(10, "Describe what you tried and where you are stuck").max(20_000),
  topic: z.string().trim().min(1, "Enter a topic").max(80),
  codeSnippet: z.string().max(20_000).nullable().default(null),
  codeLanguage: z.string().max(30).nullable().default(null),
  visibility: z.enum(["PRIVATE", "BATCH"]),
  assignmentId: z.string().nullable().default(null),
  assessmentId: z.string().nullable().default(null),
  projectBriefId: z.string().nullable().default(null),
});

export async function createDoubt(student: CurrentUser, input: z.infer<typeof doubtSchema>, screenshots: File[] = [], now = new Date()) {
  const links = [input.assignmentId, input.assessmentId, input.projectBriefId].filter(Boolean);
  if (links.length > 1) throw invalid("Link the doubt to one task at most.");
  let visibility = input.visibility;

  if (input.assignmentId) await getVisibleAssignment(student.id, input.assignmentId);
  if (input.projectBriefId) await getVisibleBrief(student.id, input.projectBriefId);
  if (input.assessmentId) {
    const a = await getVisibleAssessment(student.id, input.assessmentId);
    if (isAssessmentOpen(a, now)) {
      // Apply the test's help policy while it is open. Linked doubts are always private then.
      if (a.helpPolicy === "NO_HELP_WHILE_OPEN") {
        throw new AppError("Doubts about this test can be raised after it closes.", 403, "HELP_NOT_ALLOWED");
      }
      visibility = "PRIVATE";
    }
  }

  const batches = await activeBatchIds(student.id);
  if (visibility === "BATCH" && batches.length === 0) throw invalid("You need an active batch to share a doubt with your batch.");

  const thread = await prisma.$transaction(async (tx) => {
    const t = await tx.doubtThread.create({
      data: {
        studentId: student.id,
        batchId: batches[0] ?? null,
        title: input.title,
        topic: input.topic,
        visibility,
        assignmentId: input.assignmentId,
        assessmentId: input.assessmentId,
        projectBriefId: input.projectBriefId,
        lastActivityAt: now,
      },
    });
    const m = await tx.doubtMessage.create({
      data: { threadId: t.id, authorId: student.id, body: input.body, codeSnippet: input.codeSnippet || null, codeLanguage: input.codeLanguage || null },
    });
    return { thread: t, messageId: m.id };
  });
  if (screenshots.length) {
    await saveUploads(screenshots, { ownerId: student.id, purpose: "DOUBT_ATTACHMENT", doubtMessageId: thread.messageId, imagesOnly: true });
  }
  await notify(await activeAdminIds(), {
    type: "NEW_DOUBT",
    title: `New doubt from ${student.name}: ${input.title}`,
    link: `/portal/admin/doubts/${thread.thread.id}`,
    dedupeKey: `doubt-new:${thread.thread.id}`,
  });
  return thread.thread;
}

export const replySchema = z.object({
  body: z.string().trim().min(1, "Write a reply").max(20_000),
  codeSnippet: z.string().max(20_000).nullable().default(null),
  codeLanguage: z.string().max(30).nullable().default(null),
});

export async function replyToDoubt(user: CurrentUser, threadId: string, input: z.infer<typeof replySchema>, screenshots: File[] = [], now = new Date()) {
  const thread =
    user.role === "ADMIN"
      ? await prisma.doubtThread.findUnique({ where: { id: threadId } })
      : await getVisibleDoubt(user.id, threadId);
  if (!thread) throw notFound("Doubt");
  // Students reply to their own doubts, or to doubts explicitly shared with their batch.
  if (user.role === "STUDENT" && thread.studentId !== user.id && thread.visibility !== "BATCH") throw notFound("Doubt");

  const isAdmin = user.role === "ADMIN";
  const reopen = !isAdmin && thread.status === "RESOLVED" && thread.studentId === user.id;
  const message = await prisma.$transaction(async (tx) => {
    const m = await tx.doubtMessage.create({
      data: { threadId, authorId: user.id, body: input.body, codeSnippet: input.codeSnippet || null, codeLanguage: input.codeLanguage || null },
    });
    await tx.doubtThread.update({
      where: { id: threadId },
      data: {
        lastActivityAt: now,
        ...(isAdmin && thread.status === "OPEN" ? { status: "IN_PROGRESS" } : {}),
        ...(isAdmin && !thread.firstResponseAt ? { firstResponseAt: now } : {}),
        ...(reopen ? { status: "OPEN", resolvedAt: null } : {}),
      },
    });
    return m;
  });
  if (screenshots.length) {
    await saveUploads(screenshots, { ownerId: user.id, purpose: "DOUBT_ATTACHMENT", doubtMessageId: message.id, imagesOnly: true });
  }

  if (isAdmin) {
    await notify([thread.studentId], {
      type: "DOUBT_REPLY",
      title: `Trainer replied: ${thread.title}`,
      link: `/portal/student/doubts/${threadId}`,
      dedupeKey: `doubt-reply:${message.id}`,
    });
  } else {
    const admins = thread.assignedToId ? [thread.assignedToId] : await activeAdminIds();
    await notify(admins, {
      type: "DOUBT_REPLY",
      title: `${user.name} replied: ${thread.title}`,
      link: `/portal/admin/doubts/${threadId}`,
      dedupeKey: `doubt-reply:${message.id}`,
    });
    if (thread.studentId !== user.id) {
      await notify([thread.studentId], {
        type: "DOUBT_REPLY",
        title: `New reply on your doubt: ${thread.title}`,
        link: `/portal/student/doubts/${threadId}`,
        dedupeKey: `doubt-reply:${message.id}`,
      });
    }
  }
  return message;
}

export async function setDoubtStatus(user: CurrentUser, threadId: string, status: DoubtStatus, now = new Date()) {
  const thread = user.role === "ADMIN" ? await prisma.doubtThread.findUnique({ where: { id: threadId } }) : await getVisibleDoubt(user.id, threadId);
  if (!thread) throw notFound("Doubt");
  if (user.role === "STUDENT") {
    if (thread.studentId !== user.id) throw notFound("Doubt");
    if (status === "IN_PROGRESS") throw invalid("Only trainers can mark a doubt as in progress.");
  }
  if (thread.status === status) return;
  await prisma.$transaction(async (tx) => {
    await tx.doubtThread.update({
      where: { id: threadId },
      data: { status, resolvedAt: status === "RESOLVED" ? now : null, lastActivityAt: now },
    });
    await audit({ actorId: user.id, action: "doubt.status_changed", entityType: "DoubtThread", entityId: threadId, metadata: { from: thread.status, to: status } }, tx);
  });
  const recipients = user.role === "ADMIN" ? [thread.studentId] : thread.assignedToId ? [thread.assignedToId] : await activeAdminIds();
  await notify(recipients, {
    type: "DOUBT_STATUS",
    title: `Doubt ${DOUBT_STATUS_LABEL[status].toLowerCase()}: ${thread.title}`,
    link: user.role === "ADMIN" ? `/portal/student/doubts/${threadId}` : `/portal/admin/doubts/${threadId}`,
    dedupeKey: `doubt-status:${threadId}:${status}:${now.getTime()}`,
  });
}

export async function assignDoubt(adminId: string, threadId: string, assigneeId: string | null) {
  if (assigneeId) {
    const admin = await prisma.user.findFirst({ where: { id: assigneeId, role: "ADMIN", suspendedAt: null } });
    if (!admin) throw invalid("Choose an active trainer.");
  }
  const thread = await prisma.doubtThread.findUnique({ where: { id: threadId } });
  if (!thread) throw notFound("Doubt");
  if (thread.status === "RESOLVED" && assigneeId) throw conflict("Reopen the doubt before assigning it.");
  await prisma.$transaction(async (tx) => {
    await tx.doubtThread.update({ where: { id: threadId }, data: { assignedToId: assigneeId } });
    await audit({ actorId: adminId, action: "doubt.assigned", entityType: "DoubtThread", entityId: threadId, metadata: { assigneeId } }, tx);
  });
  if (assigneeId && assigneeId !== adminId) {
    await notify([assigneeId], {
      type: "NEW_DOUBT",
      title: `Doubt assigned to you: ${thread.title}`,
      link: `/portal/admin/doubts/${threadId}`,
      dedupeKey: `doubt-assigned:${threadId}:${assigneeId}`,
    });
  }
}
