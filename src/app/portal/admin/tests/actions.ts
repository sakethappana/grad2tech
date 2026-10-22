"use server";

import { revalidatePath } from "next/cache";
import {
  assessmentSettingsSchema,
  cancelAssessment,
  createAssessment,
  createRevision,
  deleteQuestion,
  discardRevision,
  publishAssessment,
  publishRevision,
  questionSchema,
  releaseResults,
  updateAssessmentSettings,
  upsertQuestion,
} from "@/server/assessments/admin";
import { gradeAnswerManually, retryGrading } from "@/server/assessments/grading";
import { toActionError, type ActionResult } from "@/server/errors";
import { bool, dateTime, list, optDateTime, optStr, str } from "@/server/form";
import { requireAdmin } from "@/server/session";

type R = ActionResult<{ redirect?: string }>;

function parseSettings(fd: FormData) {
  return assessmentSettingsSchema.parse({
    title: str(fd, "title"),
    instructions: str(fd, "instructions"),
    kind: str(fd, "kind") || "PRACTICE",
    opensAt: dateTime(fd, "opensAt"),
    closesAt: dateTime(fd, "closesAt"),
    durationMinutes: str(fd, "durationMinutes"),
    maxAttempts: str(fd, "maxAttempts") || 1,
    passPercent: optStr(fd, "passPercent"),
    randomizeQuestions: bool(fd, "randomizeQuestions"),
    resultPolicy: str(fd, "resultPolicy") || "MANUAL",
    solutionPolicy: str(fd, "solutionPolicy") || "NEVER",
    helpPolicy: str(fd, "helpPolicy") || "NO_HELP_WHILE_OPEN",
    batchIds: list(fd, "batchIds"),
    studentIds: list(fd, "studentIds"),
  });
}

export async function saveTestSettingsAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const input = parseSettings(fd);
    const id = optStr(fd, "id");
    if (id) {
      await updateAssessmentSettings(admin.id, id, input);
      revalidatePath(`/portal/admin/tests/${id}`);
      return { ok: true, message: "Settings saved." };
    }
    const a = await createAssessment(admin.id, input);
    return { ok: true, data: { redirect: `/portal/admin/tests/${a.id}` } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveQuestionAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    let raw: unknown;
    try {
      raw = JSON.parse(str(fd, "payload"));
    } catch {
      return { ok: false, error: "The question could not be read. Please try again." };
    }
    const input = questionSchema.parse(raw);
    const assessmentId = str(fd, "assessmentId");
    await upsertQuestion(admin.id, assessmentId, optStr(fd, "questionId"), input);
    revalidatePath(`/portal/admin/tests/${assessmentId}`);
    return { ok: true, message: "Question saved.", data: { redirect: `/portal/admin/tests/${assessmentId}#questions` } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteQuestionAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    await deleteQuestion(admin.id, str(fd, "assessmentId"), str(fd, "questionId"));
    revalidatePath(`/portal/admin/tests/${str(fd, "assessmentId")}`);
    return { ok: true, message: "Question deleted." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function publishTestAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const when = str(fd, "mode") === "schedule" ? optDateTime(fd, "publishAt") : null;
    await publishAssessment(admin.id, str(fd, "id"), when);
    revalidatePath(`/portal/admin/tests/${str(fd, "id")}`);
    return { ok: true, message: "Published. The question set is now frozen." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function revisionAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const id = str(fd, "id");
    const op = str(fd, "op");
    if (op === "create") await createRevision(admin.id, id);
    else if (op === "publish") await publishRevision(admin.id, id);
    else if (op === "discard") await discardRevision(admin.id, id);
    revalidatePath(`/portal/admin/tests/${id}`);
    return {
      ok: true,
      message:
        op === "create"
          ? "Revision created. Edit its questions, then publish it."
          : op === "publish"
            ? "Revision published. New attempts use it; attempts already started keep their version."
            : "Revision discarded.",
    };
  } catch (e) {
    return toActionError(e);
  }
}

export async function cancelTestAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    await cancelAssessment(admin.id, str(fd, "id"));
    revalidatePath(`/portal/admin/tests/${str(fd, "id")}`);
    return { ok: true, message: "Test cancelled. Attempts are kept for the record." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function releaseResultsAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const n = await releaseResults(admin.id, str(fd, "id"));
    revalidatePath(`/portal/admin/tests/${str(fd, "id")}`);
    return { ok: true, message: `Results released. ${n} student${n === 1 ? "" : "s"} notified; ungraded attempts will be released as grading completes.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function gradeAnswerAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const marks = Number(str(fd, "marks"));
    if (str(fd, "marks").trim() === "" || Number.isNaN(marks)) return { ok: false, error: "Enter the marks.", fieldErrors: { marks: "Required" } };
    await gradeAnswerManually(admin.id, str(fd, "answerId"), marks, optStr(fd, "feedback"));
    revalidatePath(str(fd, "path") || "/portal/admin/tests");
    return { ok: true, message: "Marks saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function retryGradingAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    await retryGrading(admin.id, str(fd, "answerId"));
    revalidatePath(str(fd, "path") || "/portal/admin/tests");
    return { ok: true, message: "Queued for grading again." };
  } catch (e) {
    return toActionError(e);
  }
}
