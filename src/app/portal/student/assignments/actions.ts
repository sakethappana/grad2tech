"use server";

import { revalidatePath } from "next/cache";
import { saveSubmissionDraft, submissionSchema, submitAssignment } from "@/server/assignments";
import { toActionError, type ActionResult } from "@/server/errors";
import { deleteOwnSubmissionFile } from "@/server/files";
import { files, optStr, str } from "@/server/form";
import { requireStudent } from "@/server/session";

export async function submissionAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const me = await requireStudent();
    const id = str(fd, "assignmentId");
    const input = submissionSchema.parse({
      textResponse: optStr(fd, "textResponse"),
      code: optStr(fd, "code"),
      codeLanguage: optStr(fd, "codeLanguage"),
      linkUrl: optStr(fd, "linkUrl"),
    });
    if (str(fd, "intent") === "submit") {
      const s = await submitAssignment(me.id, id, input, files(fd, "files"));
      revalidatePath(`/portal/student/assignments/${id}`);
      return { ok: true, message: `Submitted ${s.isLate ? "(late) " : ""}— your trainer will review it. Revision ${s.revision}.` };
    }
    await saveSubmissionDraft(me.id, id, input, files(fd, "files"));
    revalidatePath(`/portal/student/assignments/${id}`);
    return { ok: true, message: "Draft saved. It is not submitted yet." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteFileAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const me = await requireStudent();
    await deleteOwnSubmissionFile(me.id, str(fd, "fileId"));
    revalidatePath(`/portal/student/assignments/${str(fd, "assignmentId")}`);
    return { ok: true, message: "File removed." };
  } catch (e) {
    return toActionError(e);
  }
}
