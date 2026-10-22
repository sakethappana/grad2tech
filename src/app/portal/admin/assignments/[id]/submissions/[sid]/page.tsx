import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton, TextArea, TextField } from "@/components/forms";
import { Icon } from "@/components/icons";
import { Alert, Badge, Card, Markdown, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt } from "@/lib/display";
import { pageAdmin } from "@/server/session";
import { reviewAction } from "../../../actions";

export default async function SubmissionReview(props: PageProps<"/portal/admin/assignments/[id]/submissions/[sid]">) {
  const { id, sid } = await props.params;
  await pageAdmin(`/portal/admin/assignments/${id}/submissions/${sid}`);
  const s = await prisma.submission.findFirst({
    where: { id: sid, assignmentId: id },
    include: {
      assignment: true,
      student: { select: { id: true, name: true, email: true } },
      files: true,
      history: { orderBy: { revision: "desc" } },
      reviewedBy: { select: { name: true } },
    },
  });
  if (!s) notFound();
  const a = s.assignment;

  return (
    <>
      <PageHead
        eyebrow={a.title}
        title={`Submission by ${s.student.name}`}
        description={
          <>
            Submitted {dt(s.submittedAt)} {s.isLate && <Badge tone="warn">Late</Badge>} · revision {s.revision} · due {dt(a.dueAt)}
          </>
        }
        actions={
          <>
            <Link className="btn btn--secondary" href={`/portal/admin/assignments/${a.id}`}>
              <Icon name="arrowLeft" /> All submissions
            </Link>
            <Link className="btn btn--secondary" href={`/portal/admin/students/${s.student.id}`}>
              Student profile
            </Link>
          </>
        }
      />
      <div className="grid grid--main-side">
        <div className="stack">
          {s.status === "DRAFT" && <Alert tone="warn">This is an unsubmitted draft.</Alert>}
          {s.textResponse && (
            <Card title="Written response">
              <Markdown>{s.textResponse}</Markdown>
            </Card>
          )}
          {s.code && (
            <Card title={`Code${s.codeLanguage ? ` (${s.codeLanguage})` : ""}`}>
              <pre className="codeblock">{s.code}</pre>
            </Card>
          )}
          {s.linkUrl && (
            <Card title="Project link">
              <a href={s.linkUrl} target="_blank" rel="noopener noreferrer nofollow">
                {s.linkUrl} <Icon name="externalLink" />
              </a>
              <p className="small muted" style={{ marginTop: 6 }}>
                External link supplied by the student. Open with care.
              </p>
            </Card>
          )}
          {s.files.length > 0 && (
            <Card title="Attachments" flush>
              <ul className="list">
                {s.files.map((f) => (
                  <li key={f.id}>
                    <Icon name="file" />
                    <div className="list__main">
                      <a href={`/api/files/${f.id}`}>{f.filename}</a>
                      <span className="list__meta">{Math.ceil(f.sizeBytes / 1024)} KB</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {s.history.length > 1 && (
            <Card title="Earlier revisions" flush>
              <ul className="list">
                {s.history.slice(1).map((h) => (
                  <li key={h.id}>
                    <div className="list__main">
                      <span className="list__title">Revision {h.revision}</span>
                      <span className="list__meta">
                        {dt(h.submittedAt)} {h.isLate ? "· late" : ""}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <Card title="Review">
          {s.reviewedAt && (
            <p className="small muted" style={{ marginBottom: 12 }}>
              Last reviewed by {s.reviewedBy?.name} on {dt(s.reviewedAt)}
            </p>
          )}
          <ActionForm action={reviewAction}>
            <input type="hidden" name="submissionId" value={s.id} />
            <input type="hidden" name="assignmentId" value={a.id} />
            <TextField name="marks" label={`Marks (out of ${a.maxMarks})`} type="number" min={0} max={a.maxMarks} step="0.5" defaultValue={s.marks ?? ""} />
            <TextArea name="feedback" label="Feedback for the student" rows={6} defaultValue={s.feedback} hint="Markdown supported. The student is notified." />
            <div className="form__actions">
              <SubmitButton name="decision" value="review">Save review</SubmitButton>
              <SubmitButton name="decision" value="resubmit" variant="secondary">Request resubmission</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
