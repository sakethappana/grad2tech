import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Checkbox, ConfirmAction, Select, SubmitButton, TextArea, TextField } from "@/components/forms";
import { PerformanceReport } from "@/components/performance";
import { Alert, Badge, Card, Empty, Markdown, PageHead, Tabs } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dDate, dt, toLocalInput } from "@/lib/display";
import { DOUBT_STATUS_LABEL } from "@/server/doubts";
import { studentReport } from "@/server/reports";
import { pageAdmin } from "@/server/session";
import {
  endEnrolmentAction,
  enrolAction,
  interviewAction,
  moveAction,
  noteAction,
  placementReviewAction,
  suspendAction,
  updateProfileAction,
} from "../../people-actions";
import { ResetLinkButton } from "./reset-link";

const TABS = ["overview", "performance", "coursework", "notes", "placement"] as const;

export default async function StudentDetail(props: PageProps<"/portal/admin/students/[id]">) {
  const { id } = await props.params;
  await pageAdmin(`/portal/admin/students/${id}`);
  const sp = await props.searchParams;
  const tab = (TABS as readonly string[]).includes(String(sp.tab)) ? (String(sp.tab) as (typeof TABS)[number]) : "overview";

  const student = await prisma.user.findFirst({
    where: { id, role: "STUDENT" },
    include: {
      profile: true,
      enrolments: { include: { batch: { select: { id: true, name: true, code: true, archivedAt: true } } }, orderBy: { startDate: "desc" } },
      sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
    },
  });
  if (!student) notFound();
  const batches = await prisma.batch.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } });
  const active = student.enrolments.filter((e) => e.status === "ACTIVE");
  const tabs = TABS.map((k) => ({ key: k, href: `/portal/admin/students/${id}?tab=${k}`, label: { overview: "Profile & enrolment", performance: "Performance", coursework: "Coursework & doubts", notes: "Notes & feedback", placement: "Placement records" }[k] }));

  return (
    <>
      <PageHead
        eyebrow="Student"
        title={student.name}
        description={
          <>
            {student.email} · {student.sessions[0] ? `last active ${dt(student.sessions[0].updatedAt)}` : "has not signed in yet"}{" "}
            {student.suspendedAt ? <Badge tone="bad">Suspended</Badge> : <Badge tone="ok">Active</Badge>}
          </>
        }
        actions={<Link className="btn btn--secondary" href={`/portal/admin/students/${id}?tab=performance`}>View performance</Link>}
      />
      <Tabs items={tabs} current={tab} />

      {tab === "overview" && (
        <div className="grid grid--main-side">
          <div className="stack">
            <Card title="Enrolments" description="Moving or ending an enrolment keeps the student's history with each batch." flush>
              {student.enrolments.length === 0 ? (
                <Empty icon="layers" title="Not enrolled in any batch" />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Batch</th>
                        <th scope="col">From</th>
                        <th scope="col">To</th>
                        <th scope="col">Status</th>
                        <th scope="col"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {student.enrolments.map((e) => (
                        <tr key={e.id}>
                          <td>
                            <Link href={`/portal/admin/batches/${e.batch.id}`}>{e.batch.name}</Link> <span className="small muted">{e.batch.code}</span>
                          </td>
                          <td className="nowrap">{dDate(e.startDate)}</td>
                          <td className="nowrap">{e.endDate ? dDate(e.endDate) : "—"}</td>
                          <td>{e.status === "ACTIVE" ? <Badge tone="ok">Active</Badge> : <Badge>{e.endReason ?? "Ended"}</Badge>}</td>
                          <td>
                            {e.status === "ACTIVE" && (
                              <ConfirmAction action={endEnrolmentAction} fields={{ enrolmentId: e.id, studentId: id, reason: "Ended by admin" }} label="End" confirmLabel="End enrolment" variant="danger" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <div className="grid grid--2">
              {active.length > 0 && (
                <Card title="Move to another batch">
                  <ActionForm action={moveAction}>
                    <input type="hidden" name="studentId" value={id} />
                    <Select name="fromBatchId" label="From" options={active.map((e) => ({ value: e.batch.id, label: e.batch.code }))} defaultValue={active[0].batch.id} />
                    <Select name="toBatchId" label="To" options={batches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }))} placeholder="Choose a batch" />
                    <TextField name="effective" label="Effective date" type="date" hint="Defaults to today." />
                    <SubmitButton>Move student</SubmitButton>
                  </ActionForm>
                </Card>
              )}
              <Card title="Add to a batch">
                <ActionForm action={enrolAction}>
                  <input type="hidden" name="studentId" value={id} />
                  <Select name="batchId" label="Batch" options={batches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }))} placeholder="Choose a batch" />
                  <TextField name="startDate" label="Enrolment date" type="date" hint="Defaults to today." />
                  <SubmitButton>Enrol</SubmitButton>
                </ActionForm>
              </Card>
            </div>
          </div>
          <div className="stack">
            <Card title="Profile">
              <ActionForm action={updateProfileAction}>
                <input type="hidden" name="studentId" value={id} />
                <TextField name="name" label="Full name" defaultValue={student.name} />
                <TextField name="phone" label="Phone" defaultValue={student.profile?.phone} />
                <TextField name="graduationYear" label="Graduation year" type="number" defaultValue={student.profile?.graduationYear} />
                <TextArea name="background" label="Background" rows={3} defaultValue={student.profile?.background} />
                <SubmitButton>Save profile</SubmitButton>
              </ActionForm>
            </Card>
            <Card title="Portal access">
              <div className="stack stack--sm">
                {student.suspendedAt ? (
                  <Alert tone="warn">
                    Suspended {dt(student.suspendedAt)}
                    {student.suspendedReason ? ` — ${student.suspendedReason}` : ""}. The student cannot sign in; all records are kept.
                  </Alert>
                ) : (
                  <p className="small muted">Suspending signs the student out everywhere and blocks sign-in. Their academic history is not deleted.</p>
                )}
                {student.suspendedAt ? (
                  <ConfirmAction action={suspendAction} fields={{ userId: id, suspend: "0" }} label="Restore access" confirmLabel="Restore access" variant="primary" />
                ) : (
                  <ActionForm action={suspendAction} className="form">
                    <input type="hidden" name="userId" value={id} />
                    <input type="hidden" name="suspend" value="1" />
                    <TextField name="reason" label="Reason (visible to admins)" />
                    <SubmitButton variant="danger">Suspend access</SubmitButton>
                  </ActionForm>
                )}
                {!student.suspendedAt && <ResetLinkButton userId={id} />}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "performance" && <PerformanceReport report={await studentReport(id, "admin")} viewer="admin" />}
      {tab === "coursework" && <Coursework studentId={id} />}
      {tab === "notes" && <Notes studentId={id} />}
      {tab === "placement" && <Placement studentId={id} />}
    </>
  );
}

async function Coursework({ studentId }: { studentId: string }) {
  const [submissions, doubts, projects] = await Promise.all([
    prisma.submission.findMany({ where: { studentId, status: { not: "DRAFT" } }, orderBy: { submittedAt: "desc" }, include: { assignment: { select: { id: true, title: true, maxMarks: true } } } }),
    prisma.doubtThread.findMany({ where: { studentId }, orderBy: { lastActivityAt: "desc" }, take: 30 }),
    prisma.projectSubmission.findMany({ where: { studentId }, orderBy: { submittedAt: "desc" }, include: { project: { select: { name: true } } } }),
  ]);
  return (
    <div className="grid grid--2">
      <Card title="Assignment submissions" flush>
        {submissions.length === 0 ? (
          <Empty icon="clipboard" title="No submissions" />
        ) : (
          <ul className="list">
            {submissions.map((s) => (
              <li key={s.id}>
                <div className="list__main">
                  <Link href={`/portal/admin/assignments/${s.assignment.id}/submissions/${s.id}`}>{s.assignment.title}</Link>
                  <span className="list__meta">
                    {dt(s.submittedAt)} {s.isLate ? "· late" : ""} · revision {s.revision}
                  </span>
                </div>
                <Badge tone={s.status === "REVIEWED" ? "ok" : s.status === "SUBMITTED" ? "info" : "warn"}>
                  {s.status === "REVIEWED" ? `${s.marks ?? "—"} / ${s.assignment.maxMarks}` : s.status === "SUBMITTED" ? "To review" : "Resubmit requested"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="stack">
        <Card title="Doubt history" flush>
          {doubts.length === 0 ? (
            <Empty icon="question" title="No doubts raised" />
          ) : (
            <ul className="list">
              {doubts.map((d) => (
                <li key={d.id}>
                  <div className="list__main">
                    <Link href={`/portal/admin/doubts/${d.id}`}>{d.title}</Link>
                    <span className="list__meta">
                      {d.topic} · {dt(d.createdAt)}
                    </span>
                  </div>
                  <Badge tone={d.status === "RESOLVED" ? "ok" : d.status === "IN_PROGRESS" ? "info" : "warn"}>{DOUBT_STATUS_LABEL[d.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Project submissions" flush>
          {projects.length === 0 ? (
            <Empty icon="folder" title="No project submissions" />
          ) : (
            <ul className="list">
              {projects.map((p) => (
                <li key={p.id}>
                  <div className="list__main">
                    <Link href={`/portal/admin/projects/submissions/${p.id}`}>{p.project.name}</Link>
                    <span className="list__meta">
                      {dt(p.submittedAt)} · {p.fileCount} files
                    </span>
                  </div>
                  <Badge tone={p.status === "REVIEWED" ? "ok" : p.status === "SUBMITTED" ? "info" : "warn"}>{p.status === "REVIEWED" ? "Reviewed" : p.status === "SUBMITTED" ? "To review" : "Changes requested"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

async function Notes({ studentId }: { studentId: string }) {
  const [notes, feedback] = await Promise.all([
    prisma.followUpNote.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } }),
    prisma.trainerFeedback.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } }),
  ]);
  return (
    <div className="grid grid--2">
      <Card title="Follow-up notes" description="Visible to admins and trainers only. Never shown to the student.">
        <div className="stack">
          <ActionForm action={noteAction} resetOnSuccess>
            <input type="hidden" name="studentId" value={studentId} />
            <input type="hidden" name="kind" value="note" />
            <TextArea name="body" label="New note" rows={3} />
            <SubmitButton>Save note</SubmitButton>
          </ActionForm>
          {notes.length === 0 ? (
            <Empty icon="lock" title="No private notes yet" />
          ) : (
            notes.map((n) => (
              <div key={n.id} className="msg__bubble">
                <div className="msg__head">
                  <strong>{n.author.name}</strong>
                  <span className="muted">{dt(n.createdAt)}</span>
                </div>
                <Markdown>{n.body}</Markdown>
              </div>
            ))
          )}
        </div>
      </Card>
      <Card title="Trainer feedback" description="Shared with the student, who is notified.">
        <div className="stack">
          <ActionForm action={noteAction} resetOnSuccess>
            <input type="hidden" name="studentId" value={studentId} />
            <input type="hidden" name="kind" value="feedback" />
            <TextArea name="body" label="Feedback for the student" rows={3} hint="Markdown supported." />
            <SubmitButton>Share feedback</SubmitButton>
          </ActionForm>
          {feedback.length === 0 ? (
            <Empty icon="info" title="No feedback shared yet" />
          ) : (
            feedback.map((f) => (
              <div key={f.id} className="msg__bubble">
                <div className="msg__head">
                  <strong>{f.author.name}</strong>
                  <span className="muted">{dt(f.createdAt)}</span>
                </div>
                <Markdown>{f.body}</Markdown>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

async function Placement({ studentId }: { studentId: string }) {
  const [review, interviews, report] = await Promise.all([
    prisma.placementReview.findUnique({ where: { studentId }, include: { reviewedBy: { select: { name: true } } } }),
    prisma.placementInterview.findMany({ where: { studentId }, orderBy: { scheduledAt: "desc" } }),
    studentReport(studentId, "admin"),
  ]);
  const a = report.assignments.summary;
  const att = report.attendance;
  const attended = interviews.filter((i) => i.attended === true).length;
  const missed = interviews.filter((i) => i.attended === false).length;
  return (
    <div className="stack">
      <Alert tone="info">
        These are factual participation records for the proposed placement commitment. Eligibility and any refund are decided by an authorised person after review — the
        portal does not apply thresholds or make these decisions automatically.
      </Alert>
      <div className="grid grid--main-side">
        <div className="stack">
          <Card title="Participation record" flush>
            <table className="table">
              <tbody>
                <tr><td>Assignments due / on time / late / missing</td><td className="num">{a.due} / {a.onTime} / {a.late} / {a.missing}</td></tr>
                <tr><td>Graded tests / failed / awaiting grading</td><td className="num">{report.tests.summary.gradedCount} / {report.tests.summary.failed} / {report.tests.summary.awaiting}</td></tr>
                <tr><td>Attendance (present + late of recorded)</td><td className="num">{att.counts.PRESENT + att.counts.LATE} of {att.denominator}</td></tr>
                <tr><td>Placement interviews recorded / attended / missed</td><td className="num">{interviews.length} / {attended} / {missed}</td></tr>
              </tbody>
            </table>
          </Card>
          <Card title="Placement interviews" flush>
            {interviews.length === 0 ? (
              <Empty icon="briefcase" title="No interviews recorded" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Company</th>
                      <th scope="col">Date</th>
                      <th scope="col">Attended</th>
                      <th scope="col">Outcome</th>
                      <th scope="col">Company feedback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interviews.map((i) => (
                      <tr key={i.id}>
                        <td>{i.company}</td>
                        <td className="nowrap">{dt(i.scheduledAt)}</td>
                        <td>{i.attended === null ? "—" : i.attended ? "Yes" : "No"}</td>
                        <td>{i.outcome.replace("_", " ").toLowerCase()}</td>
                        <td className="small">{i.companyFeedback ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card title="Record an interview">
            <ActionForm action={interviewAction} resetOnSuccess>
              <input type="hidden" name="studentId" value={studentId} />
              <div className="form__row">
                <TextField name="company" label="Company" />
                <TextField name="scheduledAt" label="Interview date and time" type="datetime-local" defaultValue={toLocalInput(new Date())} />
              </div>
              <div className="form__row">
                <Select name="attended" label="Attended" options={[{ value: "UNKNOWN", label: "Not yet known" }, { value: "YES", label: "Yes" }, { value: "NO", label: "No" }]} defaultValue="UNKNOWN" />
                <Select name="outcome" label="Outcome" options={[{ value: "PENDING", label: "Pending" }, { value: "SELECTED", label: "Selected" }, { value: "NOT_SELECTED", label: "Not selected" }, { value: "WITHDRAWN", label: "Withdrawn" }]} defaultValue="PENDING" />
              </div>
              <TextArea name="companyFeedback" label="Feedback from the company" rows={3} />
              <SubmitButton>Save interview</SubmitButton>
            </ActionForm>
          </Card>
        </div>
        <Card title="Authorised review">
          <ActionForm action={placementReviewAction}>
            <input type="hidden" name="studentId" value={studentId} />
            {review?.reviewedAt && (
              <p className="small muted">
                Last reviewed by {review.reviewedBy?.name ?? "—"} on {dt(review.reviewedAt)}
              </p>
            )}
            <Select
              name="status"
              label="Placement commitment eligibility"
              options={[
                { value: "NOT_REVIEWED", label: "Not reviewed yet" },
                { value: "ELIGIBLE", label: "Eligible" },
                { value: "NOT_ELIGIBLE", label: "Not eligible" },
                { value: "ON_HOLD", label: "On hold" },
              ]}
              defaultValue={review?.status ?? "NOT_REVIEWED"}
            />
            <Select
              name="refundStatus"
              label="Proposed refund review"
              options={[
                { value: "NOT_APPLICABLE", label: "Not applicable" },
                { value: "UNDER_REVIEW", label: "Under review (company feedback being gathered)" },
                { value: "MUTUALLY_AGREED", label: "Reasons mutually agreed as genuine" },
                { value: "NOT_AGREED", label: "Not agreed" },
              ]}
              defaultValue={review?.refundStatus ?? "NOT_APPLICABLE"}
              hint="Records the outcome of the mutual review in the proposed policy. It does not trigger any payment."
            />
            <TextArea name="notes" label="Review notes" rows={5} defaultValue={review?.notes} />
            <Checkbox name="confirm" label="This decision was reviewed by an authorised person." />
            <SubmitButton>Save review</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
