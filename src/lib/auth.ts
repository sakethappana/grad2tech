import { AsyncLocalStorage } from "node:async_hooks";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail } from "@/server/email";

/**
 * When an admin generates a reset link for a student, the link is captured here
 * instead of being emailed, so the admin can share it directly.
 */
export const resetLinkCapture = new AsyncLocalStorage<{ url?: string }>();

const config = env();

export const auth = betterAuth({
  appName: "Grad2Tech",
  baseURL: config.APP_URL,
  basePath: "/api/auth",
  secret: config.BETTER_AUTH_SECRET,
  trustedOrigins: [config.APP_URL],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  telemetry: { enabled: false },

  emailAndPassword: {
    enabled: true,
    // Accounts are only created through admin invitations or the initial-admin setup script.
    disableSignUp: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const capture = resetLinkCapture.getStore();
      if (capture) {
        capture.url = url;
        return;
      }
      await sendEmail(
        user.email,
        "Reset your Grad2Tech portal password",
        `Hello ${user.name},\n\nUse this link within 1 hour to set a new password:\n${url}\n\nIf you did not ask for this, you can ignore this email.`,
      );
    },
  },

  user: {
    additionalFields: {
      // Role and suspension are server-controlled. input:false means clients can never set them.
      role: { type: "string", required: false, input: false, defaultValue: "STUDENT" },
      suspendedAt: { type: "date", required: false, input: false },
    },
  },

  session: {
    expiresIn: config.SESSION_EXPIRES_IN,
    updateAge: config.SESSION_UPDATE_AGE,
  },

  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
      "/reset-password": { window: 300, max: 5 },
      "/change-password": { window: 300, max: 5 },
    },
  },

  // Profile and account changes go through audited portal actions instead.
  disabledPaths: ["/sign-up/email", "/update-user", "/delete-user", "/delete-user/callback", "/change-email"],

  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { suspendedAt: true },
          });
          if (!user || user.suspendedAt) {
            throw new APIError("FORBIDDEN", {
              message: "Your portal access is suspended. Please contact your trainer.",
            });
          }
        },
      },
    },
  },

  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
