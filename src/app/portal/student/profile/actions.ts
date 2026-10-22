"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/server/errors";
import { optStr } from "@/server/form";
import { profileSchema, updateStudentProfile } from "@/server/people";
import { requireStudent } from "@/server/session";

export async function saveOwnProfileAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const me = await requireStudent();
    const input = profileSchema.parse({ phone: optStr(fd, "phone"), graduationYear: optStr(fd, "graduationYear"), background: optStr(fd, "background") });
    await updateStudentProfile(me.id, me.id, input);
    revalidatePath("/portal/student/profile");
    return { ok: true, message: "Details saved." };
  } catch (e) {
    return toActionError(e);
  }
}
