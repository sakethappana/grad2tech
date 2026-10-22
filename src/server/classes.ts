import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { conflict, invalid, notFound } from "@/server/errors";
import { notify } from "@/server/notifications";
import { formatDateTime } from "@/lib/time";

export const classSchema = z.object({
  batchId: z.string().min(1, "Choose a batch"),
  topic: z.string().trim().min(3, "Enter the class topic").max(150),
  instructorId: z.string().min(1, "Choose an instructor"),
  startsAt: z.date({ message: "Choose the start time" }),
  durationMinutes: z.coerce.number().int().min(15, "At least 15 minutes").max(480),
  meetingUrl: z
    .string()
    .trim()
    .url("Enter a valid meeting link")
    .refine((v) => /^https:\/\//i.test(v), "Meeting links must use https://"),
  resources: z.string().trim().max(10_000).nullable().default(null),
});

export type ClassInput = z.infer<typeof classSchema>;

async function batchStudentIds(batchId: string) {
  const rows = await prisma.enrolment.findMany({
    where: { batchId, status: "ACTIVE", student: { suspendedAt: null } },
    select: { studentId: true },
  });
  return rows.map((r) => r.studentId);
}

async function assertRefs(input: ClassInput) {
  const batch = await prisma.batch.findUnique({ where: { id: input.batchId } });
  if (!batch || batch.archivedAt) throw invalid("Choose an active batch.");
  const instructor = await prisma.user.findFirst({ where: { id: input.instructorId, role: "ADMIN", suspendedAt: null } });
  if (!instructor) throw invalid("Choose an active trainer as instructor.");
}

export async function scheduleClass(adminId: string, input: ClassInput) {
  await assertRefs(input);
  const session = await prisma.$transaction(async (tx) => {
    const s = await tx.classSession.create({ data: { ...input, createdById: adminId } });
    await audit({ actorId: adminId, action: "class.scheduled", entityType: "ClassSession", entityId: s.id }, tx);
    return s;
  });
  await notify(await batchStudentIds(input.batchId), {
    type: "CLASS_SCHEDULED",
    title: `Live class scheduled: ${input.topic}`,
    body: formatDateTime(input.startsAt),
    link: "/portal/student/learning",
    dedupeKey: `class:${session.id}`,
  });
  return session;
}

export async function updateClass(adminId: string, id: string, input: ClassInput) {
  const existing = await prisma.classSession.findUnique({ where: { id } });
  if (!existing) throw notFound("Class");
  if (existing.cancelledAt) throw conflict("Cancelled classes cannot be edited.");
  await assertRefs(input);
  await prisma.$transaction(async (tx) => {
    await tx.classSession.update({ where: { id }, data: input });
    await audit({ actorId: adminId, action: "class.updated", entityType: "ClassSession", entityId: id }, tx);
  });
  if (existing.startsAt.getTime() !== input.startsAt.getTime()) {
    await notify(await batchStudentIds(input.batchId), {
      type: "CLASS_SCHEDULED",
      title: `Class time changed: ${input.topic}`,
      body: formatDateTime(input.startsAt),
      link: "/portal/student/learning",
      dedupeKey: `class:${id}:${input.startsAt.getTime()}`,
    });
  }
}

export async function cancelClass(adminId: string, id: string) {
  const s = await prisma.classSession.findUnique({ where: { id } });
  if (!s) throw notFound("Class");
  if (s.cancelledAt) return;
  await prisma.$transaction(async (tx) => {
    await tx.classSession.update({ where: { id }, data: { cancelledAt: new Date() } });
    await audit({ actorId: adminId, action: "class.cancelled", entityType: "ClassSession", entityId: id }, tx);
  });
  await notify(await batchStudentIds(s.batchId), {
    type: "CLASS_SCHEDULED",
    title: `Class cancelled: ${s.topic}`,
    body: formatDateTime(s.startsAt),
    link: "/portal/student/learning",
    dedupeKey: `class-cancelled:${id}`,
  });
}

export const ATTENDANCE_STATUSES = ["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const;

/** Attendance is recorded manually by trainers. Opening a meeting link never counts as attendance. */
export async function recordAttendance(
  adminId: string,
  sessionId: string,
  marks: { studentId: string; status: (typeof ATTENDANCE_STATUSES)[number] }[],
) {
  const s = await prisma.classSession.findUnique({ where: { id: sessionId } });
  if (!s) throw notFound("Class");
  if (s.cancelledAt) throw conflict("Attendance cannot be recorded for a cancelled class.");
  if (s.startsAt > new Date()) throw conflict("Attendance can be recorded once the class has started.");
  const enrolled = new Set(
    (
      await prisma.enrolment.findMany({
        where: { batchId: s.batchId, startDate: { lte: new Date(s.startsAt.getTime() + s.durationMinutes * 60_000) }, OR: [{ endDate: null }, { endDate: { gte: s.startsAt } }] },
        select: { studentId: true },
      })
    ).map((e) => e.studentId),
  );
  const valid = marks.filter((m) => enrolled.has(m.studentId));
  await prisma.$transaction(async (tx) => {
    for (const m of valid) {
      await tx.attendance.upsert({
        where: { sessionId_studentId: { sessionId, studentId: m.studentId } },
        create: { sessionId, studentId: m.studentId, status: m.status, markedById: adminId },
        update: { status: m.status, markedById: adminId, markedAt: new Date() },
      });
    }
    await audit({ actorId: adminId, action: "attendance.recorded", entityType: "ClassSession", entityId: sessionId, metadata: { count: valid.length } }, tx);
  });
  return valid.length;
}
