/** Typed application errors. Messages are safe to show to the user. */

export class AppError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 422 | 429 | 503 = 400,
    readonly code: string = "BAD_REQUEST",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthenticated = () => new AppError("Your session has expired. Please log in again.", 401, "UNAUTHENTICATED");
export const forbidden = (msg = "You do not have permission to do that.") => new AppError(msg, 403, "FORBIDDEN");
export const notFound = (what = "That item") => new AppError(`${what} was not found.`, 404, "NOT_FOUND");
export const conflict = (msg: string) => new AppError(msg, 409, "CONFLICT");
export const invalid = (msg: string) => new AppError(msg, 422, "INVALID");
export const tooMany = (msg: string) => new AppError(msg, 429, "RATE_LIMITED");
export const unavailable = (msg: string) => new AppError(msg, 503, "UNAVAILABLE");

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Result shape returned by Server Actions to forms. */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Converts thrown errors into a safe ActionResult; unexpected errors are logged without details leaking. */
export function toActionError(e: unknown): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  if (isAppError(e)) return { ok: false, error: e.message };
  if (e && typeof e === "object" && "issues" in e && Array.isArray((e as { issues: unknown[] }).issues)) {
    const issues = (e as { issues: { path: (string | number)[]; message: string }[] }).issues;
    const fieldErrors: Record<string, string> = {};
    for (const i of issues) {
      const key = String(i.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = i.message;
    }
    return { ok: false, error: "Please correct the highlighted fields.", fieldErrors };
  }
  console.error("[action] unexpected error", e instanceof Error ? e.message : e);
  return { ok: false, error: "Something went wrong. Please try again." };
}
