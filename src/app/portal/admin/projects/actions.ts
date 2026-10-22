"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/server/errors";
import { list, optDateTime, optStr, str } from "@/server/form";
import { requireAdmin } from "@/server/session";
import { briefSchema, projectReviewSchema, publishBrief, reviewProjectSubmission, saveBrief } from "@/server/workspace/projects";

type R = ActionResult<{ redirect?: string }>;

export async function saveBriefAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const input = briefSchema.parse({
      title: str(fd, "title"),
      description: str(fd, "description"),
      starterTemplate: str(fd, "starterTemplate"),
      dueAt: optDateTime(fd, "dueAt"),
      maxMarks: str(fd, "maxMarks") || 100,
      batchIds: list(fd, "batchIds"),
      studentIds: list(fd, "studentIds"),
    });
    const id = optStr(fd, "id");
    const b = await saveBrief(admin.id, id, input);
    revalidatePath("/portal/admin/projects");
    return id ? { ok: true, message: "Project saved." } : { ok: true, data: { redirect: `/portal/admin/projects/${b.id}` } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function publishBriefAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    await publishBrief(admin.id, str(fd, "id"), str(fd, "mode") === "schedule" ? optDateTime(fd, "publishAt") : null);
    revalidatePath(`/portal/admin/projects/${str(fd, "id")}`);
    return { ok: true, message: "Project published." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reviewProjectAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const input = projectReviewSchema.parse({ decision: str(fd, "decision") || "REVIEWED", marks: optStr(fd, "marks"), feedback: optStr(fd, "feedback") });
    await reviewProjectSubmission(admin.id, str(fd, "id"), input);
    revalidatePath(`/portal/admin/projects/submissions/${str(fd, "id")}`);
    return { ok: true, message: "Review saved. The student has been notified." };
  } catch (e) {
    return toActionError(e);
  }
}
