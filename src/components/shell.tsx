"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { Icon, Wordmark, type IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName; exact?: boolean };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function Shell({
  role,
  user,
  nav,
  tzLabel,
  notificationsHref,
  children,
}: {
  role: "ADMIN" | "STUDENT";
  user: { name: string; email: string };
  nav: NavItem[];
  tzLabel: string;
  notificationsHref: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const lastSeen = useRef<string | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Short polling for durable notifications. A new notification refreshes server data so
  // newly published work appears in an open dashboard; reconnecting reconciles from the database.
  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/summary", { cache: "no-store" });
      if (res.status === 401) {
        setExpired(true);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number; latestId: string | null };
      setUnread(data.unread);
      if (lastSeen.current !== null && data.latestId && data.latestId !== lastSeen.current) router.refresh();
      lastSeen.current = data.latestId ?? "";
    } catch {
      // offline: try again on the next tick or when the connection returns
    }
  }, [router]);

  useEffect(() => {
    poll();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, 20_000);
    const onWake = () => {
      poll();
      router.refresh();
    };
    window.addEventListener("online", onWake);
    const onVis = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [poll, router]);

  async function signOut() {
    await authClient.signOut();
    router.replace("/portal/login?signedout=1");
    router.refresh();
  }

  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/"));
  const current = nav.find(isActive);

  return (
    <div className={`shell${open ? " is-open" : ""}`}>
      <aside className="sidebar" aria-label="Portal navigation">
        <div className="sidebar__top">
          <Wordmark light href={role === "ADMIN" ? "/portal/admin" : "/portal/student"} />
          <button type="button" className="sidebar__close" onClick={() => setOpen(false)} aria-label="Close menu">
            <Icon name="x" />
          </button>
        </div>
        <p className="sidebar__role">{role === "ADMIN" ? "Admin · Trainer" : "Student"}</p>
        <nav>
          <ul>
            {nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} aria-current={isActive(item) ? "page" : undefined}>
                  <Icon name={item.icon} />
                  {item.label}
                  {item.href === notificationsHref && unread ? <span className="sidebar__count">{unread > 99 ? "99+" : unread}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar__user">
          <span className="avatar" aria-hidden="true">
            {initials(user.name)}
          </span>
          <div>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <button type="button" className="sidebar__logout" onClick={signOut} aria-label="Sign out" title="Sign out">
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="main">
        <header className="topbar">
          <button
            ref={menuButton}
            type="button"
            className="topbar__menu"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
          >
            <Icon name="menu" />
          </button>
          <div className="topbar__crumbs">{current?.label ?? ""}</div>
          <div className="topbar__right">
            <span className="tz" title="All times are shown in this timezone">
              Times in {tzLabel}
            </span>
            <Link className="bell" href={notificationsHref} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
              <Icon name="bell" />
              {unread ? <span className="bell__dot">{unread > 99 ? "99+" : unread}</span> : null}
            </Link>
          </div>
        </header>
        {expired && (
          <div className="content" style={{ paddingBottom: 0 }}>
            <div className="alert alert--warn" role="alert">
              <Icon name="alert" />
              <div>
                Your session has ended. <a href={`/portal/login?expired=1&next=${encodeURIComponent(pathname)}`}>Sign in again</a> to continue — unsaved work on this page is kept until you leave it.
              </div>
            </div>
          </div>
        )}
        <main id="main" className="content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
