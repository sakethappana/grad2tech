"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [state, setState] = useState<"idle" | "pending" | "sent" | "limited">("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!email) return;
    setState("pending");
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/portal/reset-password" });
    // Same message whether or not the account exists, so emails can't be discovered.
    setState(error?.status === 429 ? "limited" : "sent");
  }

  return (
    <>
      <Link href="/portal/login" className="small" style={{ fontWeight: 700 }}>
        ← Back to sign in
      </Link>
      <h2 style={{ marginTop: 16 }}>Reset your password</h2>
      <p>Enter your portal email. If an account exists and email is set up, we will send a reset link that works for one hour.</p>
      {state === "sent" ? (
        <div className="stack stack--sm" style={{ marginTop: 20 }}>
          <div className="alert alert--ok" role="status">
            <Icon name="check" />
            <div>If that email belongs to a portal account, a reset link is on its way.</div>
          </div>
          <div className="alert alert--info">
            <Icon name="info" />
            <div>Didn&apos;t receive anything? Your trainer can create a reset link for you from the admin portal.</div>
          </div>
        </div>
      ) : (
        <form className="form" style={{ marginTop: 20 }} onSubmit={onSubmit}>
          {state === "limited" && (
            <div className="alert alert--warn" role="alert">
              <Icon name="alert" />
              <div>Too many requests. Please wait a few minutes and try again.</div>
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <button className="btn btn--primary btn--lg btn--block" disabled={state === "pending"}>
            {state === "pending" ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </>
  );
}
