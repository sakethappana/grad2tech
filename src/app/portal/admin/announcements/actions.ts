"use server";

import { revalidatePath } from "next/cache";
import { announcementSchema, archiveAnnouncement, publishAnnouncement } from "@/server/announcements";
import { toActionError, type ActionResult } from "@/server/errors";
import { optStr, str } from "@/server/form";
import { requireAdmin } from "@/server/session";

export async function publishAnnouncementAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const input = announcementSchema.parse({ title: str(fd, "title"), body: str(fd, "body"), batchId: optStr(fd, "batchId") });
    await publishAnnouncement(admin.id, input);
    revalidatePath("/portal/admin/announcements");
    return { ok: true, message: "Announcement published and students notified." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function archiveAnnouncementAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await archiveAnnouncement(admin.id, str(fd, "id"));
    revalidatePath("/portal/admin/announcements");
    return { ok: true, message: "Announcement archived." };
  } catch (e) {
    return toActionError(e);
  }
}
