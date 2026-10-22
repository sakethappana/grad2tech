import nodemailer from "nodemailer";
import { env } from "@/lib/env";

/**
 * Optional email delivery. The portal never depends on email: when SMTP is not configured,
 * invitation and reset links are shown to the admin to share manually.
 */
export function emailConfigured(): boolean {
  return Boolean(env().SMTP_URL);
}

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!emailConfigured()) return false;
  try {
    transport ??= nodemailer.createTransport(env().SMTP_URL);
    await transport.sendMail({ from: env().EMAIL_FROM, to, subject, text });
    return true;
  } catch (e) {
    // Never log message bodies: they may contain one-time links.
    console.error("[email] delivery failed:", e instanceof Error ? e.message : "unknown error");
    return false;
  }
}
