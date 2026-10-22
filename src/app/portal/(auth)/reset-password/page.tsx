import Link from "next/link";
import { Alert } from "@/components/ui";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage(props: PageProps<"/portal/reset-password">) {
  const sp = await props.searchParams;
  const token = typeof sp.token === "string" ? sp.token : null;
  const invalid = sp.error === "INVALID_TOKEN" || !token;
  return (
    <>
      <h2>Choose a new password</h2>
      <p>Use at least 10 characters. Signing in elsewhere will end when you change it.</p>
      <div style={{ marginTop: 20 }}>
        {invalid ? (
          <div className="stack stack--sm">
            <Alert tone="bad">This reset link is invalid or has expired.</Alert>
            <Link className="btn btn--secondary" href="/portal/forgot-password">
              Request a new link
            </Link>
          </div>
        ) : (
          <ResetForm token={token} />
        )}
      </div>
    </>
  );
}
