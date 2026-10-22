import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/server/audit";
import { invalid } from "@/server/errors";
import { notify } from "@/server/notifications";

export const announcementSchema = z.object({
  title: z.string().trim().min(3, "Enter a title").max(150),
  body: z.string().trim().min(1, "Write the announcement").max(20_000),
  batchId: z.string().nullable().default(null),
});

export async function publishAnnouncement(adminId: string, input: z.infer<typeof announcementSchema>) {
  if (input.batchId) {
    const b = await prisma.batch.findUnique({ where: { id: input.batchId } });
    if (!b || b.archivedAt) throw invalid("Choose an active batch.");
  }
  const a = await prisma.$transaction(async (tx) => {
    const a = await tx.announcement.create({ data: { ...input, authorId: adminId } });
    await audit({ actorId: adminId, action: "announcement.published", entityType: "Announcement", entityId: a.id, metadata: { batchId: input.batchId } }, tx);
    return a;
  });
  const recipients = await prisma.enrolment.findMany({
    where: { status: "ACTIVE", ...(input.batchId ? { batchId: input.batchId } : { batch: { archivedAt: null } }), student: { suspendedAt: null } },
    select: { studentId: true },
  });
  await notify(recipients.map((r) => r.studentId), {
    type: "ANNOUNCEMENT",
    title: input.title,
    body: input.body.slice(0, 200),
    link: `/portal/student/notifications#announcement-${a.id}`,
    dedupeKey: `announcement:${a.id}`,
  });
  return a;
}

export async function archiveAnnouncement(adminId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    await tx.announcement.update({ where: { id }, data: { archivedAt: new Date() } });
    await audit({ actorId: adminId, action: "announcement.published", entityType: "Announcement", entityId: id, metadata: { archived: true } }, tx);
  });
}
