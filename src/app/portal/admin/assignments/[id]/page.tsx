import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmAction, SubmitButton, TextField } from "@/components/forms";
import { Icon } from "@/components/icons";
import { Alert, Badge, Card, Empty, Markdown, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt, toLocalInput } from "@/lib/display";
import { resolveTargetStudents } from "@/server/access";
import { pageAdmin } from "@/server/session";
import { targetSummary } from "../../targets";
import { cancelAssignmentAction, publishAssignmentAction } from "../actions";

export default async function AssignmentDetail(props: PageProps<"/portal/admin/assignments/[id]">) {
  const { id } = await props.params;
  await pageAdmin(`/portal/admin/assignments/${id}`);
  const a = await prisma.assignment.findUnique({
    where: { id },
    include: {
      targets: { include: { batch: { select: { code: true } }, student: { select: { name: true } } } },
      files: { orderBy: { createdAt: "asc" } },
      submissions: { include: { student: { select: { id: true, name: true, email: true } } } },
      createdBy: { select: { name: true } },
    },
  });
  if (!a) notFound();
  const now = new Date();
  const targeted = await resolveTargetStudents(a.targets);
  const students = await prisma.user.findMany({
    where: { id: { in: [...new Set([...targeted, ...a.submissions.map((s) => s.studentId)])] } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  const subBy = new Map(a.submissions.map((s) => [s.studentId, s]));
  const submittedCount = a.submissions.filter((s) => s.status !== "DRAFT").length;
  const scheduled = a.status === "PUBLISHED" && a.publishAt && a.publishAt > now;

  return (
    <>
      <PageHead
        eyebrow={`Assignment · ${a.topic} · ${a.difficulty.toLowerCase()}`}
        title={a.title}
        description={
          <>
            Due {dt(a.dueAt)} · {a.maxMarks} marks · {a.allowLate ? "late submissions accepted" : "no late submissions"} · assigned to {targetSummary(a.targets)}
          </>
        }
        actions={
          a.status !== "CANCELLED" && (
            <>
              <Link className="btn btn--secondary" href={`/portal/admin/assignments/${a.id}/edit`}>
                <Icon name="edit" /> Edit
              </Link>
              <ConfirmAction action={cancelAssignmentAction} fields={{ id: a.id }} label="Cancel assignment" confirmLabel="Cancel it" variant="danger" description="Hidden from students; excluded from metrics." />
            </>
          )
        }
      />
      <div className="grid grid--main-side">
        <div className="stack">
          <Card title={`Submissions (${submittedCount} of ${students.length})`} flush>
            {students.length === 0 ? (
              <Empty icon="users" title="No students targeted">Edit the assignment to choose batches or students.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Student</th>
                      <th scope="col">Status</th>
                      <th scope="col">Submitted</th>
                      <th scope="col" className="num">Marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((st) => {
                      const s = subBy.get(st.id);
                      const submitted = s && s.status !== "DRAFT";
                      return (
                        <tr key={st.id}>
                          <td>
                            {submitted ? <Link href={`/portal/admin/assignments/${a.id}/submissions/${s.id}`}>{st.name}</Link> : <Link href={`/portal/admin/students/${st.id}`}>{st.name}</Link>}
                            <div className="small muted">{st.email}</div>
                          </td>
                          <td>
                            {!submitted ? (
                              now > a.dueAt ? <Badge tone="bad">Missing</Badge> : <Badge>{s ? "Draft in progress" : "Not started"}</Badge>
                            ) : s.status === "REVIEWED" ? (
                              <Badge tone="ok">Reviewed</Badge>
                            ) : s.status === "RESUBMIT_REQUESTED" ? (
                              <Badge tone="warn">Resubmission requested</Badge>
                            ) : (
                              <Badge tone="info">To review</Badge>
                            )}
                            {submitted && s.isLate && <> <Badge tone="warn">Late</Badge></>}
                          </td>
                          <td className="nowrap">{submitted ? dt(s.submittedAt) : "—"}</td>
                          <td className="num">{s?.status === "REVIEWED" ? `${s.marks} / ${a.maxMarks}` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card title="Instructions">
            <Markdown>{a.instructions}</Markdown>
            {a.files.length > 0 && (
              <ul className="list" style={{ marginTop: 16, border: "1px solid var(--line)", borderRadius: 10 }}>
                {a.files.map((f) => (
                  <li key={f.id}>
                    <Icon name="file" />
                    <div className="list__main">
                      <a href={`/api/files/${f.id}`}>{f.filename}</a>
                      <span className="list__meta">{Math.ceil(f.sizeBytes / 1024)} KB</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="stack">
          <Card title="Publication">
            {a.status === "CANCELLED" ? (
              <Alert tone="bad">Cancelled. Students no longer see this assignment.</Alert>
            ) : a.status === "PUBLISHED" ? (
              <Alert tone={scheduled ? "info" : "ok"}>{scheduled ? `Scheduled to publish ${dt(a.publishAt)}.` : `Published ${dt(a.publishAt)}.`}</Alert>
            ) : (
              <div className="stack">
                <p className="small muted">Draft — not visible to students.</p>
                <ActionForm action={publishAssignmentAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="mode" value="now" />
                  <SubmitButton>Publish now</SubmitButton>
                </ActionForm>
                <ActionForm action={publishAssignmentAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="mode" value="schedule" />
                  <TextField name="publishAt" label="Or schedule for" type="datetime-local" defaultValue={toLocalInput(new Date(Date.now() + 3600_000))} />
                  <SubmitButton variant="secondary">Schedule</SubmitButton>
                </ActionForm>
              </div>
            )}
          </Card>
          <Card title="Details">
            <dl className="dl">
              <dt>Formats</dt>
              <dd>{a.responseTypes.map((t) => ({ TEXT: "Written", CODE: "Code", LINK: "Link", FILE: "Files" })[t] ?? t).join(", ")}</dd>
              <dt>Created by</dt>
              <dd>{a.createdBy.name}</dd>
              <dt>Created</dt>
              <dd>{dt(a.createdAt)}</dd>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
