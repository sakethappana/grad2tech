"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

/** Maps Better Auth error codes to clear messages for students and trainers. */
export function authErrorMessage(err: { code?: string; message?: string; status?: number } | null | undefined): string {
  if (!err) return "Something went wrong. Please try again.";
  if (err.status === 429) return "Too many attempts. Please wait a minute and try again.";
  switch (err.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password combination is not correct.";
    case "INVALID_TOKEN":
      return "This reset link is invalid or has expired. Request a new one.";
    case "PASSWORD_TOO_SHORT":
      return "Use at least 10 characters for your password.";
    case "PASSWORD_TOO_LONG":
      return "Use at most 128 characters for your password.";
  }
  if (err.status === 403 && err.message) return err.message;
  return err.message || "Something went wrong. Please try again.";
}

/** Only allow redirects to portal paths on this site. */
export function safeNext(next: string | null | undefined): string {
  if (next && next.startsWith("/portal/") && !next.startsWith("//") && !next.includes("\\")) return next;
  return "/portal/home";
}
