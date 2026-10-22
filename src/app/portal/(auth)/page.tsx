import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { getCurrentUser, homeFor } from "@/server/session";

export const metadata = { title: "Learning Portal" };

export default async function PortalEntry() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  return (
    <>
      <h2>Welcome to the Learning Portal</h2>
      <p>Choose how you want to sign in.</p>
      <div className="auth__choices">
        <Link className="choice" href="/portal/login?as=student">
          <span className="choice__icon">
            <Icon name="book" />
          </span>
          <span>
            <strong>Student Login</strong>
            <span>Assignments, tests, coding and your progress</span>
          </span>
          <Icon name="arrowRight" className="icon--arrow" />
        </Link>
        <Link className="choice" href="/portal/login?as=admin">
          <span className="choice__icon">
            <Icon name="shield" />
          </span>
          <span>
            <strong>Admin / Trainer Login</strong>
            <span>Batches, teaching, reviews and reports</span>
          </span>
          <Icon name="arrowRight" className="icon--arrow" />
        </Link>
      </div>
      <p className="auth__note">
        Both options use the same secure sign-in. You are taken to the portal that matches your account.
        New students receive access from Grad2Tech after admission.
      </p>
    </>
  );
}
