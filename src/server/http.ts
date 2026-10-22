import { env } from "@/lib/env";
import { AppError, isAppError } from "@/server/errors";

/** JSON error response for route handlers. Unexpected errors never leak details. */
export function jsonError(e: unknown) {
  if (isAppError(e)) return Response.json({ error: e.message, code: e.code }, { status: e.status, headers: { "Cache-Control": "no-store" } });
  if (e && typeof e === "object" && "issues" in e) {
    const issues = (e as { issues: { message: string }[] }).issues;
    return Response.json({ error: issues[0]?.message ?? "Invalid request", code: "INVALID" }, { status: 422 });
  }
  console.error("[api] unexpected error:", e instanceof Error ? e.message : e);
  return Response.json({ error: "Something went wrong. Please try again.", code: "INTERNAL" }, { status: 500 });
}

/**
 * CSRF protection for state-changing JSON routes: the request must come from this site.
 * (Server Actions get the same check from Next.js; session cookies are also SameSite=Lax.)
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const allowed = new Set<string>();
  if (host) allowed.add(host);
  try {
    allowed.add(new URL(env().APP_URL).host);
  } catch {}
  if (!origin) throw new AppError("Missing request origin.", 403, "FORBIDDEN");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("Invalid request origin.", 403, "FORBIDDEN");
  }
  if (!allowed.has(originHost)) throw new AppError("Cross-site requests are not allowed.", 403, "FORBIDDEN");
}

export async function readJson<T>(req: Request, maxBytes = 300_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError("Request is too large.", 413, "TOO_LARGE");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppError("Invalid JSON body.", 400, "BAD_REQUEST");
  }
}
