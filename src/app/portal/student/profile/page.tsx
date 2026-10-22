import { ActionForm, SubmitButton, TextArea, TextField } from "@/components/forms";
import { Card, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dDate } from "@/lib/display";
import { pageStudent } from "@/server/session";
import { saveOwnProfileAction } from "./actions";
import { ChangePasswordForm } from "./change-password";

export const metadata = { title: "Profile" };

export default async function StudentProfile() {
  const me = await pageStudent("/portal/student/profile");
  const [profile, enrolments] = await Promise.all([
    prisma.studentProfile.findUnique({ where: { userId: me.id } }),
    prisma.enrolment.findMany({ where: { studentId: me.id }, include: { batch: { select: { name: true, code: true } } }, orderBy: { startDate: "desc" } }),
  ]);
  return (
    <>
      <PageHead title="Profile" description="Your details and sign-in settings." />
      <div className="grid grid--2">
        <div className="stack">
          <Card title="Your details">
            <dl className="dl" style={{ marginBottom: 16 }}>
              <dt>Name</dt>
              <dd>{me.name}</dd>
              <dt>Email</dt>
              <dd>{me.email}</dd>
              <dt>Batches</dt>
              <dd>{enrolments.length ? enrolments.map((e) => `${e.batch.name} (${e.status === "ACTIVE" ? `since ${dDate(e.startDate)}` : "ended"})`).join(", ") : "—"}</dd>
            </dl>
            <p className="small muted" style={{ marginBottom: 12 }}>
              To change your name or email, ask your trainer.
            </p>
            <ActionForm action={saveOwnProfileAction}>
              <TextField name="phone" label="Phone" defaultValue={profile?.phone} autoComplete="tel" />
              <TextField name="graduationYear" label="Graduation year" type="number" defaultValue={profile?.graduationYear} />
              <TextArea name="background" label="Background" rows={3} defaultValue={profile?.background} />
              <SubmitButton>Save details</SubmitButton>
            </ActionForm>
          </Card>
        </div>
        <Card title="Change password" description="You'll stay signed in here; other devices are signed out.">
          <ChangePasswordForm />
        </Card>
      </div>
    </>
  );
}
