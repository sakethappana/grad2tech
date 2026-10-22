"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export function ChangePasswordForm() {
  const [state, setState] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const current = String(fd.get("current") ?? "");
    const next = String(fd.get("next") ?? "");
    if (next.length < 10) return setState({ tone: "bad", text: "Use at least 10 characters for the new password." });
    if (next !== String(fd.get("confirm") ?? "")) return setState({ tone: "bad", text: "The new passwords don't match." });
    setPending(true);
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    setPending(false);
    if (error) {
      setState({ tone: "bad", text: error.code === "INVALID_PASSWORD" ? "Your current password is not correct." : authErrorMessage(error) });
      return;
    }
    form.reset();
    setState({ tone: "ok", text: "Password changed. Other devices have been signed out." });
  }

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      {state && (
        <div className={`alert alert--${state.tone}`} role={state.tone === "bad" ? "alert" : "status"}>
          <Icon name={state.tone === "ok" ? "check" : "alert"} />
          <div>{state.text}</div>
        </div>
      )}
      <div className="field">
        <label htmlFor="cp-current">Current password</label>
        <input id="cp-current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div className="field">
        <label htmlFor="cp-next">New password</label>
        <input id="cp-next" name="next" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <div className="field">
        <label htmlFor="cp-confirm">Confirm new password</label>
        <input id="cp-confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <button className="btn btn--primary" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
