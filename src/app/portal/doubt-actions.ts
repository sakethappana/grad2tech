"use server";

import { revalidatePath } from "next/cache";
import { assignDoubt, createDoubt, doubtSchema, replySchema, replyToDoubt, setDoubtStatus } from "@/server/doubts";
import { toActionError, type ActionResult } from "@/server/errors";
import { files, optStr, str } from "@/server/form";
import { requireAdmin, requireStudent, requireUser } from "@/server/session";

type R = ActionResult<{ redirect?: string }>;

export async function createDoubtAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const student = await requireStudent();
    const link = str(fd, "link");
    const [kind, linkId] = link.includes(":") ? link.split(":") : ["", ""];
    const input = doubtSchema.parse({
      title: str(fd, "title"),
      body: str(fd, "body"),
      topic: str(fd, "topic"),
      codeSnippet: optStr(fd, "codeSnippet"),
      codeLanguage: optStr(fd, "codeLanguage"),
      visibility: str(fd, "visibility") === "BATCH" ? "BATCH" : "PRIVATE",
      assignmentId: kind === "assignment" ? linkId : null,
      assessmentId: kind === "test" ? linkId : null,
      projectBriefId: kind === "project" ? linkId : null,
    });
    const t = await createDoubt(student, input, files(fd, "screenshots"));
    revalidatePath("/portal/student/doubts");
    return { ok: true, data: { redirect: `/portal/student/doubts/${t.id}` } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function replyDoubtAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const user = await requireUser();
    const input = replySchema.parse({ body: str(fd, "body"), codeSnippet: optStr(fd, "codeSnippet"), codeLanguage: optStr(fd, "codeLanguage") });
    await replyToDoubt(user, str(fd, "threadId"), input, files(fd, "screenshots"));
    revalidatePath(user.role === "ADMIN" ? `/portal/admin/doubts/${str(fd, "threadId")}` : `/portal/student/doubts/${str(fd, "threadId")}`);
    return { ok: true, message: "Reply posted." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function doubtStatusAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const user = await requireUser();
    const status = str(fd, "status");
    if (status !== "OPEN" && status !== "IN_PROGRESS" && status !== "RESOLVED") return { ok: false, error: "Unknown status." };
    await setDoubtStatus(user, str(fd, "threadId"), status);
    revalidatePath(user.role === "ADMIN" ? `/portal/admin/doubts/${str(fd, "threadId")}` : `/portal/student/doubts/${str(fd, "threadId")}`);
    return { ok: true, message: status === "RESOLVED" ? "Marked as resolved." : status === "OPEN" ? "Doubt reopened." : "Marked as in progress." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function assignDoubtAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    await assignDoubt(admin.id, str(fd, "threadId"), optStr(fd, "assigneeId"));
    revalidatePath(`/portal/admin/doubts/${str(fd, "threadId")}`);
    return { ok: true, message: "Assignment updated." };
  } catch (e) {
    return toActionError(e);
  }
}
