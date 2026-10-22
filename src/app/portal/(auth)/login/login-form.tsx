"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { authClient, authErrorMessage, safeNext } from "@/lib/auth-client";

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setPending(true);
    setError(null);
    const { error: err } = await authClient.signIn.email({ email, password });
    if (err) {
      setPending(false);
      setError(authErrorMessage(err));
      return;
    }
    // The server decides the destination from the stored role.
    router.replace(safeNext(next));
    router.refresh();
  }

  return (
    <form className="form" style={{ marginTop: 20 }} onSubmit={onSubmit} noValidate>
      {error && (
        <div className="alert alert--bad" role="alert">
          <Icon name="alert" />
          <div>{error}</div>
        </div>
      )}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required aria-invalid={error ? true : undefined} />
      </div>
      <div className="field">
        <div className="row row--between">
          <label htmlFor="password">Password</label>
          <Link href="/portal/forgot-password" className="small">
            Forgot password?
          </Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={error ? true : undefined} />
      </div>
      <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
