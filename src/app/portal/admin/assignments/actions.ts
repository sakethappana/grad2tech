"use server";

import { revalidatePath } from "next/cache";
import {
  assignmentSchema,
  cancelAssignment,
  createAssignment,
  publishAssignment,
  requestResubmission,
  reviewSchema,
  reviewSubmission,
  updateAssignment,
} from "@/server/assignments";
import { toActionError, type ActionResult } from "@/server/errors";
import { bool, dateTime, files, list, optDateTime, optStr, str } from "@/server/form";
import { requireAdmin } from "@/server/session";

type R = ActionResult<{ redirect?: string }>;

function parse(fd: FormData) {
  return assignmentSchema.parse({
    title: str(fd, "title"),
    instructions: str(fd, "instructions"),
    topic: str(fd, "topic"),
    difficulty: str(fd, "difficulty") || "MEDIUM",
    dueAt: dateTime(fd, "dueAt"),
    allowLate: bool(fd, "allowLate"),
    maxMarks: str(fd, "maxMarks") || 10,
    responseTypes: list(fd, "responseTypes"),
    batchIds: list(fd, "batchIds"),
    studentIds: list(fd, "studentIds"),
  });
}

export async function saveAssignmentAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const input = parse(fd);
    const id = optStr(fd, "id");
    if (id) {
      await updateAssignment(admin.id, id, input, files(fd, "resources"));
      revalidatePath(`/portal/admin/assignments/${id}`);
      return { ok: true, message: "Assignment saved.", data: { redirect: `/portal/admin/assignments/${id}` } };
    }
    const a = await createAssignment(admin.id, input, files(fd, "resources"));
    revalidatePath("/portal/admin/assignments");
    return { ok: true, message: "Draft created.", data: { redirect: `/portal/admin/assignments/${a.id}` } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function publishAssignmentAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const when = str(fd, "mode") === "schedule" ? optDateTime(fd, "publishAt") : null;
    if (str(fd, "mode") === "schedule" && !when) return { ok: false, error: "Choose when to publish.", fieldErrors: { publishAt: "Choose a date and time" } };
    await publishAssignment(admin.id, str(fd, "id"), when);
    revalidatePath(`/portal/admin/assignments/${str(fd, "id")}`);
    return { ok: true, message: when && when > new Date() ? "Publication scheduled." : "Published. Students can see it now." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function cancelAssignmentAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    await cancelAssignment(admin.id, str(fd, "id"));
    revalidatePath(`/portal/admin/assignments/${str(fd, "id")}`);
    return { ok: true, message: "Assignment cancelled. It is hidden from students and excluded from metrics." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reviewAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const sid = str(fd, "submissionId");
    if (str(fd, "decision") === "resubmit") {
      await requestResubmission(admin.id, sid, str(fd, "feedback"));
      revalidatePath(`/portal/admin/assignments/${str(fd, "assignmentId")}`);
      return { ok: true, message: "Resubmission requested. The student has been notified." };
    }
    const input = reviewSchema.parse({ marks: str(fd, "marks"), feedback: optStr(fd, "feedback") });
    await reviewSubmission(admin.id, sid, input);
    revalidatePath(`/portal/admin/assignments/${str(fd, "assignmentId")}`);
    return { ok: true, message: "Review saved. The student has been notified." };
  } catch (e) {
    return toActionError(e);
  }
}
