import { Shell, type NavItem } from "@/components/shell";
import { tzName } from "@/lib/display";
import { pageAdmin } from "@/server/session";

const NAV: NavItem[] = [
  { href: "/portal/admin", label: "Overview", icon: "home", exact: true },
  { href: "/portal/admin/batches", label: "Batches", icon: "layers" },
  { href: "/portal/admin/students", label: "Students", icon: "users" },
  { href: "/portal/admin/assignments", label: "Assignments", icon: "clipboard" },
  { href: "/portal/admin/tests", label: "Tests", icon: "test" },
  { href: "/portal/admin/doubts", label: "Doubts", icon: "question" },
  { href: "/portal/admin/classes", label: "Live Classes", icon: "video" },
  { href: "/portal/admin/projects", label: "Projects", icon: "folder" },
  { href: "/portal/admin/reports", label: "Reports", icon: "chart" },
  { href: "/portal/admin/announcements", label: "Announcements", icon: "megaphone" },
  { href: "/portal/admin/settings", label: "Settings", icon: "settings" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await pageAdmin();
  return (
    <Shell role="ADMIN" user={{ name: user.name, email: user.email }} nav={NAV} tzLabel={tzName()} notificationsHref="/portal/admin/notifications">
      {children}
    </Shell>
  );
}
