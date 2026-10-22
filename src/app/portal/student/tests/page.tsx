import Link from "next/link";
import { Badge, Card, Empty, PageHead, type Tone } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt, rel } from "@/lib/display";
import { activeBatchIds, visibleAssessmentWhere } from "@/server/access";
import { assessmentPhase, resultsVisible } from "@/server/assessments/lifecycle";
import { pageStudent } from "@/server/session";

export const metadata = { title: "Tests" };

export default async function StudentTests() {
  const me = await pageStudent("/portal/student/tests");
  const now = new Date();
  const batchIds = await activeBatchIds(me.id);
  const tests = await prisma.assessment.findMany({
    where: { OR: [visibleAssessmentWhere(me.id, batchIds, now), { status: "PUBLISHED", attempts: { some: { studentId: me.id } } }] },
    orderBy: { opensAt: "desc" },
    include: { attempts: { where: { studentId: me.id }, orderBy: { number: "desc" } } },
  });
  const open = tests.filter((t) => assessmentPhase(t, now) === "OPEN");
  const upcoming = tests.filter((t) => assessmentPhase(t, now) === "PUBLISHED");
  const closed = tests.filter((t) => assessmentPhase(t, now) === "CLOSED");

  const statusFor = (t: (typeof tests)[number]): { label: string; tone: Tone } => {
    const last = t.attempts[0];
    if (last?.status === "IN_PROGRESS" && last.deadlineAt > now) return { label: "In progress", tone: "info" };
    if (!last) return assessmentPhase(t, now) === "CLOSED" ? { label: "Not attempted", tone: "bad" } : { label: "Not started", tone: "muted" };
    if (resultsVisible(t, last, now)) return { label: `Result: ${last.score} / ${last.maxScore}`, tone: "ok" };
    if (last.gradingStatus === "GRADED") return { label: "Graded · not released", tone: "muted" };
    if (last.gradingStatus === "PARTIALLY_GRADED") return { label: "Partially graded", tone: "info" };
    return { label: "Awaiting grading", tone: "info" };
  };

  const Table = ({ rows, empty }: { rows: typeof tests; empty: string }) =>
    rows.length === 0 ? (
      <Empty icon="test" title={empty} />
    ) : (
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Test</th>
              <th scope="col">Window</th>
              <th scope="col">Attempts</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const s = statusFor(t);
              return (
                <tr key={t.id}>
                  <td>
                    <Link href={`/portal/student/tests/${t.id}`}>{t.title}</Link>
                    <div className="small muted">
                      {t.kind === "WEEKLY" ? "Weekly examination" : "Practice test"} · {t.durationMinutes} min
                    </div>
                  </td>
                  <td className="small nowrap">
                    {dt(t.opensAt)}
                    <br />
                    closes {rel(t.closesAt)}
                  </td>
                  <td className="num">
                    {t.attempts.length} / {t.maxAttempts}
                  </td>
                  <td>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  return (
    <>
      <PageHead title="Tests" description="Daily practice tests and weekly examinations. The timer is kept by the server, so refreshing never resets it." />
      <div className="stack">
        <Card title="Open now" flush>
          <Table rows={open} empty="No tests are open right now" />
        </Card>
        <Card title="Upcoming" flush>
          <Table rows={upcoming} empty="No upcoming tests" />
        </Card>
        <Card title="Completed and closed" flush>
          <Table rows={closed} empty="No closed tests yet" />
        </Card>
      </div>
    </>
  );
}
