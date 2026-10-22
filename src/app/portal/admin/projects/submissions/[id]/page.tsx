import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton, TextArea, TextField } from "@/components/forms";
import { Icon } from "@/components/icons";
import { Badge, Card, Markdown, PageHead } from "@/components/ui";
import { SnapshotViewer } from "@/components/snapshot-viewer";
import { prisma } from "@/lib/db";
import { dt } from "@/lib/display";
import { pageAdmin } from "@/server/session";
import { reviewProjectAction } from "../../actions";

export default async function ProjectSubmissionReview(props: PageProps<"/portal/admin/projects/submissions/[id]">) {
  const { id } = await props.params;
  await pageAdmin(`/portal/admin/projects/submissions/${id}`);
  const s = await prisma.projectSubmission.findUnique({
    where: { id },
    include: { student: { select: { id: true, name: true } }, project: true, brief: true, reviewedBy: { select: { name: true } } },
  });
  if (!s) notFound();
  const files = s.snapshot as Record<string, string>;
  const max = s.brief?.maxMarks ?? 100;
  return (
    <>
      <PageHead
        eyebrow={s.brief ? `Project: ${s.brief.title}` : "Independent project"}
        title={`${s.project.name} — ${s.student.name}`}
        description={
          <>
            Submitted {dt(s.submittedAt)} · {s.fileCount} files · {Math.ceil(s.totalBytes / 1024)} KB{" "}
            <Badge tone={s.status === "REVIEWED" ? "ok" : s.status === "SUBMITTED" ? "info" : "warn"}>{s.status === "REVIEWED" ? "Reviewed" : s.status === "SUBMITTED" ? "Awaiting review" : "Changes requested"}</Badge>
          </>
        }
        actions={
          <>
            <a className="btn btn--secondary" href={`/api/projects/submissions/${s.id}/export`}>
              <Icon name="download" /> Download .zip
            </a>
            <Link className="btn btn--secondary" href={`/portal/admin/students/${s.student.id}`}>
              Student
            </Link>
          </>
        }
      />
      <div className="grid grid--main-side">
        <div className="stack">
          {s.note && (
            <Card title="Note from the student">
              <Markdown>{s.note}</Markdown>
            </Card>
          )}
          <SnapshotViewer files={files} staticPreview={s.project.template === "static-web"} />
          {s.project.template !== "static-web" && (
            <p className="small muted">This is a Node.js project. Download the .zip and run it locally with npm install, or open the starter in the workspace to compare.</p>
          )}
        </div>
        <Card title="Review">
          {s.reviewedAt && (
            <p className="small muted" style={{ marginBottom: 12 }}>
              Last reviewed by {s.reviewedBy?.name} on {dt(s.reviewedAt)}
            </p>
          )}
          <ActionForm action={reviewProjectAction}>
            <input type="hidden" name="id" value={s.id} />
            <TextField name="marks" label={`Marks (out of ${max})`} type="number" min={0} max={max} defaultValue={s.marks ?? ""} />
            <TextArea name="feedback" label="Feedback" rows={8} defaultValue={s.feedback} hint="Markdown supported. The student is notified." />
            <div className="form__actions">
              <SubmitButton name="decision" value="REVIEWED">Save review</SubmitButton>
              <SubmitButton name="decision" value="RESUBMIT_REQUESTED" variant="secondary">Request changes</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
