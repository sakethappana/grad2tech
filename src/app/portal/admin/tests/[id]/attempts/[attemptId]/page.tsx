import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton, TextArea, TextField } from "@/components/forms";
import { Alert, Badge, Card, Markdown, PageHead, type Tone } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt, marks } from "@/lib/display";
import { GRADING_LABEL } from "@/server/assessments/lifecycle";
import { pageAdmin } from "@/server/session";
import { gradeAnswerAction, retryGradingAction } from "../../../actions";

const ANSWER: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Grading in progress", tone: "info" },
  UNANSWERED: { label: "Not answered", tone: "muted" },
  AUTO_GRADED: { label: "Auto-graded", tone: "ok" },
  NEEDS_REVIEW: { label: "Needs review", tone: "warn" },
  REVIEWED: { label: "Reviewed", tone: "ok" },
  EXECUTION_ERROR: { label: "Runner error — not marked wrong", tone: "warn" },
};
const CASE_LABEL: Record<string, string> = {
  PASSED: "Passed",
  WRONG_ANSWER: "Wrong output",
  COMPILE_ERROR: "Compile error",
  RUNTIME_ERROR: "Runtime error",
  TIME_LIMIT: "Time limit exceeded",
  MEMORY_LIMIT: "Memory limit exceeded",
  EXECUTION_ERROR: "Runner error",
};

export default async function AttemptGrading(props: PageProps<"/portal/admin/tests/[id]/attempts/[attemptId]">) {
  const { id, attemptId } = await props.params;
  const path = `/portal/admin/tests/${id}/attempts/${attemptId}`;
  await pageAdmin(path);
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, assessmentId: id },
    include: {
      assessment: { select: { title: true, passPercent: true } },
      student: { select: { id: true, name: true, email: true } },
      version: { select: { number: true } },
      answers: {
        include: {
          question: { include: { cases: { orderBy: { order: "asc" } } } },
          caseResults: true,
          gradingJob: true,
          gradedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!attempt) notFound();
  const byQ = new Map(attempt.answers.map((a) => [a.questionId, a]));
  const questions = await prisma.question.findMany({ where: { versionId: attempt.versionId }, include: { cases: { orderBy: { order: "asc" } } } });
  const qBy = new Map(questions.map((q) => [q.id, q]));
  const ordered = attempt.questionOrder.map((qid) => qBy.get(qid)).filter((q): q is NonNullable<typeof q> => Boolean(q));
  const percent = attempt.maxScore > 0 && attempt.score !== null ? Math.round((attempt.score / attempt.maxScore) * 1000) / 10 : null;

  return (
    <>
      <PageHead
        eyebrow={attempt.assessment.title}
        title={`${attempt.student.name} · attempt ${attempt.number}`}
        description={
          <>
            Started {dt(attempt.startedAt)} · {attempt.status === "IN_PROGRESS" ? `in progress, deadline ${dt(attempt.deadlineAt)}` : `submitted ${dt(attempt.submittedAt)}${attempt.status === "AUTO_SUBMITTED" ? " (automatically at the deadline)" : ""}`} · question version {attempt.version.number}
          </>
        }
        actions={
          <>
            <Link className="btn btn--secondary" href={`/portal/admin/tests/${id}`}>
              Back to test
            </Link>
            <Link className="btn btn--secondary" href={`/portal/admin/students/${attempt.student.id}?tab=performance`}>
              Student performance
            </Link>
          </>
        }
      />
      <div className="stack">
        <div className="stats">
          <div className="stat">
            <span className="stat__label">Score</span>
            <span className="stat__value">{marks(attempt.score, attempt.maxScore)}</span>
            <span className="stat__hint">{percent !== null ? `${percent}%` : ""}{attempt.assessment.passPercent ? ` · pass mark ${attempt.assessment.passPercent}%` : ""}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Grading</span>
            <span className="stat__value" style={{ fontSize: "1.2rem" }}>{GRADING_LABEL[attempt.gradingStatus]}</span>
            <span className="stat__hint">Score counts graded answers only until grading is complete.</span>
          </div>
        </div>

        {ordered.map((q, i) => {
          const a = byQ.get(q.id);
          const st = ANSWER[a?.gradeStatus ?? "UNANSWERED"];
          const options = (q.options as { id: string; text: string }[] | null) ?? [];
          return (
            <Card
              key={q.id}
              id={`q-${q.id}`}
              title={
                <>
                  Q{i + 1} · {q.topic} · {q.marks} marks
                </>
              }
              actions={<Badge tone={st.tone}>{st.label}</Badge>}
            >
              <div className="stack">
                <Markdown>{q.prompt}</Markdown>
                {(q.type === "MCQ_SINGLE" || q.type === "MCQ_MULTI") && (
                  <ul className="list" style={{ border: "1px solid var(--line)", borderRadius: 10 }}>
                    {options.map((o) => {
                      const picked = a?.selectedOptionIds.includes(o.id);
                      const correct = q.correctOptionIds.includes(o.id);
                      return (
                        <li key={o.id}>
                          <div className="list__main">{o.text}</div>
                          {picked && <Badge tone={correct ? "ok" : "bad"}>Selected</Badge>}
                          {correct && <Badge tone="teal">Correct answer</Badge>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {q.type === "SHORT_ANSWER" && (
                  <div className="msg__bubble">{a?.textAnswer?.trim() ? <Markdown>{a.textAnswer}</Markdown> : <span className="muted">No answer</span>}</div>
                )}
                {q.type === "CODING" && (
                  <>
                    {a?.code?.trim() ? <pre className="codeblock">{a.code}</pre> : <p className="muted">No code submitted.</p>}
                    {q.cases.length > 0 && (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th scope="col">Case</th>
                              <th scope="col">Type</th>
                              <th scope="col" className="num">Weight</th>
                              <th scope="col">Result</th>
                              <th scope="col" className="num">Time</th>
                              <th scope="col" className="num">Memory</th>
                            </tr>
                          </thead>
                          <tbody>
                            {q.cases.map((c) => {
                              const r = a?.caseResults.find((x) => x.caseId === c.id);
                              return (
                                <tr key={c.id}>
                                  <td>#{c.order}</td>
                                  <td>{c.isSample ? "Sample" : "Hidden"}</td>
                                  <td className="num">{c.weight}</td>
                                  <td>{r ? <Badge tone={r.outcome === "PASSED" ? "ok" : r.outcome === "EXECUTION_ERROR" ? "warn" : "bad"}>{CASE_LABEL[r.outcome]}</Badge> : <span className="muted">—</span>}</td>
                                  <td className="num">{r?.timeMs != null ? `${r.timeMs} ms` : "—"}</td>
                                  <td className="num">{r?.memoryKb != null ? `${Math.round(r.memoryKb / 1024)} MB` : "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {a?.gradingJob?.lastError && <Alert tone="warn">Last grading attempt: {a.gradingJob.lastError}</Alert>}
                    {a && (a.gradeStatus === "EXECUTION_ERROR" || a.gradingJob?.status === "FAILED") && (
                      <ActionForm action={retryGradingAction}>
                        <input type="hidden" name="answerId" value={a.id} />
                        <input type="hidden" name="path" value={path} />
                        <SubmitButton variant="secondary">Retry grading</SubmitButton>
                      </ActionForm>
                    )}
                  </>
                )}
                {q.solution && (
                  <details>
                    <summary className="link-button" style={{ cursor: "pointer" }}>
                      Marking guide / solution
                    </summary>
                    <div style={{ marginTop: 10 }}>{q.type === "CODING" ? <pre className="codeblock">{q.solution}</pre> : <Markdown>{q.solution}</Markdown>}</div>
                  </details>
                )}
                {a && attempt.status !== "IN_PROGRESS" && (
                  <ActionForm action={gradeAnswerAction} className="form" key={`${a.id}-${a.marksAwarded}`}>
                    <input type="hidden" name="answerId" value={a.id} />
                    <input type="hidden" name="path" value={path} />
                    <div className="form__row">
                      <TextField name="marks" label={`Marks (0–${q.marks})`} type="number" min={0} max={q.marks} step="0.25" defaultValue={a.marksAwarded ?? ""} />
                      <TextArea name="feedback" label="Feedback (optional)" rows={2} defaultValue={a.feedback} />
                    </div>
                    <div className="row">
                      <SubmitButton variant={a.gradeStatus === "NEEDS_REVIEW" ? "primary" : "secondary"}>{a.gradeStatus === "NEEDS_REVIEW" ? "Save marks" : "Override marks"}</SubmitButton>
                      {a.gradedBy && (
                        <span className="small muted">
                          Last marked by {a.gradedBy.name} {dt(a.gradedAt)}
                        </span>
                      )}
                    </div>
                  </ActionForm>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
