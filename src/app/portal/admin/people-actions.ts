"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/server/errors";
import { bool, dateOnly, optStr, str } from "@/server/form";
import {
  addFollowUpNote,
  addTrainerFeedback,
  batchSchema,
  createBatch,
  endEnrolment,
  enrolStudent,
  generateResetLink,
  interviewSchema,
  inviteSchema,
  inviteUser,
  moveStudent,
  placementReviewSchema,
  profileSchema,
  revokeInvitation,
  saveInterview,
  savePlacementReview,
  setBatchArchived,
  setSuspended,
  updateBatch,
  updateStudentProfile,
} from "@/server/people";
import { dateTime } from "@/server/form";
import { requireAdmin } from "@/server/session";

type R = ActionResult<{ redirect?: string; link?: string; emailed?: boolean }>;

export async function createBatchAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const input = batchSchema.parse({ name: str(fd, "name"), code: str(fd, "code"), description: optStr(fd, "description"), startDate: dateOnly(fd, "startDate") });
    const b = await createBatch(admin.id, input);
    revalidatePath("/portal/admin/batches");
    return { ok: true, message: "Batch created.", data: { redirect: `/portal/admin/batches/${b.id}` } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateBatchAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const input = batchSchema.parse({ name: str(fd, "name"), code: str(fd, "code"), description: optStr(fd, "description"), startDate: dateOnly(fd, "startDate") });
    await updateBatch(admin.id, str(fd, "id"), input);
    revalidatePath(`/portal/admin/batches/${str(fd, "id")}`);
    return { ok: true, message: "Batch updated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function archiveBatchAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const archive = str(fd, "archive") === "1";
    await setBatchArchived(admin.id, str(fd, "id"), archive);
    revalidatePath("/portal/admin/batches");
    return { ok: true, message: archive ? "Batch archived. Its history is kept." : "Batch restored." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function inviteAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const input = inviteSchema.parse({
      name: str(fd, "name"),
      email: str(fd, "email"),
      role: str(fd, "role") || "STUDENT",
      batchId: optStr(fd, "batchId"),
      startDate: dateOnly(fd, "startDate"),
    });
    const res = await inviteUser(admin.id, input);
    revalidatePath("/portal/admin/students");
    return {
      ok: true,
      message: res.emailed ? `Invitation emailed to ${input.email}.` : `Invitation created for ${input.email}. Share the link below with them.`,
      data: { link: res.link, emailed: res.emailed },
    };
  } catch (e) {
    return toActionError(e);
  }
}

export async function revokeInviteAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    await revokeInvitation(admin.id, str(fd, "id"));
    revalidatePath("/portal/admin/students");
    return { ok: true, message: "Invitation revoked." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function enrolAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const start = dateOnly(fd, "startDate") ?? new Date();
    await enrolStudent(admin.id, str(fd, "studentId"), str(fd, "batchId"), start);
    revalidatePath(`/portal/admin/students/${str(fd, "studentId")}`);
    return { ok: true, message: "Student enrolled." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function moveAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const effective = dateOnly(fd, "effective") ?? new Date();
    await moveStudent(admin.id, str(fd, "studentId"), str(fd, "fromBatchId"), str(fd, "toBatchId"), effective);
    revalidatePath(`/portal/admin/students/${str(fd, "studentId")}`);
    return { ok: true, message: "Student moved. Their history in the previous batch is kept." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function endEnrolmentAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    await endEnrolment(admin.id, str(fd, "enrolmentId"), str(fd, "reason"));
    revalidatePath(`/portal/admin/students/${str(fd, "studentId")}`);
    return { ok: true, message: "Enrolment ended." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function suspendAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const suspend = str(fd, "suspend") === "1";
    await setSuspended(admin.id, str(fd, "userId"), suspend, optStr(fd, "reason"));
    revalidatePath(`/portal/admin/students/${str(fd, "userId")}`);
    return { ok: true, message: suspend ? "Portal access suspended. Academic history is kept." : "Portal access restored." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function resetLinkAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const link = await generateResetLink(admin.id, str(fd, "userId"));
    return { ok: true, message: "Reset link created. It works once, for 1 hour.", data: { link } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateProfileAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const input = profileSchema.parse({ phone: optStr(fd, "phone"), graduationYear: optStr(fd, "graduationYear"), background: optStr(fd, "background") });
    const name = str(fd, "name").trim();
    await updateStudentProfile(admin.id, str(fd, "studentId"), { ...input, name: name.length >= 2 ? name : undefined });
    revalidatePath(`/portal/admin/students/${str(fd, "studentId")}`);
    return { ok: true, message: "Profile saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function noteAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const kind = str(fd, "kind");
    if (kind === "feedback") await addTrainerFeedback(admin.id, str(fd, "studentId"), str(fd, "body"));
    else await addFollowUpNote(admin.id, str(fd, "studentId"), str(fd, "body"));
    revalidatePath(`/portal/admin/students/${str(fd, "studentId")}`);
    return { ok: true, message: kind === "feedback" ? "Feedback shared with the student." : "Note saved (visible to admins only)." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function interviewAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const input = interviewSchema.parse({
      company: str(fd, "company"),
      scheduledAt: dateTime(fd, "scheduledAt"),
      attended: str(fd, "attended") || "UNKNOWN",
      outcome: str(fd, "outcome") || "PENDING",
      companyFeedback: optStr(fd, "companyFeedback"),
    });
    await saveInterview(admin.id, str(fd, "studentId"), optStr(fd, "interviewId"), input);
    revalidatePath(`/portal/admin/students/${str(fd, "studentId")}`);
    return { ok: true, message: "Interview record saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function placementReviewAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const input = placementReviewSchema.parse({ status: str(fd, "status"), refundStatus: str(fd, "refundStatus"), notes: optStr(fd, "notes") });
    if (!bool(fd, "confirm")) return { ok: false, error: "Confirm that this decision was reviewed by an authorised person.", fieldErrors: { confirm: "Required" } };
    await savePlacementReview(admin.id, str(fd, "studentId"), input);
    revalidatePath(`/portal/admin/students/${str(fd, "studentId")}`);
    return { ok: true, message: "Placement review recorded." };
  } catch (e) {
    return toActionError(e);
  }
}
