import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Icon } from "@/components/icons";
import { Alert, Badge, Card, Markdown, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt } from "@/lib/display";
import { getVisibleAssessment } from "@/server/access";
import { assessmentPhase, GRADING_LABEL, PHASE_LABEL, resultsVisible } from "@/server/assessments/lifecycle";
import { isAppError } from "@/server/errors";
import { pageStudent } from "@/server/session";
import { startAttemptAction } from "../actions";

export default async function StudentTest(props: PageProps<"/portal/student/tests/[id]">) {
  const { id } = await props.params;
  const me = await pageStudent(`/portal/student/tests/${id}`);
  const t = await getVisibleAssessment(me.id, id).catch((e) => {
    if (isAppError(e) && e.status === 404) notFound();
    throw e;
  });
  const now = new Date();
  const phase = assessmentPhase(t, now);
  const attempts = await prisma.attempt.findMany({ where: { assessmentId: id, studentId: me.id }, orderBy: { number: "desc" } });
  const inProgress = attempts.find((a) => a.status === "IN_PROGRESS" && a.deadlineAt > now);
  const canStart = phase === "OPEN" && !inProgress && attempts.filter((a) => a.status !== "IN_PROGRESS" || a.deadlineAt <= now).length < t.maxAttempts;
  const effectiveMinutes = Math.min(t.durationMinutes, Math.max(0, Math.floor((t.closesAt.getTime() - now.getTime()) / 60000)));
  const helpText =
    t.helpPolicy === "NO_HELP_WHILE_OPEN" ? "Doubts about this test can be raised after it closes." : t.helpPolicy === "PRIVATE_CLARIFICATION" ? "You may ask a private clarification question while it is open." : "You may raise private doubts about this test while it is open.";

  return (
    <>
      <PageHead
        eyebrow={t.kind === "WEEKLY" ? "Weekly examination" : "Practice test"}
        title={t.title}
        description={
          <>
            <Badge tone={phase === "OPEN" ? "ok" : "info"}>{PHASE_LABEL[phase]}</Badge> Opens {dt(t.opensAt)} · closes {dt(t.closesAt)}
          </>
        }
        actions={
          (phase !== "OPEN" || t.helpPolicy !== "NO_HELP_WHILE_OPEN") && (
            <Link className="btn btn--secondary" href={`/portal/student/doubts/new?link=test:${t.id}`}>
              <Icon name="question" /> Ask about this test
            </Link>
          )
        }
      />
      <div className="grid grid--main-side">
        <div className="stack">
          {inProgress && (
            <Alert tone="info" title="You have an attempt in progress.">
              It ends {dt(inProgress.deadlineAt)}. <Link href={`/portal/student/tests/${id}/attempts/${inProgress.id}`}>Resume your attempt</Link>.
            </Alert>
          )}
          <Card title="Before you start">
            <div className="stack">
              {t.instructions ? <Markdown>{t.instructions}</Markdown> : <p className="muted">No special instructions.</p>}
              <ul style={{ margin: 0, paddingLeft: "1.2em" }}>
                <li>
                  You have <strong>{t.durationMinutes} minutes</strong> once you start, ending no later than the closing time ({dt(t.closesAt)}).
                </li>
                <li>The timer runs on the server. Refreshing or closing the page does not pause it.</li>
                <li>Answers save automatically. If time runs out, your saved answers are submitted for you.</li>
                <li>
                  Attempts allowed: {t.maxAttempts}. Used: {attempts.length}.
                </li>
                {t.passPercent !== null && <li>Pass mark: {t.passPercent}%.</li>}
                <li>{helpText}</li>
              </ul>
              {phase === "OPEN" && effectiveMinutes < t.durationMinutes && !inProgress && (
                <Alert tone="warn">The test closes soon — if you start now you will have about {effectiveMinutes} minutes.</Alert>
              )}
              {inProgress ? (
                <Link className="btn btn--primary btn--lg" href={`/portal/student/tests/${id}/attempts/${inProgress.id}`}>
                  Resume attempt <Icon name="arrowRight" />
                </Link>
              ) : canStart ? (
                <ActionForm action={startAttemptAction}>
                  <input type="hidden" name="assessmentId" value={id} />
                  <SubmitButton pendingText="Starting…" className="btn--lg">
                    {attempts.length ? `Start attempt ${attempts.length + 1}` : "Start test"}
                  </SubmitButton>
                </ActionForm>
              ) : phase === "PUBLISHED" || phase === "SCHEDULED" ? (
                <Alert tone="info">This test opens {dt(t.opensAt)}.</Alert>
              ) : phase === "CLOSED" ? (
                <Alert tone="info">This test is closed.</Alert>
              ) : (
                <Alert tone="info">You have used all your attempts.</Alert>
              )}
            </div>
          </Card>
        </div>
        <Card title="Your attempts" flush>
          {attempts.length === 0 ? (
            <p className="muted" style={{ padding: 20 }}>
              No attempts yet.
            </p>
          ) : (
            <ul className="list">
              {attempts.map((a) => {
                const visible = resultsVisible(t, a, now);
                return (
                  <li key={a.id}>
                    <div className="list__main">
                      <Link href={`/portal/student/tests/${id}/attempts/${a.id}`}>Attempt {a.number}</Link>
                      <span className="list__meta">
                        {a.status === "IN_PROGRESS" ? `Ends ${dt(a.deadlineAt)}` : `Submitted ${dt(a.submittedAt)}${a.status === "AUTO_SUBMITTED" ? " (time ran out)" : ""}`}
                      </span>
                    </div>
                    {a.status === "IN_PROGRESS" ? (
                      <Badge tone="info">In progress</Badge>
                    ) : visible ? (
                      <Badge tone="ok">
                        {a.score} / {a.maxScore}
                      </Badge>
                    ) : (
                      <Badge>{a.gradingStatus === "GRADED" ? "Results not released yet" : GRADING_LABEL[a.gradingStatus]}</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
