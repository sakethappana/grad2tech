import Link from "next/link";
import { Alert } from "@/components/ui";
import { findPendingInvitation } from "@/server/people";
import { AcceptInviteForm } from "./accept-form";

export const metadata = { title: "Set up your account" };

export default async function InvitePage(props: PageProps<"/portal/invite/[token]">) {
  const { token } = await props.params;
  const inv = await findPendingInvitation(token);
  if (!inv) {
    return (
      <>
        <h2>This invitation can&apos;t be used</h2>
        <div className="stack stack--sm" style={{ marginTop: 16 }}>
          <Alert tone="bad">The link is invalid, has expired, or has already been used. Ask your trainer to send a new invitation.</Alert>
          <Link className="btn btn--secondary" href="/portal/login">
            Go to sign in
          </Link>
        </div>
      </>
    );
  }
  return (
    <>
      <h2>Welcome, {inv.name}</h2>
      <p>
        Set a password to activate your {inv.role === "ADMIN" ? "trainer" : "student"} account for <strong>{inv.email}</strong>
        {inv.batch ? (
          <>
            {" "}
            in <strong>{inv.batch.name}</strong>
          </>
        ) : null}
        .
      </p>
      <div style={{ marginTop: 20 }}>
        <AcceptInviteForm token={token} />
      </div>
    </>
  );
}
