import Link from "next/link";
import { ActionForm, ConfirmAction, FileField, SubmitButton, TextArea, TextField } from "@/components/forms";
import { Icon } from "@/components/icons";
import { Alert, Badge, Card, Markdown, PageHead, type Tone } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt, rel } from "@/lib/display";
import { getVisibleAssignment } from "@/server/access";
import { studentAssignmentStatus, STUDENT_STATUS_LABEL, type StudentAssignmentStatus } from "@/server/assignments";
import { isAppError } from "@/server/errors";
import { pageStudent } from "@/server/session";
import { ALLOWED_EXTENSIONS } from "@/server/storage";
import { notFound } from "next/navigation";
import { deleteFileAction, submissionAction } from "../actions";

const TONE: Record<StudentAssignmentStatus, Tone> = { NOT_STARTED: "muted", IN_PROGRESS: "info", SUBMITTED: "teal", OVERDUE: "bad", REVIEWED: "ok", RESUBMIT_REQUESTED: "warn" };

export default async function StudentAssignment(props: PageProps<"/portal/student/assignments/[id]">) {
  const { id } = await props.params;
  const me = await pageStudent(`/portal/student/assignments/${id}`);
  const a = await getVisibleAssignment(me.id, id).catch((e) => {
    if (isAppError(e) && e.status === 404) notFound();
    throw e;
  });
  const [resources, submission] = await Promise.all([
    prisma.fileObject.findMany({ where: { assignmentId: a.id, purpose: "ASSIGNMENT_RESOURCE" }, orderBy: { createdAt: "asc" } }),
    prisma.submission.findUnique({ where: { assignmentId_studentId: { assignmentId: a.id, studentId: me.id } }, include: { files: true, history: { orderBy: { revision: "desc" } } } }),
  ]);
  const now = new Date();
  const status = studentAssignmentStatus(a, submission, now);
  const types = new Set(a.responseTypes);
  const editable =
    a.status === "PUBLISHED" &&
    (submission?.status === "RESUBMIT_REQUESTED" || ((!submission || submission.status === "DRAFT") && (now <= a.dueAt || a.allowLate)));

  return (
    <>
      <PageHead
        eyebrow={`Assignment · ${a.topic}`}
        title={a.title}
        description={
          <>
            <Badge tone={TONE[status]}>{STUDENT_STATUS_LABEL[status]}</Badge> Due {dt(a.dueAt)} ({rel(a.dueAt)}) · {a.maxMarks} marks · {a.difficulty.toLowerCase()}
          </>
        }
        actions={
          <Link className="btn btn--secondary" href={`/portal/student/doubts/new?link=assignment:${a.id}`}>
            <Icon name="question" /> Ask a doubt about this
          </Link>
        }
      />
      <div className="grid grid--main-side">
        <div className="stack">
          {a.status === "CANCELLED" && <Alert tone="warn">This assignment was cancelled by your trainer. It no longer counts towards your progress.</Alert>}
          <Card title="Instructions">
            <Markdown>{a.instructions}</Markdown>
            {resources.length > 0 && (
              <div className="row" style={{ marginTop: 16 }}>
                {resources.map((f) => (
                  <a key={f.id} className="btn btn--secondary btn--sm" href={`/api/files/${f.id}`}>
                    <Icon name="download" /> {f.filename}
                  </a>
                ))}
              </div>
            )}
          </Card>

          {submission && (submission.status === "REVIEWED" || submission.status === "RESUBMIT_REQUESTED") && (
            <Card title={submission.status === "REVIEWED" ? `Reviewed · ${submission.marks} / ${a.maxMarks}` : "Your trainer asked for changes"}>
              {submission.feedback ? <Markdown>{submission.feedback}</Markdown> : <p className="muted">No written feedback.</p>}
              <p className="small muted" style={{ marginTop: 10 }}>
                {dt(submission.reviewedAt)}
              </p>
            </Card>
          )}

          <Card title={editable ? "Your work" : "Your submission"}>
            {editable ? (
              <ActionForm action={submissionAction}>
                <input type="hidden" name="assignmentId" value={a.id} />
                {now > a.dueAt && submission?.status !== "RESUBMIT_REQUESTED" && <Alert tone="warn">The due date has passed. If you submit now it will be marked late.</Alert>}
                {types.has("TEXT") && <TextArea name="textResponse" label="Written response" rows={8} defaultValue={submission?.textResponse} hint="Markdown supported." />}
                {types.has("CODE") && (
                  <>
                    <TextField name="codeLanguage" label="Language" defaultValue={submission?.codeLanguage} placeholder="e.g. JavaScript" />
                    <TextArea name="code" label="Code" rows={12} code defaultValue={submission?.code} />
                  </>
                )}
                {types.has("LINK") && <TextField name="linkUrl" label="Project link" type="url" defaultValue={submission?.linkUrl} placeholder="https://github.com/…" />}
                {types.has("FILE") && <FileField name="files" label="Attach files" hint={`Up to 5 files, 10 MB each. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.`} />}
                <div className="form__actions">
                  <SubmitButton name="intent" value="draft" variant="secondary" pendingText="Saving…">
                    Save draft
                  </SubmitButton>
                  <SubmitButton name="intent" value="submit" pendingText="Submitting…">
                    Submit
                  </SubmitButton>
                  {submission?.updatedAt && submission.status === "DRAFT" && <span className="small muted">Draft saved {rel(submission.updatedAt)}</span>}
                </div>
              </ActionForm>
            ) : submission && submission.status !== "DRAFT" ? (
              <div className="stack">
                <Alert tone="ok">
                  Submitted {dt(submission.submittedAt)}
                  {submission.isLate ? " (late)" : ""} · revision {submission.revision}.
                </Alert>
                {submission.textResponse && <Markdown>{submission.textResponse}</Markdown>}
                {submission.code && <pre className="codeblock">{submission.code}</pre>}
                {submission.linkUrl && (
                  <a href={submission.linkUrl} target="_blank" rel="noopener noreferrer">
                    {submission.linkUrl}
                  </a>
                )}
              </div>
            ) : (
              <Alert tone="bad">The deadline has passed and this assignment does not accept late submissions.</Alert>
            )}
            {submission && submission.files.length > 0 && (
              <ul className="list" style={{ marginTop: 16, border: "1px solid var(--line)", borderRadius: 10 }}>
                {submission.files.map((f) => (
                  <li key={f.id}>
                    <Icon name="file" />
                    <div className="list__main">
                      <a href={`/api/files/${f.id}`}>{f.filename}</a>
                      <span className="list__meta">{Math.ceil(f.sizeBytes / 1024)} KB</span>
                    </div>
                    {editable && <ConfirmAction action={deleteFileAction} fields={{ fileId: f.id, assignmentId: a.id }} label="Remove" confirmLabel="Remove" variant="danger" />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="stack">
          <Card title="Details">
            <dl className="dl">
              <dt>Due</dt>
              <dd>{dt(a.dueAt)}</dd>
              <dt>Late work</dt>
              <dd>{a.allowLate ? "Accepted (marked late)" : "Not accepted"}</dd>
              <dt>Formats</dt>
              <dd>{a.responseTypes.map((t) => ({ TEXT: "Written", CODE: "Code", LINK: "Link", FILE: "Files" })[t] ?? t).join(", ")}</dd>
            </dl>
          </Card>
          {submission && submission.history.length > 0 && (
            <Card title="Submission history" flush>
              <ul className="list">
                {submission.history.map((h) => (
                  <li key={h.id}>
                    <div className="list__main">
                      <span className="list__title">Revision {h.revision}</span>
                      <span className="list__meta">
                        {dt(h.submittedAt)} {h.isLate ? "· late" : ""}
                      </span>
                    </div>
                    <Badge tone="teal">Submitted</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
