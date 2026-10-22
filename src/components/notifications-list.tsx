import Link from "next/link";
import { prisma } from "@/lib/db";
import { dt } from "@/lib/display";
import { markNotificationsReadAction } from "@/app/portal/notification-actions";
import { ActionForm, SubmitButton } from "./forms";
import { Badge, Card, Empty } from "./ui";

/** Durable in-app notifications for the current user. */
export async function NotificationsList({ userId }: { userId: string }) {
  const items = await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <Card
      title={`Notifications${unread ? ` (${unread} unread)` : ""}`}
      actions={
        unread > 0 && (
          <ActionForm action={markNotificationsReadAction} className="row">
            <SubmitButton variant="secondary">Mark all as read</SubmitButton>
          </ActionForm>
        )
      }
      flush
    >
      {items.length === 0 ? (
        <Empty icon="bell" title="No notifications yet">New assignments, tests, replies, results and announcements will appear here.</Empty>
      ) : (
        <ul className="list">
          {items.map((n) => (
            <li key={n.id} style={{ background: n.readAt ? undefined : "#F4FBFA" }}>
              <div className="list__main">
                {n.link ? <Link href={n.link}>{n.title}</Link> : <span className="list__title">{n.title}</span>}
                {n.body && <span className="list__meta">{n.body}</span>}
                <span className="list__meta">{dt(n.createdAt)}</span>
              </div>
              {!n.readAt && <Badge tone="teal">New</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
