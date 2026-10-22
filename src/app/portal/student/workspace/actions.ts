"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/server/errors";
import { optStr, str } from "@/server/form";
import { requireStudent } from "@/server/session";
import { archiveProject, createProject, submitProject } from "@/server/workspace/projects";

type R = ActionResult<{ redirect?: string }>;

export async function createProjectAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const me = await requireStudent();
    const p = await createProject(me.id, { name: str(fd, "name"), template: str(fd, "template"), briefId: optStr(fd, "briefId") });
    revalidatePath("/portal/student/workspace");
    return { ok: true, data: { redirect: `/portal/student/workspace/${p.id}` } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function submitProjectAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const me = await requireStudent();
    const s = await submitProject(me, str(fd, "projectId"), optStr(fd, "note"));
    revalidatePath("/portal/student/projects");
    return { ok: true, message: `Submitted a fixed copy of ${s.fileCount} files for review. You can keep editing; later changes are not part of this submission.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function archiveProjectAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const me = await requireStudent();
    await archiveProject(me.id, str(fd, "projectId"));
    revalidatePath("/portal/student/workspace");
    return { ok: true, message: "Project archived.", data: { redirect: "/portal/student/workspace" } };
  } catch (e) {
    return toActionError(e);
  }
}
