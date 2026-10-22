import Link from "next/link";
import { Badge, Card, Empty, PageHead, Stat } from "@/components/ui";
import { dt, rel } from "@/lib/display";
import { adminOverview } from "@/server/reports";
import { pageAdmin } from "@/server/session";

export const metadata = { title: "Overview" };

const GRADING_TONE = { AWAITING_GRADING: "warn", PARTIALLY_GRADED: "info", GRADED: "ok", NOT_STARTED: "muted" } as const;
const GRADING_LABEL = { AWAITING_GRADING: "Awaiting grading", PARTIALLY_GRADED: "Partially graded", GRADED: "Graded", NOT_STARTED: "—" } as const;

export default async function AdminOverview() {
  const user = await pageAdmin("/portal/admin");
  const o = await adminOverview();
  const c = o.counts;
  return (
    <>
      <PageHead eyebrow="Overview" title={`Hello, ${user.name.split(" ")[0]}`} description="Today's picture across batches, coursework, tests and doubts. Every number links to its records." />

      <div className="stack">
        <div className="stats">
          <Stat label="Active students" value={c.activeStudents} hint="With an active enrolment" href="/portal/admin/students?status=active" />
          <Stat label="Active batches" value={c.activeBatches} href="/portal/admin/batches" />
          <Stat label="Assignments due" value={c.assignmentsDue} hint="In the next 7 days" href="/portal/admin/assignments?view=due" />
          <Stat label="Awaiting review" value={c.awaitingReview} hint="Submitted, not yet marked" href="/portal/admin/assignments?view=review" alert={c.awaitingReview > 0} />
        </div>
        <div className="stats">
          <Stat label="Tests scheduled" value={c.testsScheduled} hint="Published, not yet open" href="/portal/admin/tests?phase=upcoming" />
          <Stat label="Tests open now" value={c.testsOpen} href="/portal/admin/tests?phase=open" />
          <Stat label="Tests completed" value={c.testsClosed} hint="Closed in the last 30 days" href="/portal/admin/tests?phase=closed" />
          <Stat label="Answers to grade" value={c.writtenToGrade} hint="Written answers needing review" href="/portal/admin/tests?view=grading" alert={c.writtenToGrade > 0} />
        </div>
        <div className="stats">
          <Stat label="Open doubts" value={c.openDoubts} href="/portal/admin/doubts?status=open" />
          <Stat label="Unanswered doubts" value={c.unansweredDoubts} hint="No trainer reply yet" href="/portal/admin/doubts?status=unanswered" alert={c.unansweredDoubts > 0} />
          <Stat
            label="First response time"
            value={o.responseHours === null ? "—" : `${o.responseHours} h`}
            hint="Average, doubts opened in the last 30 days"
            href="/portal/admin/doubts"
          />
          <Stat label="Runner errors" value={c.gradingErrors} hint="Coding answers to re-grade" href="/portal/admin/tests?view=errors" alert={c.gradingErrors > 0} />
        </div>

        <div className="grid grid--2">
          <Card
            title="Students who missed work"
            description="Assignments due in the last 14 days with no submission."
            flush
          >
            {o.missed.length === 0 ? (
              <Empty icon="check" title="No missed assignments">Everyone assigned work in the last 14 days has submitted it.</Empty>
            ) : (
              <ul className="list">
                {o.missed.map((m) => (
                  <li key={m.student!.id}>
                    <div className="list__main">
                      <Link href={`/portal/admin/students/${m.student!.id}`}>{m.student!.name}</Link>
                      <span className="list__meta">{m.student!.email}</span>
                    </div>
                    <Badge tone="bad">{m.count} missing</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Declining test results" description="Latest graded test at least 10 points below the one before it (last 60 days)." flush>
            {o.declining.length === 0 ? (
              <Empty icon="trend" title="No declines detected">No student's latest result dropped by 10 points or more.</Empty>
            ) : (
              <ul className="list">
                {o.declining.map((d) => (
                  <li key={d.studentId}>
                    <div className="list__main">
                      <Link href={`/portal/admin/students/${d.studentId}?tab=performance`}>{d.student!.name}</Link>
                      <span className="list__meta">
                        Previous {d.previous}% → latest {d.latest}%
                      </span>
                    </div>
                    <Badge tone="warn">−{d.previous - d.latest} pts</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid grid--2">
          <Card title="Recent assignment submissions" flush actions={<Link className="btn btn--ghost btn--sm" href="/portal/admin/assignments?view=review">Review queue</Link>}>
            {o.recentSubmissions.length === 0 ? (
              <Empty icon="clipboard" title="No submissions yet" />
            ) : (
              <ul className="list">
                {o.recentSubmissions.map((s) => (
                  <li key={s.id}>
                    <div className="list__main">
                      <Link href={`/portal/admin/assignments/${s.assignment.id}/submissions/${s.id}`}>{s.assignment.title}</Link>
                      <span className="list__meta">
                        {s.student.name} · {rel(s.submittedAt)}
                      </span>
                    </div>
                    {s.isLate && <Badge tone="warn">Late</Badge>}
                    <Badge tone={s.status === "REVIEWED" ? "ok" : s.status === "SUBMITTED" ? "info" : "warn"}>
                      {s.status === "REVIEWED" ? "Reviewed" : s.status === "SUBMITTED" ? "To review" : "Resubmit requested"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Recent test attempts" flush>
            {o.recentAttempts.length === 0 ? (
              <Empty icon="test" title="No attempts yet" />
            ) : (
              <ul className="list">
                {o.recentAttempts.map((a) => (
                  <li key={a.id}>
                    <div className="list__main">
                      <Link href={`/portal/admin/tests/${a.assessment.id}/attempts/${a.id}`}>{a.assessment.title}</Link>
                      <span className="list__meta">
                        {a.student.name} · {rel(a.submittedAt)} {a.status === "AUTO_SUBMITTED" ? "· auto-submitted at deadline" : ""}
                      </span>
                    </div>
                    <Badge tone={GRADING_TONE[a.gradingStatus]}>{GRADING_LABEL[a.gradingStatus]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid grid--2">
          <Card title="Recent project submissions" flush actions={<Link className="btn btn--ghost btn--sm" href="/portal/admin/projects">All projects</Link>}>
            {o.recentProjects.length === 0 ? (
              <Empty icon="folder" title="No project submissions yet" />
            ) : (
              <ul className="list">
                {o.recentProjects.map((p) => (
                  <li key={p.id}>
                    <div className="list__main">
                      <Link href={`/portal/admin/projects/submissions/${p.id}`}>{p.project.name}</Link>
                      <span className="list__meta">
                        {p.student.name} · {rel(p.submittedAt)}
                      </span>
                    </div>
                    <Badge tone={p.status === "REVIEWED" ? "ok" : p.status === "SUBMITTED" ? "info" : "warn"}>
                      {p.status === "REVIEWED" ? "Reviewed" : p.status === "SUBMITTED" ? "To review" : "Changes requested"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Recent activity" description="From the audit trail." flush actions={<Link className="btn btn--ghost btn--sm" href="/portal/admin/settings?tab=audit">Audit log</Link>}>
            {o.activity.length === 0 ? (
              <Empty icon="info" title="No activity recorded yet" />
            ) : (
              <ul className="list">
                {o.activity.map((a) => (
                  <li key={a.id}>
                    <div className="list__main">
                      <span className="list__title">{a.action.replace(/[._]/g, " ")}</span>
                      <span className="list__meta">
                        {a.actor?.name ?? "System"} · {dt(a.createdAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
