import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { Badge, Card, Empty, PageHead, Tabs, type Tone } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt } from "@/lib/display";
import { assessmentPhase, PHASE_LABEL, type AssessmentPhase } from "@/server/assessments/lifecycle";
import { pageAdmin } from "@/server/session";
import { targetSummary } from "../targets";

export const metadata = { title: "Tests" };

const PHASE_TONE: Record<AssessmentPhase, Tone> = { DRAFT: "muted", SCHEDULED: "info", PUBLISHED: "info", OPEN: "ok", CLOSED: "muted", CANCELLED: "bad" };

const VIEWS = [
  { key: "all", label: "All tests" },
  { key: "drafts", label: "Drafts" },
  { key: "upcoming", label: "Upcoming" },
  { key: "open", label: "Open now" },
  { key: "closed", label: "Closed" },
  { key: "grading", label: "Answers to grade" },
  { key: "errors", label: "Runner errors" },
];

export default async function TestsPage(props: PageProps<"/portal/admin/tests">) {
  await pageAdmin("/portal/admin/tests");
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const view = one(sp.view) || one(sp.phase) || "all";
  const now = new Date();

  if (view === "grading" || view === "errors") {
    const answers = await prisma.attemptAnswer.findMany({
      where: { gradeStatus: view === "grading" ? "NEEDS_REVIEW" : "EXECUTION_ERROR" },
      orderBy: { attempt: { submittedAt: "asc" } },
      take: 100,
      include: {
        question: { select: { order: true, type: true, topic: true } },
        attempt: { select: { id: true, submittedAt: true, student: { select: { name: true } }, assessment: { select: { id: true, title: true } } } },
      },
    });
    return (
      <>
        <PageHead title="Tests" description="Practice tests and weekly examinations share one assessment system." actions={<Link className="btn btn--primary" href="/portal/admin/tests/new">New test</Link>} />
        <Tabs items={VIEWS.map((v) => ({ ...v, href: `/portal/admin/tests?view=${v.key}` }))} current={view} />
        <Card
          title={view === "grading" ? "Written answers waiting for review" : "Coding answers affected by runner errors"}
          description={view === "errors" ? "These were not marked wrong. Retry grading once the code runner is available." : undefined}
          flush
        >
          {answers.length === 0 ? (
            <Empty icon="check" title={view === "grading" ? "Nothing to grade" : "No runner errors"} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Test</th>
                    <th scope="col">Student</th>
                    <th scope="col">Question</th>
                    <th scope="col">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {answers.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link href={`/portal/admin/tests/${a.attempt.assessment.id}/attempts/${a.attempt.id}#q-${a.questionId}`}>{a.attempt.assessment.title}</Link>
                      </td>
                      <td>{a.attempt.student.name}</td>
                      <td>
                        Q{a.question.order} · {a.question.topic}
                      </td>
                      <td className="nowrap">{dt(a.attempt.submittedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </>
    );
  }

  const where: Prisma.AssessmentWhereInput = { archivedAt: null };
  if (view === "drafts") where.status = "DRAFT";
  if (view === "upcoming") Object.assign(where, { status: "PUBLISHED", OR: [{ publishAt: { gt: now } }, { opensAt: { gt: now } }] });
  if (view === "open") Object.assign(where, { status: "PUBLISHED", publishAt: { lte: now }, opensAt: { lte: now }, closesAt: { gt: now } });
  if (view === "closed") Object.assign(where, { status: "PUBLISHED", closesAt: { lte: now } });

  const tests = await prisma.assessment.findMany({
    where,
    orderBy: { opensAt: "desc" },
    take: 100,
    include: {
      targets: { include: { batch: { select: { code: true } }, student: { select: { name: true } } } },
      _count: { select: { attempts: true } },
      attempts: { where: { gradingStatus: { in: ["AWAITING_GRADING", "PARTIALLY_GRADED"] } }, select: { id: true } },
    },
  });

  return (
    <>
      <PageHead title="Tests" description="Practice tests and weekly examinations share one assessment system: Draft → Published/Scheduled → Open → Closed." actions={<Link className="btn btn--primary" href="/portal/admin/tests/new">New test</Link>} />
      <Tabs items={VIEWS.map((v) => ({ ...v, href: `/portal/admin/tests?view=${v.key}` }))} current={view} />
      <Card flush>
        {tests.length === 0 ? (
          <Empty icon="test" title="No tests here" action={<Link className="btn btn--secondary btn--sm" href="/portal/admin/tests/new">Create a test</Link>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Test</th>
                  <th scope="col">Assigned to</th>
                  <th scope="col">Status</th>
                  <th scope="col">Window</th>
                  <th scope="col">Results</th>
                  <th scope="col" className="num">Attempts</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => {
                  const phase = assessmentPhase(t, now);
                  return (
                    <tr key={t.id}>
                      <td>
                        <Link href={`/portal/admin/tests/${t.id}`}>{t.title}</Link>
                        <div className="small muted">
                          {t.kind === "WEEKLY" ? "Weekly examination" : "Practice test"} · {t.durationMinutes} min
                        </div>
                      </td>
                      <td className="small">{targetSummary(t.targets)}</td>
                      <td>
                        <Badge tone={PHASE_TONE[phase]}>{PHASE_LABEL[phase]}</Badge>
                      </td>
                      <td className="small nowrap">
                        {dt(t.opensAt)}
                        <br />→ {dt(t.closesAt)}
                      </td>
                      <td>
                        {t.resultsReleasedAt ? (
                          <Badge tone="ok">Released</Badge>
                        ) : t.resultPolicy === "MANUAL" ? (
                          <Badge>Not released</Badge>
                        ) : (
                          <Badge tone="info">{t.resultPolicy === "AFTER_CLOSE" ? "Auto after close" : "Auto when graded"}</Badge>
                        )}
                      </td>
                      <td className="num">
                        {t._count.attempts}
                        {t.attempts.length > 0 && (
                          <div>
                            <Badge tone="warn">{t.attempts.length} to grade</Badge>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
