import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { forbidden, unauthenticated } from "@/server/errors";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "STUDENT";
};

/**
 * Reads the session from the request and re-checks the user record in the database.
 * Role always comes from the database, never from the client or the login option chosen.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, suspendedAt: true },
  });
  if (!user || user.suspendedAt) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
});

/** For Server Actions and route handlers: throws AppError instead of redirecting. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthenticated();
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw forbidden();
  return user;
}

export async function requireStudent(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "STUDENT") throw forbidden();
  return user;
}

/** For pages and layouts: redirects to login (or the user's own portal) instead of throwing. */
export async function pageUser(nextPath?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    const q = new URLSearchParams({ expired: "1" });
    if (nextPath) q.set("next", nextPath);
    redirect(`/portal/login?${q.toString()}`);
  }
  return user;
}

export async function pageAdmin(nextPath?: string): Promise<CurrentUser> {
  const user = await pageUser(nextPath);
  if (user.role !== "ADMIN") redirect("/portal/student");
  return user;
}

export async function pageStudent(nextPath?: string): Promise<CurrentUser> {
  const user = await pageUser(nextPath);
  if (user.role !== "STUDENT") redirect("/portal/admin");
  return user;
}

export function homeFor(role: CurrentUser["role"]) {
  return role === "ADMIN" ? "/portal/admin" : "/portal/student";
}
