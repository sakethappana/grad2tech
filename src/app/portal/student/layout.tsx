import { Shell, type NavItem } from "@/components/shell";
import { tzName } from "@/lib/display";
import { pageStudent } from "@/server/session";

const NAV: NavItem[] = [
  { href: "/portal/student", label: "Dashboard", icon: "home", exact: true },
  { href: "/portal/student/learning", label: "My Learning", icon: "book" },
  { href: "/portal/student/assignments", label: "Assignments", icon: "clipboard" },
  { href: "/portal/student/tests", label: "Tests", icon: "test" },
  { href: "/portal/student/playground", label: "Coding Playground", icon: "code" },
  { href: "/portal/student/workspace", label: "Full Stack Workspace", icon: "terminal" },
  { href: "/portal/student/doubts", label: "My Doubts", icon: "question" },
  { href: "/portal/student/projects", label: "Projects", icon: "folder" },
  { href: "/portal/student/performance", label: "Performance", icon: "chart" },
  { href: "/portal/student/notifications", label: "Notifications", icon: "bell" },
  { href: "/portal/student/profile", label: "Profile", icon: "user" },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await pageStudent();
  return (
    <Shell role="STUDENT" user={{ name: user.name, email: user.email }} nav={NAV} tzLabel={tzName()} notificationsHref="/portal/student/notifications">
      {children}
    </Shell>
  );
}
