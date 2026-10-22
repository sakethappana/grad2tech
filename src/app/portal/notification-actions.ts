"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { toActionError, type ActionResult } from "@/server/errors";
import { requireUser } from "@/server/session";

export async function markNotificationsReadAction(_: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    revalidatePath(user.role === "ADMIN" ? "/portal/admin/notifications" : "/portal/student/notifications");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
