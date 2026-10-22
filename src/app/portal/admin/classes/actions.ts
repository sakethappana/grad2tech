"use server";

import { revalidatePath } from "next/cache";
import { ATTENDANCE_STATUSES, cancelClass, classSchema, recordAttendance, scheduleClass, updateClass } from "@/server/classes";
import { toActionError, type ActionResult } from "@/server/errors";
import { dateTime, optStr, str } from "@/server/form";
import { requireAdmin } from "@/server/session";

type R = ActionResult<{ redirect?: string }>;

export async function saveClassAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const input = classSchema.parse({
      batchId: str(fd, "batchId"),
      topic: str(fd, "topic"),
      instructorId: str(fd, "instructorId"),
      startsAt: dateTime(fd, "startsAt"),
      durationMinutes: str(fd, "durationMinutes"),
      meetingUrl: str(fd, "meetingUrl"),
      resources: optStr(fd, "resources"),
    });
    const id = optStr(fd, "id");
    if (id) {
      await updateClass(admin.id, id, input);
      revalidatePath(`/portal/admin/classes/${id}`);
      return { ok: true, message: "Class updated." };
    }
    const s = await scheduleClass(admin.id, input);
    revalidatePath("/portal/admin/classes");
    return { ok: true, message: "Class scheduled and students notified.", data: { redirect: `/portal/admin/classes/${s.id}` } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function cancelClassAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    await cancelClass(admin.id, str(fd, "id"));
    revalidatePath(`/portal/admin/classes/${str(fd, "id")}`);
    return { ok: true, message: "Class cancelled. Students have been notified." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function attendanceAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const admin = await requireAdmin();
    const marks: { studentId: string; status: (typeof ATTENDANCE_STATUSES)[number] }[] = [];
    for (const [key, value] of fd.entries()) {
      if (!key.startsWith("att_") || typeof value !== "string" || !value) continue;
      if (!(ATTENDANCE_STATUSES as readonly string[]).includes(value)) continue;
      marks.push({ studentId: key.slice(4), status: value as (typeof ATTENDANCE_STATUSES)[number] });
    }
    if (marks.length === 0) return { ok: false, error: "Mark at least one student." };
    const n = await recordAttendance(admin.id, str(fd, "sessionId"), marks);
    revalidatePath(`/portal/admin/classes/${str(fd, "sessionId")}`);
    return { ok: true, message: `Attendance saved for ${n} student${n === 1 ? "" : "s"}.` };
  } catch (e) {
    return toActionError(e);
  }
}
