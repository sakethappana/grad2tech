import { NotificationsList } from "@/components/notifications-list";
import { PageHead } from "@/components/ui";
import { pageAdmin } from "@/server/session";

export const metadata = { title: "Notifications" };

export default async function AdminNotifications() {
  const admin = await pageAdmin("/portal/admin/notifications");
  return (
    <>
      <PageHead title="Notifications" description="New doubts, replies and project submissions." />
      <NotificationsList userId={admin.id} />
    </>
  );
}
