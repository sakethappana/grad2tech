"use server";

import { startAttempt } from "@/server/assessments/attempts";
import { toActionError, type ActionResult } from "@/server/errors";
import { str } from "@/server/form";
import { requireStudent } from "@/server/session";

/** Starts or resumes an attempt; the server creates it and sets the deadline. */
export async function startAttemptAction(_: ActionResult | null, fd: FormData): Promise<ActionResult<{ redirect?: string }>> {
  try {
    const me = await requireStudent();
    const id = str(fd, "assessmentId");
    const attempt = await startAttempt(me.id, id);
    return { ok: true, data: { redirect: `/portal/student/tests/${id}/attempts/${attempt.id}` } };
  } catch (e) {
    return toActionError(e);
  }
}
