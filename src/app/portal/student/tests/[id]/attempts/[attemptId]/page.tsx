import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Alert, Badge, Card, Markdown, PageHead, type Tone } from "@/components/ui";
import { dt } from "@/lib/display";
import { getStudentAttempt } from "@/server/assessments/attempts";
import { GRADING_LABEL } from "@/server/assessments/lifecycle";
import { isAppError } from "@/server/errors";
import { availableLanguages } from "@/server/playground";
import { pageStudent } from "@/server/session";
import { TestRunner } from "./test-runner";

export const metadata = { title: "Test attempt" };

const CASE: Record<string, { label: string; tone: Tone }> = {
  PASSED: { label: "Passed", tone: "ok" },
  WRONG_ANSWER: { label: "Wrong output", tone: "bad" },
  COMPILE_ERROR: { label: "Compile error", tone: "bad" },
  RUNTIME_ERROR: { label: "Runtime error", tone: "bad" },
  TIME_LIMIT: { label: "Time limit exceeded", tone: "bad" },
  MEMORY_LIMIT: { label: "Memory limit exceeded", tone: "bad" },
  EXECUTION_ERROR: { label: "Runner error", tone: "warn" },
};

export default async function AttemptPage(props: PageProps<"/portal/student/tests/[id]/attempts/[attemptId]">) {
  const { id, attemptId } = await props.params;
  const me = await pageStudent(`/portal/student/tests/${id}/attempts/${attemptId}`);
  const view = await getStudentAttempt(me.id, attemptId).catch((e) => {
    if (isAppError(e) && e.status === 404) notFound();
    throw e;
  });
  if (view.assessment.id !== id) notFound();

  if (view.attempt.status === "IN_PROGRESS") {
    const langs = await availableLanguages();
    const languageNames = Object.fromEntries(langs.languages.map((l) => [l.key, { name: l.name, editor: l.editor }]));
    return (
      <TestRunner
        attemptId={view.attempt.id}
        title={view.assessment.title}
        deadlineAt={view.attempt.deadlineAt.toISOString()}
        serverNow={view.serverNow.toISOString()}
        languageNames={languageNames}
        questions={view.questions.map(({ question: q }) => ({
          id: q.id,
          type: q.type,
          topic: q.topic,
          prompt: q.prompt,
          promptHtml: <Markdown>{q.prompt}</Markdown>,
          marks: q.marks,
          options: q.options,
          inputFormat: q.inputFormat,
          outputFormat: q.outputFormat,
          constraints: q.constraints,
          starterCode: q.starterCode,
          allowedLanguages: q.allowedLanguages,
          samples: q.samples,
          hiddenCaseCount: q.hiddenCaseCount,
          timeLimitMs: q.timeLimitMs,
          memoryLimitKb: q.memoryLimitKb,
        }))}
        initialAnswers={Object.fromEntries(
          view.questions.map(({ question, answer }) => [
            question.id,
            { selectedOptionIds: answer.selectedOptionIds, textAnswer: answer.textAnswer, code: answer.code, languageKey: answer.languageKey, savedAt: answer.savedAt ? answer.savedAt.toISOString() : null },
          ]),
        )}
      />
    );
  }

  const { attempt, assessment } = view;
  const percent = view.resultsVisible && attempt.score !== null && attempt.maxScore > 0 ? Math.round((attempt.score / attempt.maxScore) * 1000) / 10 : null;
  const hasExecError = view.questions.some((x) => x.result.gradeStatus === "EXECUTION_ERROR");

  return (
    <>
      <PageHead
        eyebrow={assessment.title}
        title={`Attempt ${attempt.number}`}
        description={`Submitted ${dt(attempt.submittedAt)}${attempt.status === "AUTO_SUBMITTED" ? " — automatically, when time ran out" : ""}.`}
        actions={
          <Link className="btn btn--secondary" href={`/portal/student/tests/${id}`}>
            <Icon name="arrowLeft" /> Back to test
          </Link>
        }
      />
      <div className="stack">
        <Alert tone="ok" title="Submission received.">
          Your answers are recorded and can no longer be changed.
        </Alert>
        {hasExecError && (
          <Alert tone="warn">
            The code runner had a problem while grading one of your coding answers. It has <strong>not</strong> been marked wrong — it will be graded again once the runner is available.
          </Alert>
        )}
        <div className="stats">
          <div className="stat">
            <span className="stat__label">Grading</span>
            <span className="stat__value" style={{ fontSize: "1.2rem" }}>
              {view.resultsVisible ? "Results released" : GRADING_LABEL[attempt.gradingStatus]}
            </span>
            <span className="stat__hint">{view.resultsVisible ? "Your trainer has released this result." : "Results appear here when they are released."}</span>
          </div>
          {view.resultsVisible && (
            <div className="stat">
              <span className="stat__label">Score</span>
              <span className="stat__value">
                {attempt.score} / {attempt.maxScore}
              </span>
              <span className="stat__hint">
                {percent}%{assessment.passPercent !== null ? ` · pass mark ${assessment.passPercent}% · ${percent !== null && percent >= assessment.passPercent ? "passed" : "below pass mark"}` : ""}
              </span>
            </div>
          )}
        </div>

        {view.resultsVisible &&
          view.questions.map(({ question: q, answer, result }, i) => (
            <Card
              key={q.id}
              title={`Q${i + 1} · ${q.topic}`}
              actions={
                "marksAwarded" in result ? (
                  <Badge tone={result.marksAwarded === q.marks ? "ok" : result.marksAwarded && result.marksAwarded > 0 ? "info" : "muted"}>
                    {result.marksAwarded} / {q.marks}
                  </Badge>
                ) : undefined
              }
            >
              <div className="stack">
                <Markdown>{q.prompt}</Markdown>
                {(q.type === "MCQ_SINGLE" || q.type === "MCQ_MULTI") && (
                  <ul className="list" style={{ border: "1px solid var(--line)", borderRadius: 10 }}>
                    {q.options.map((o) => (
                      <li key={o.id}>
                        <div className="list__main">{o.text}</div>
                        {answer.selectedOptionIds.includes(o.id) && <Badge tone="info">Your answer</Badge>}
                        {q.correctOptionIds?.includes(o.id) && <Badge tone="ok">Correct</Badge>}
                      </li>
                    ))}
                  </ul>
                )}
                {q.type === "SHORT_ANSWER" && <div className="msg__bubble">{answer.textAnswer ? <Markdown>{answer.textAnswer}</Markdown> : <span className="muted">No answer</span>}</div>}
                {q.type === "CODING" && "samples" in result && (
                  <>
                    {answer.code ? <pre className="codeblock">{answer.code}</pre> : <p className="muted">No code submitted.</p>}
                    <div className="row">
                      {(result.samples ?? []).map((s, j) => (
                        <Badge key={j} tone={CASE[s.outcome].tone}>
                          Sample {j + 1}: {CASE[s.outcome].label}
                        </Badge>
                      ))}
                      {(result.hiddenTotal ?? 0) > 0 && (
                        <Badge tone={result.hiddenPassed === result.hiddenTotal ? "ok" : "muted"}>
                          Hidden cases passed: {result.hiddenPassed} of {result.hiddenTotal}
                        </Badge>
                      )}
                    </div>
                  </>
                )}
                {"feedback" in result && result.feedback && (
                  <div className="msg__bubble" style={{ borderColor: "#B5E3DB", background: "#F4FBFA" }}>
                    <strong className="small">Trainer feedback</strong>
                    <Markdown>{result.feedback}</Markdown>
                  </div>
                )}
                {q.solution && (
                  <details>
                    <summary className="link-button" style={{ cursor: "pointer" }}>
                      Solution
                    </summary>
                    <div style={{ marginTop: 8 }}>{q.type === "CODING" ? <pre className="codeblock">{q.solution}</pre> : <Markdown>{q.solution}</Markdown>}</div>
                  </details>
                )}
              </div>
            </Card>
          ))}
      </div>
    </>
  );
}
