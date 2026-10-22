import { NotificationsList } from "@/components/notifications-list";
import { Badge, Card, Empty, Markdown, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt } from "@/lib/display";
import { activeBatchIds, visibleAnnouncementWhere } from "@/server/access";
import { pageStudent } from "@/server/session";

export const metadata = { title: "Notifications" };

export default async function StudentNotifications() {
  const me = await pageStudent("/portal/student/notifications");
  const batchIds = await activeBatchIds(me.id);
  const announcements = await prisma.announcement.findMany({
    where: visibleAnnouncementWhere(batchIds),
    orderBy: { publishedAt: "desc" },
    take: 20,
    include: { author: { select: { name: true } }, batch: { select: { code: true } } },
  });
  return (
    <>
      <PageHead title="Notifications" description="New work, deadlines, doubt replies, results, feedback and announcements." />
      <div className="grid grid--main-side">
        <NotificationsList userId={me.id} />
        <Card title="Announcements" flush>
          {announcements.length === 0 ? (
            <Empty icon="megaphone" title="No announcements" />
          ) : (
            <ul className="list">
              {announcements.map((a) => (
                <li key={a.id} id={`announcement-${a.id}`} style={{ alignItems: "flex-start" }}>
                  <div className="list__main">
                    <span className="list__title">{a.title}</span>
                    <span className="list__meta" style={{ marginBottom: 6 }}>
                      {a.batch ? <Badge plain>{a.batch.code}</Badge> : null} {a.author.name} · {dt(a.publishedAt)}
                    </span>
                    <Markdown>{a.body}</Markdown>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
