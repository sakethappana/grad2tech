import { prisma } from "@/lib/db";
import { jsonError } from "@/server/http";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

/** Unread count and the newest notification id, for the bell and live refresh. */
export async function GET() {
  try {
    const user = await requireUser();
    const [unread, latest] = await Promise.all([
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
      prisma.notification.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { id: true } }),
    ]);
    return Response.json({ unread, latestId: latest?.id ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(e);
  }
}
