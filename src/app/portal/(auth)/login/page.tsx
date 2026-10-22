import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui";
import { getCurrentUser, homeFor } from "@/server/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/portal/login">) {
  const sp = await props.searchParams;
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  const as = sp.as === "admin" ? "admin" : sp.as === "student" ? "student" : null;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return (
    <>
      <Link href="/portal" className="small" style={{ fontWeight: 700 }}>
        ← All sign-in options
      </Link>
      <h2 style={{ marginTop: 16 }}>{as === "admin" ? "Admin / Trainer sign in" : as === "student" ? "Student sign in" : "Sign in"}</h2>
      <p>Use the email and password for your Grad2Tech portal account.</p>
      <div className="stack stack--sm" style={{ marginTop: 20 }}>
        {one(sp.expired) && <Alert tone="warn">Your session has ended. Please sign in again to continue.</Alert>}
        {one(sp.signedout) && <Alert tone="ok">You have signed out.</Alert>}
        {one(sp.welcome) && <Alert tone="ok">Your account is ready. Sign in with your new password.</Alert>}
        {one(sp.reset) && <Alert tone="ok">Your password has been changed. Sign in with the new password.</Alert>}
      </div>
      <LoginForm next={one(sp.next) ?? null} />
    </>
  );
}
