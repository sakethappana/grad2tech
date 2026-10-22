import type { NotificationType } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/db";

export type NotificationInput = {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  /** Unique per user; the same event never notifies twice. */
  dedupeKey: string;
};

/** Persists in-app notifications. Duplicate (userId, dedupeKey) pairs are ignored. */
export async function notify(userIds: string[], n: NotificationInput, tx?: Tx) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return 0;
  const client = tx ?? prisma;
  const res = await client.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      type: n.type,
      title: n.title.slice(0, 200),
      body: n.body?.slice(0, 500),
      link: n.link,
      dedupeKey: n.dedupeKey,
    })),
    skipDuplicates: true,
  });
  return res.count;
}

export async function activeAdminIds(tx?: Tx): Promise<string[]> {
  const client = tx ?? prisma;
  const admins = await client.user.findMany({ where: { role: "ADMIN", suspendedAt: null }, select: { id: true } });
  return admins.map((a) => a.id);
}
