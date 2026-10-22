import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { auth, resetLinkCapture } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/server/audit";
import { emailConfigured, sendEmail } from "@/server/email";
import { AppError, conflict, forbidden, invalid, notFound } from "@/server/errors";
import { notify } from "@/server/notifications";

const INVITE_DAYS = 7;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// ── Batches ────────────────────────────────────────────────────

export const batchSchema = z.object({
  name: z.string().trim().min(2, "Enter a batch name").max(80),
  code: z
    .string()
    .trim()
    .min(2, "Enter a short code")
    .max(30)
    .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers and dashes only")
    .transform((s) => s.toUpperCase()),
  description: z.string().trim().max(1000).nullable().default(null),
  startDate: z.date().nullable().default(null),
});

export async function createBatch(adminId: string, input: z.infer<typeof batchSchema>) {
  try {
    return await prisma.$transaction(async (tx) => {
      const b = await tx.batch.create({ data: { ...input, createdById: adminId } });
      await audit({ actorId: adminId, action: "batch.created", entityType: "Batch", entityId: b.id, metadata: { code: b.code } }, tx);
      return b;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict("A batch with that code already exists.");
    throw e;
  }
}

export async function updateBatch(adminId: string, id: string, input: z.infer<typeof batchSchema>) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.batch.update({ where: { id }, data: input });
      await audit({ actorId: adminId, action: "batch.updated", entityType: "Batch", entityId: id }, tx);
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict("A batch with that code already exists.");
    throw e;
  }
}

/** Archiving hides a batch from active lists but keeps all enrolments and academic history. */
export async function setBatchArchived(adminId: string, id: string, archived: boolean) {
  await prisma.$transaction(async (tx) => {
    await tx.batch.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await audit({ actorId: adminId, action: archived ? "batch.archived" : "batch.unarchived", entityType: "Batch", entityId: id }, tx);
  });
}

// ── Invitations ────────────────────────────────────────────────

export const inviteSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the person's name").max(100),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    role: z.enum(["STUDENT", "ADMIN"]),
    batchId: z.string().nullable().default(null),
    startDate: z.date().nullable().default(null),
  })
  .refine((v) => v.role === "ADMIN" || v.batchId, { message: "Choose a batch for the student", path: ["batchId"] });

export function invitationLink(token: string) {
  return `${env().APP_URL.replace(/\/$/, "")}/portal/invite/${token}`;
}

/** Creates an invitation. Returns the one-time link (shown to the admin; emailed if SMTP is configured). */
export async function inviteUser(adminId: string, input: z.infer<typeof inviteSchema>) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict("An account with this email already exists. Enrol the existing student instead.");
  if (input.batchId) {
    const batch = await prisma.batch.findUnique({ where: { id: input.batchId } });
    if (!batch || batch.archivedAt) throw invalid("Choose an active batch.");
  }
  const token = randomBytes(32).toString("base64url");
  const invitation = await prisma.$transaction(async (tx) => {
    // Only one pending invitation per email.
    await tx.invitation.updateMany({
      where: { email: input.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const inv = await tx.invitation.create({
      data: {
        email: input.email,
        name: input.name,
        role: input.role,
        batchId: input.role === "STUDENT" ? input.batchId : null,
        startDate: input.role === "STUDENT" ? (input.startDate ?? new Date()) : null,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
        createdById: adminId,
      },
    });
    await audit({ actorId: adminId, action: "user.invited", entityType: "Invitation", entityId: inv.id, metadata: { email: inv.email, role: inv.role, batchId: inv.batchId } }, tx);
    return inv;
  });
  const link = invitationLink(token);
  const emailed = emailConfigured()
    ? await sendEmail(
        input.email,
        "You're invited to the Grad2Tech Learning Portal",
        `Hello ${input.name},\n\nYou have been given access to the Grad2Tech Learning Portal. Set your password within ${INVITE_DAYS} days using this link:\n${link}\n`,
      )
    : false;
  return { invitation, link, emailed };
}

export async function revokeInvitation(adminId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    const res = await tx.invitation.updateMany({ where: { id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    if (res.count === 0) throw conflict("This invitation is no longer pending.");
    await audit({ actorId: adminId, action: "user.invitation_revoked", entityType: "Invitation", entityId: id }, tx);
  });
}

export async function findPendingInvitation(token: string) {
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: sha256(token) }, include: { batch: { select: { name: true } } } });
  if (!inv || inv.revokedAt || inv.acceptedAt || inv.expiresAt < new Date()) return null;
  return inv;
}

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "Use at most 128 characters");

/** Accepts an invitation: creates the account (with the server-assigned role) and enrolment. */
export async function acceptInvitation(token: string, password: string) {
  passwordSchema.parse(password);
  const inv = await findPendingInvitation(token);
  if (!inv) throw new AppError("This invitation link is invalid or has expired. Ask your trainer for a new one.", 410, "GONE");
  const passwordHash = await hashPassword(password);
  try {
    return await prisma.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { id: inv.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count === 0) throw new AppError("This invitation has already been used.", 410, "GONE");
      const userId = randomBytes(16).toString("hex");
      const user = await tx.user.create({
        data: { id: userId, name: inv.name, email: inv.email, emailVerified: true, role: inv.role },
      });
      await tx.account.create({
        data: { id: randomBytes(16).toString("hex"), accountId: user.id, providerId: "credential", userId: user.id, password: passwordHash },
      });
      if (inv.role === "STUDENT") {
        await tx.studentProfile.create({ data: { userId: user.id } });
        if (inv.batchId) {
          await tx.enrolment.create({ data: { studentId: user.id, batchId: inv.batchId, startDate: inv.startDate ?? new Date(), changedById: inv.createdById } });
        }
      }
      await tx.invitation.update({ where: { id: inv.id }, data: { userId: user.id } });
      await audit({ actorId: user.id, action: "user.invitation_accepted", entityType: "User", entityId: user.id, metadata: { invitationId: inv.id, role: inv.role } }, tx);
      if (inv.role === "ADMIN") {
        await audit({ actorId: inv.createdById, action: "user.admin_created", entityType: "User", entityId: user.id }, tx);
      }
      return user;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict("An account with this email already exists.");
    throw e;
  }
}

// ── Enrolment ──────────────────────────────────────────────────

export async function enrolStudent(adminId: string, studentId: string, batchId: string, startDate: Date) {
  const student = await prisma.user.findFirst({ where: { id: studentId, role: "STUDENT" } });
  if (!student) throw notFound("Student");
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch || batch.archivedAt) throw invalid("Choose an active batch.");
  const already = await prisma.enrolment.findFirst({ where: { studentId, batchId, status: "ACTIVE" } });
  if (already) throw conflict("The student is already enrolled in this batch.");
  await prisma.$transaction(async (tx) => {
    const e = await tx.enrolment.create({ data: { studentId, batchId, startDate, changedById: adminId } });
    await audit({ actorId: adminId, action: "enrolment.created", entityType: "Enrolment", entityId: e.id, metadata: { studentId, batchId, startDate: startDate.toISOString() } }, tx);
  });
}

/** Moves a student: ends the current enrolment and starts a new one. History is preserved. */
export async function moveStudent(adminId: string, studentId: string, fromBatchId: string, toBatchId: string, effective: Date) {
  if (fromBatchId === toBatchId) throw invalid("Choose a different batch.");
  const current = await prisma.enrolment.findFirst({ where: { studentId, batchId: fromBatchId, status: "ACTIVE" } });
  if (!current) throw notFound("Active enrolment");
  const target = await prisma.batch.findUnique({ where: { id: toBatchId } });
  if (!target || target.archivedAt) throw invalid("Choose an active batch.");
  const dup = await prisma.enrolment.findFirst({ where: { studentId, batchId: toBatchId, status: "ACTIVE" } });
  if (dup) throw conflict("The student is already enrolled in that batch.");
  await prisma.$transaction(async (tx) => {
    await tx.enrolment.update({
      where: { id: current.id },
      data: { status: "ENDED", endDate: effective, endReason: `Moved to ${target.name}`, changedById: adminId },
    });
    const e = await tx.enrolment.create({ data: { studentId, batchId: toBatchId, startDate: effective, changedById: adminId } });
    await audit({ actorId: adminId, action: "enrolment.moved", entityType: "Enrolment", entityId: e.id, metadata: { studentId, fromBatchId, toBatchId } }, tx);
  });
}

export async function endEnrolment(adminId: string, enrolmentId: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const res = await tx.enrolment.updateMany({
      where: { id: enrolmentId, status: "ACTIVE" },
      data: { status: "ENDED", endDate: new Date(), endReason: reason || "Ended by admin", changedById: adminId },
    });
    if (res.count === 0) throw conflict("This enrolment is not active.");
    await audit({ actorId: adminId, action: "enrolment.ended", entityType: "Enrolment", entityId: enrolmentId, metadata: { reason } }, tx);
  });
}

// ── Account actions ────────────────────────────────────────────

export async function setSuspended(adminId: string, userId: string, suspend: boolean, reason: string | null) {
  if (adminId === userId) throw forbidden("You cannot suspend your own account.");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("User");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: suspend ? { suspendedAt: new Date(), suspendedReason: reason } : { suspendedAt: null, suspendedReason: null },
    });
    // Suspension takes effect immediately: end every active session.
    if (suspend) await tx.session.deleteMany({ where: { userId } });
    await audit({ actorId: adminId, action: suspend ? "user.suspended" : "user.reactivated", entityType: "User", entityId: userId, metadata: { reason } }, tx);
  });
}

/** Generates a password-reset link for a user (for sharing when email is not configured). */
export async function generateResetLink(adminId: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("User");
  if (user.suspendedAt) throw conflict("Reactivate the account before sending a reset link.");
  const store: { url?: string } = {};
  await resetLinkCapture.run(store, () =>
    auth.api.requestPasswordReset({ body: { email: user.email, redirectTo: "/portal/reset-password" } }),
  );
  if (!store.url) throw new AppError("Could not create a reset link. Please try again.", 503, "UNAVAILABLE");
  await audit({ actorId: adminId, action: "user.password_reset_link", entityType: "User", entityId: userId });
  return store.url;
}

export const profileSchema = z.object({
  phone: z.string().trim().max(30).nullable().default(null),
  graduationYear: z.coerce.number().int().min(1980).max(2100).nullable().default(null),
  background: z.string().trim().max(500).nullable().default(null),
});

export async function updateStudentProfile(actorId: string, studentId: string, input: z.infer<typeof profileSchema> & { name?: string }) {
  await prisma.$transaction(async (tx) => {
    if (input.name) await tx.user.update({ where: { id: studentId }, data: { name: input.name } });
    await tx.studentProfile.upsert({
      where: { userId: studentId },
      create: { userId: studentId, phone: input.phone, graduationYear: input.graduationYear, background: input.background },
      update: { phone: input.phone, graduationYear: input.graduationYear, background: input.background },
    });
    await audit({ actorId, action: "user.profile_updated", entityType: "User", entityId: studentId }, tx);
  });
}

// ── Notes, feedback, placement records ─────────────────────────

export async function addFollowUpNote(adminId: string, studentId: string, body: string) {
  if (!body.trim()) throw invalid("Write a note first.");
  await prisma.followUpNote.create({ data: { studentId, authorId: adminId, body: body.trim().slice(0, 5000) } });
}

export async function addTrainerFeedback(adminId: string, studentId: string, body: string) {
  if (!body.trim()) throw invalid("Write the feedback first.");
  const fb = await prisma.trainerFeedback.create({ data: { studentId, authorId: adminId, body: body.trim().slice(0, 5000) } });
  await notify([studentId], { type: "FEEDBACK", title: "New feedback from your trainer", link: "/portal/student/performance#feedback", dedupeKey: `feedback:${fb.id}` });
}

export const interviewSchema = z.object({
  company: z.string().trim().min(1, "Enter the company").max(120),
  scheduledAt: z.date({ message: "Choose the interview time" }),
  attended: z.enum(["UNKNOWN", "YES", "NO"]).transform((v) => (v === "UNKNOWN" ? null : v === "YES")),
  outcome: z.enum(["PENDING", "SELECTED", "NOT_SELECTED", "WITHDRAWN"]),
  companyFeedback: z.string().trim().max(5000).nullable().default(null),
});

export async function saveInterview(adminId: string, studentId: string, interviewId: string | null, input: z.infer<typeof interviewSchema>) {
  await prisma.$transaction(async (tx) => {
    const rec = interviewId
      ? await tx.placementInterview.update({ where: { id: interviewId, studentId }, data: input })
      : await tx.placementInterview.create({ data: { ...input, studentId, recordedById: adminId } });
    await audit({ actorId: adminId, action: "placement.interview_recorded", entityType: "PlacementInterview", entityId: rec.id, metadata: { studentId, outcome: input.outcome } }, tx);
  });
}

export const placementReviewSchema = z.object({
  status: z.enum(["NOT_REVIEWED", "ELIGIBLE", "NOT_ELIGIBLE", "ON_HOLD"]),
  refundStatus: z.enum(["NOT_APPLICABLE", "UNDER_REVIEW", "MUTUALLY_AGREED", "NOT_AGREED"]),
  notes: z.string().trim().max(10_000).nullable().default(null),
});

/** Records a human decision. The platform never decides eligibility or refunds automatically. */
export async function savePlacementReview(adminId: string, studentId: string, input: z.infer<typeof placementReviewSchema>) {
  await prisma.$transaction(async (tx) => {
    const r = await tx.placementReview.upsert({
      where: { studentId },
      create: { studentId, ...input, reviewedById: adminId, reviewedAt: new Date() },
      update: { ...input, reviewedById: adminId, reviewedAt: new Date() },
    });
    await audit({ actorId: adminId, action: "placement.review_updated", entityType: "PlacementReview", entityId: r.id, metadata: { studentId, status: input.status, refundStatus: input.refundStatus } }, tx);
  });
}
