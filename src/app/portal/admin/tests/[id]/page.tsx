import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmAction, SubmitButton, TextField } from "@/components/forms";
import { Icon } from "@/components/icons";
import { Alert, Badge, Card, Empty, Markdown, PageHead, type Tone } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt, marks, toLocalInput } from "@/lib/display";
import { assessmentPhase, GRADING_LABEL, PHASE_LABEL } from "@/server/assessments/lifecycle";
import { pageAdmin } from "@/server/session";
import { targetOptions, targetSummary } from "../../targets";
import { cancelTestAction, deleteQuestionAction, publishTestAction, releaseResultsAction, revisionAction } from "../actions";
import { TestSettingsForm } from "../settings-form";

const TYPE_LABEL = { MCQ_SINGLE: "Single-answer MCQ", MCQ_MULTI: "Multiple-answer MCQ", SHORT_ANSWER: "Short written answer", CODING: "Coding" } as const;
const GRADE_TONE: Record<string, Tone> = { NOT_STARTED: "muted", AWAITING_GRADING: "warn", PARTIALLY_GRADED: "info", GRADED: "ok" };

export default async function TestDetail(props: PageProps<"/portal/admin/tests/[id]">) {
  const { id } = await props.params;
  await pageAdmin(`/portal/admin/tests/${id}`);
  const t = await prisma.assessment.findUnique({
    where: { id },
    include: {
      targets: { include: { batch: { select: { code: true } }, student: { select: { name: true } } } },
      versions: { orderBy: { number: "desc" }, include: { questions: { orderBy: { order: "asc" }, include: { _count: { select: { cases: true } } } }, _count: { select: { attempts: true } } } },
      attempts: { orderBy: { startedAt: "desc" }, include: { student: { select: { id: true, name: true } }, version: { select: { number: true } } } },
    },
  });
  if (!t) notFound();
  const now = new Date();
  const phase = assessmentPhase(t, now);
  const latest = t.versions[0];
  const editable = latest && !latest.lockedAt;
  const lockedCurrent = t.versions.find((v) => v.lockedAt);
  const shown = editable ? latest : lockedCurrent;
  const totalMarks = shown?.questions.reduce((s, q) => s + q.marks, 0) ?? 0;
  const options = await targetOptions();
  const pending = t.attempts.filter((a) => a.gradingStatus === "AWAITING_GRADING" || a.gradingStatus === "PARTIALLY_GRADED").length;

  return (
    <>
      <PageHead
        eyebrow={t.kind === "WEEKLY" ? "Weekly examination" : "Practice test"}
        title={t.title}
        description={
          <>
            <Badge tone={phase === "OPEN" ? "ok" : phase === "CANCELLED" ? "bad" : phase === "DRAFT" ? "muted" : "info"}>{PHASE_LABEL[phase]}</Badge> {dt(t.opensAt)} → {dt(t.closesAt)} · {t.durationMinutes} min per attempt · {t.maxAttempts}{" "}
            {t.maxAttempts === 1 ? "attempt" : "attempts"} · {targetSummary(t.targets)}
          </>
        }
        actions={phase !== "CANCELLED" && <ConfirmAction action={cancelTestAction} fields={{ id }} label="Cancel test" confirmLabel="Cancel test" variant="danger" description="Hidden from students; attempts kept." />}
      />
      <div className="grid grid--main-side">
        <div className="stack">
          <Card
            id="questions"
            title={`Questions${shown ? ` · version ${shown.number}` : ""} (${shown?.questions.length ?? 0}, ${totalMarks} marks)`}
            actions={
              editable && (
                <Link className="btn btn--primary btn--sm" href={`/portal/admin/tests/${id}/questions/new`}>
                  <Icon name="plus" /> Add question
                </Link>
              )
            }
            flush
          >
            {editable && t.status === "PUBLISHED" && (
              <div style={{ padding: "12px 20px 0" }}>
                <Alert tone="warn" title={`Revision ${latest.number} is being edited.`}>
                  Students keep using version {lockedCurrent?.number} until you publish this revision. Attempts already started never change.
                </Alert>
              </div>
            )}
            {!editable && (
              <div style={{ padding: "12px 20px 0" }}>
                <Alert tone="info" title="Questions are frozen.">
                  This version is published, so it cannot change underneath students. Create a revision to edit questions for future attempts.
                </Alert>
              </div>
            )}
            {!shown || shown.questions.length === 0 ? (
              <Empty icon="test" title="No questions yet" action={editable ? <Link className="btn btn--secondary btn--sm" href={`/portal/admin/tests/${id}/questions/new`}>Add the first question</Link> : undefined} />
            ) : (
              <ul className="list">
                {shown.questions.map((q) => (
                  <li key={q.id} style={{ alignItems: "flex-start" }}>
                    <span className="avatar" style={{ background: "var(--muted-bg)", color: "var(--navy)" }}>
                      {q.order}
                    </span>
                    <div className="list__main">
                      {editable ? (
                        <Link href={`/portal/admin/tests/${id}/questions/${q.id}`}>{q.prompt.split("\n")[0].slice(0, 120)}</Link>
                      ) : (
                        <span className="list__title">{q.prompt.split("\n")[0].slice(0, 120)}</span>
                      )}
                      <span className="list__meta">
                        {TYPE_LABEL[q.type]} · {q.topic} · {q.marks} marks{q.type === "CODING" ? ` · ${q._count.cases} cases` : ""}
                      </span>
                    </div>
                    {editable && <ConfirmAction action={deleteQuestionAction} fields={{ assessmentId: id, questionId: q.id }} label="Delete" confirmLabel="Delete" variant="danger" />}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Attempts (${t.attempts.length})`} description={pending ? `${pending} need grading.` : undefined} flush>
            {t.attempts.length === 0 ? (
              <Empty icon="users" title="No attempts yet" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Student</th>
                      <th scope="col">Attempt</th>
                      <th scope="col">Status</th>
                      <th scope="col">Grading</th>
                      <th scope="col" className="num">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.attempts.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <Link href={`/portal/admin/tests/${id}/attempts/${a.id}`}>{a.student.name}</Link>
                        </td>
                        <td className="small">
                          #{a.number} · v{a.version.number}
                          <div className="muted">{dt(a.startedAt)}</div>
                        </td>
                        <td>
                          {a.status === "IN_PROGRESS" ? (
                            <Badge tone="info">In progress · ends {dt(a.deadlineAt)}</Badge>
                          ) : a.status === "AUTO_SUBMITTED" ? (
                            <Badge tone="warn">Auto-submitted at deadline</Badge>
                          ) : (
                            <Badge tone="ok">Submitted</Badge>
                          )}
                        </td>
                        <td>
                          <Badge tone={GRADE_TONE[a.gradingStatus]}>{GRADING_LABEL[a.gradingStatus]}</Badge>
                        </td>
                        <td className="num">{a.status === "IN_PROGRESS" ? "—" : marks(a.score, a.maxScore)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {t.instructions && (
            <Card title="Instructions shown to students">
              <Markdown>{t.instructions}</Markdown>
            </Card>
          )}
        </div>

        <div className="stack">
          <Card title="Publication">
            {t.status === "DRAFT" ? (
              <div className="stack">
                <p className="small muted">Draft — students cannot see it. Publishing freezes the question set.</p>
                <ActionForm action={publishTestAction}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="mode" value="now" />
                  <SubmitButton>Publish now</SubmitButton>
                </ActionForm>
                <ActionForm action={publishTestAction}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="mode" value="schedule" />
                  <TextField name="publishAt" label="Or make visible at" type="datetime-local" defaultValue={toLocalInput(new Date(now.getTime() + 3600_000))} />
                  <SubmitButton variant="secondary">Schedule</SubmitButton>
                </ActionForm>
              </div>
            ) : t.status === "CANCELLED" ? (
              <Alert tone="bad">Cancelled.</Alert>
            ) : (
              <div className="stack stack--sm">
                <Alert tone="ok">{t.publishAt && t.publishAt > now ? `Visible to students from ${dt(t.publishAt)}.` : `Visible to students since ${dt(t.publishAt)}.`}</Alert>
                {editable ? (
                  <div className="row">
                    <ConfirmAction action={revisionAction} fields={{ id, op: "publish" }} label={`Publish revision ${latest.number}`} confirmLabel="Publish revision" variant="primary" />
                    <ConfirmAction action={revisionAction} fields={{ id, op: "discard" }} label="Discard revision" confirmLabel="Discard" variant="danger" />
                  </div>
                ) : (
                  <ConfirmAction action={revisionAction} fields={{ id, op: "create" }} label="Create a revision" confirmLabel="Create revision" description="Copies the questions for editing." />
                )}
              </div>
            )}
          </Card>
          <Card title="Results">
            <div className="stack stack--sm">
              <p className="small">
                Policy:{" "}
                <strong>
                  {t.resultPolicy === "MANUAL" ? "released by an admin" : t.resultPolicy === "AFTER_CLOSE" ? "released automatically after close" : "released as each attempt is graded"}
                </strong>
                . Solutions: <strong>{t.solutionPolicy === "NEVER" ? "never shown" : "shown with results after close"}</strong>.
              </p>
              {t.resultsReleasedAt ? (
                <Alert tone="ok">Released {dt(t.resultsReleasedAt)}.</Alert>
              ) : phase === "CLOSED" ? (
                <ConfirmAction action={releaseResultsAction} fields={{ id }} label="Release results now" confirmLabel="Release results" variant="primary" description="Graded attempts become visible." />
              ) : (
                <p className="small muted">Results can be released after the test closes.</p>
              )}
            </div>
          </Card>
          <Card title="Settings">
            <details>
              <summary className="link-button" style={{ cursor: "pointer" }}>
                Edit schedule, rules and targets
              </summary>
              <div style={{ marginTop: 16 }}>
                <TestSettingsForm
                  test={t}
                  options={options}
                  targets={{ batchIds: t.targets.map((x) => x.batchId).filter(Boolean) as string[], studentIds: t.targets.map((x) => x.studentId).filter(Boolean) as string[] }}
                />
              </div>
            </details>
          </Card>
        </div>
      </div>
    </>
  );
}
