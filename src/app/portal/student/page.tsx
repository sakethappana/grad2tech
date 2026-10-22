import Link from "next/link";
import { Icon } from "@/components/icons";
import { Alert, Badge, Card, Empty, Meter, PageHead, Stat } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt, pct, rel } from "@/lib/display";
import { startOfZonedDay } from "@/lib/time";
import { DISPLAY_TZ } from "@/lib/display";
import { activeBatchIds, visibleAnnouncementWhere, visibleAssessmentWhere, visibleAssignmentWhere } from "@/server/access";
import { studentAssignmentStatus, STUDENT_STATUS_LABEL } from "@/server/assignments";
import { assessmentPhase } from "@/server/assessments/lifecycle";
import { studentAssignmentMetrics, studentTestMetrics } from "@/server/reports";
import { pageStudent } from "@/server/session";

export const metadata = { title: "Dashboard" };

export default async function StudentDashboard() {
  const me = await pageStudent("/portal/student");
  const now = new Date();
  const batchIds = await activeBatchIds(me.id);
  const todayStart = startOfZonedDay(now, DISPLAY_TZ);
  const todayEnd = new Date(todayStart.getTime() + 86_400_000);

  const [assignments, tests, inProgress, nextClass, feedback, doubtReplies, announcements, aMetrics, tMetrics] = await Promise.all([
    prisma.assignment.findMany({
      where: { ...visibleAssignmentWhere(me.id, batchIds, now), dueAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } },
      orderBy: { dueAt: "asc" },
      include: { submissions: { where: { studentId: me.id } } },
    }),
    prisma.assessment.findMany({
      where: { ...visibleAssessmentWhere(me.id, batchIds, now), closesAt: { gt: now } },
      orderBy: { opensAt: "asc" },
      include: { attempts: { where: { studentId: me.id }, select: { id: true, status: true } } },
    }),
    prisma.attempt.findFirst({ where: { studentId: me.id, status: "IN_PROGRESS", deadlineAt: { gt: now } }, include: { assessment: { select: { id: true, title: true } } } }),
    prisma.classSession.findFirst({
      where: { batchId: { in: batchIds }, cancelledAt: null, startsAt: { gte: new Date(now.getTime() - 2 * 3600_000) } },
      orderBy: { startsAt: "asc" },
      include: { instructor: { select: { name: true } } },
    }),
    prisma.submission.findMany({
      where: { studentId: me.id, status: { in: ["REVIEWED", "RESUBMIT_REQUESTED"] }, reviewedAt: { not: null } },
      orderBy: { reviewedAt: "desc" },
      take: 4,
      include: { assignment: { select: { id: true, title: true, maxMarks: true } } },
    }),
    prisma.notification.findMany({ where: { userId: me.id, type: "DOUBT_REPLY", readAt: null }, orderBy: { createdAt: "desc" }, take: 4 }),
    prisma.announcement.findMany({ where: visibleAnnouncementWhere(batchIds), orderBy: { publishedAt: "desc" }, take: 2 }),
    studentAssignmentMetrics(me.id, now),
    studentTestMetrics(me.id, "student", now),
  ]);

  const rows = assignments.map((a) => ({ a, status: studentAssignmentStatus(a, a.submissions[0], now) }));
  const overdue = rows.filter((r) => r.status === "OVERDUE" && r.a.allowLate);
  const missedClosed = rows.filter((r) => r.status === "OVERDUE" && !r.a.allowLate).length;
  const dueToday = rows.filter((r) => r.a.dueAt >= now && r.a.dueAt < todayEnd && (r.status === "NOT_STARTED" || r.status === "IN_PROGRESS" || r.status === "RESUBMIT_REQUESTED"));
  const resubmit = rows.filter((r) => r.status === "RESUBMIT_REQUESTED");
  const upcomingWork = rows.filter((r) => r.a.dueAt >= todayEnd && (r.status === "NOT_STARTED" || r.status === "IN_PROGRESS")).slice(0, 5);
  const openTests = tests.filter((t) => assessmentPhase(t, now) === "OPEN" && t.attempts.length < t.maxAttempts && !t.attempts.some((x) => x.status === "IN_PROGRESS"));
  const upcomingTests = tests.filter((t) => assessmentPhase(t, now) === "PUBLISHED");

  // The single most useful next action.
  let next: { title: string; detail: string; href: string; cta: string } | null = null;
  if (inProgress) next = { title: `Resume your test: ${inProgress.assessment.title}`, detail: `Your attempt ends ${dt(inProgress.deadlineAt)}. Answers are saved as you go.`, href: `/portal/student/tests/${inProgress.assessment.id}/attempts/${inProgress.id}`, cta: "Resume test" };
  else if (resubmit[0]) next = { title: `Resubmit: ${resubmit[0].a.title}`, detail: "Your trainer asked for changes.", href: `/portal/student/assignments/${resubmit[0].a.id}`, cta: "Open assignment" };
  else if (dueToday[0]) next = { title: `Due today: ${dueToday[0].a.title}`, detail: `Due ${dt(dueToday[0].a.dueAt)}.`, href: `/portal/student/assignments/${dueToday[0].a.id}`, cta: "Work on it" };
  else if (openTests[0]) next = { title: `Test open: ${openTests[0].title}`, detail: `Closes ${dt(openTests[0].closesAt)} · ${openTests[0].durationMinutes} minutes once started.`, href: `/portal/student/tests/${openTests[0].id}`, cta: "View test" };
  else if (overdue[0]) next = { title: `Overdue: ${overdue[0].a.title}`, detail: "Late submissions are still accepted for this one.", href: `/portal/student/assignments/${overdue[0].a.id}`, cta: "Submit late" };
  else if (nextClass && nextClass.startsAt.getTime() - now.getTime() < 3 * 3600_000) next = { title: `Live class: ${nextClass.topic}`, detail: `${dt(nextClass.startsAt)} with ${nextClass.instructor.name}.`, href: "/portal/student/learning", cta: "Class details" };

  return (
    <>
      <PageHead eyebrow="Dashboard" title={`Hi, ${me.name.split(" ")[0]}`} description="Your next steps, deadlines and recent feedback." />
      <div className="stack">
        {batchIds.length === 0 && <Alert tone="info">You are not enrolled in an active batch right now. Contact your trainer if this is unexpected.</Alert>}
        {next ? (
          <div className="card" style={{ padding: 22, background: "var(--navy)", color: "#fff", borderColor: "var(--navy)" }}>
            <div className="row row--between">
              <div>
                <span className="eyebrow" style={{ color: "var(--teal)" }}>
                  Next step
                </span>
                <h2 style={{ fontSize: "1.3rem" }}>{next.title}</h2>
                <p style={{ color: "var(--slate-light)", marginTop: 6 }}>{next.detail}</p>
              </div>
              <Link className="btn btn--primary btn--lg" href={next.href}>
                {next.cta} <Icon name="arrowRight" />
              </Link>
            </div>
          </div>
        ) : (
          <Alert tone="ok">You&apos;re all caught up. Nothing is due right now.</Alert>
        )}

        <div className="stats">
          <Stat label="Due today" value={dueToday.length} href="/portal/student/assignments?view=today" />
          <Stat label="Overdue" value={overdue.length + missedClosed} hint={missedClosed ? `${missedClosed} closed to late work` : "Late work accepted"} href="/portal/student/assignments?view=overdue" alert={overdue.length + missedClosed > 0} />
          <Stat label="Tests open" value={openTests.length} hint={`${upcomingTests.length} upcoming`} href="/portal/student/tests" />
          <Stat label="On-time rate" value={pct(aMetrics.summary.onTimeRate)} hint={`${aMetrics.summary.onTime} of ${aMetrics.summary.due} due`} href="/portal/student/performance" />
        </div>

        <div className="grid grid--2">
          <Card title="Coming up" flush actions={<Link className="btn btn--ghost btn--sm" href="/portal/student/assignments">All assignments</Link>}>
            {dueToday.length + upcomingWork.length + upcomingTests.length + overdue.length === 0 ? (
              <Empty icon="calendar" title="Nothing scheduled" />
            ) : (
              <ul className="list">
                {[...overdue, ...dueToday, ...upcomingWork].map(({ a, status }) => (
                  <li key={a.id}>
                    <Icon name="clipboard" />
                    <div className="list__main">
                      <Link href={`/portal/student/assignments/${a.id}`}>{a.title}</Link>
                      <span className="list__meta">
                        Due {dt(a.dueAt)} · {rel(a.dueAt)}
                      </span>
                    </div>
                    <Badge tone={status === "OVERDUE" ? "bad" : status === "IN_PROGRESS" ? "info" : "muted"}>{STUDENT_STATUS_LABEL[status]}</Badge>
                  </li>
                ))}
                {upcomingTests.map((t) => (
                  <li key={t.id}>
                    <Icon name="test" />
                    <div className="list__main">
                      <Link href={`/portal/student/tests/${t.id}`}>{t.title}</Link>
                      <span className="list__meta">Opens {dt(t.opensAt)}</span>
                    </div>
                    <Badge tone="info">{t.kind === "WEEKLY" ? "Weekly exam" : "Practice"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div className="stack">
            <Card title="Next live class" actions={<Link className="btn btn--ghost btn--sm" href="/portal/student/learning">Schedule</Link>}>
              {nextClass ? (
                <div className="stack stack--sm">
                  <strong>{nextClass.topic}</strong>
                  <span className="small muted">
                    {dt(nextClass.startsAt)} · {nextClass.durationMinutes} min · {nextClass.instructor.name}
                  </span>
                  <div>
                    <a className="btn btn--primary btn--sm" href={nextClass.meetingUrl} target="_blank" rel="noopener noreferrer">
                      <Icon name="video" /> Join class
                    </a>
                  </div>
                </div>
              ) : (
                <Empty icon="video" title="No class scheduled yet" />
              )}
            </Card>
            <Card title="Progress">
              <div className="stack stack--sm">
                <div>
                  <div className="row row--between small">
                    <span>Assignments submitted on time</span>
                    <strong>{pct(aMetrics.summary.onTimeRate)}</strong>
                  </div>
                  <Meter value={aMetrics.summary.onTimeRate} label="On-time assignments" />
                  <span className="small muted">
                    {aMetrics.summary.onTime} of {aMetrics.summary.due} due assignments
                  </span>
                </div>
                <div>
                  <div className="row row--between small">
                    <span>Average released test score</span>
                    <strong>{pct(tMetrics.summary.averagePercent)}</strong>
                  </div>
                  <Meter value={tMetrics.summary.averagePercent} label="Average test score" />
                  <span className="small muted">{tMetrics.summary.gradedCount} graded results released</span>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <div className="grid grid--2">
          <Card title="Recent feedback" flush>
            {feedback.length === 0 ? (
              <Empty icon="info" title="No feedback yet" />
            ) : (
              <ul className="list">
                {feedback.map((s) => (
                  <li key={s.id}>
                    <div className="list__main">
                      <Link href={`/portal/student/assignments/${s.assignment.id}`}>{s.assignment.title}</Link>
                      <span className="list__meta">{rel(s.reviewedAt)}</span>
                    </div>
                    {s.status === "REVIEWED" ? <Badge tone="ok">{s.marks} / {s.assignment.maxMarks}</Badge> : <Badge tone="warn">Changes requested</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Doubt replies and announcements" flush>
            {doubtReplies.length + announcements.length === 0 ? (
              <Empty icon="question" title="Nothing new" />
            ) : (
              <ul className="list">
                {doubtReplies.map((n) => (
                  <li key={n.id}>
                    <Icon name="question" />
                    <div className="list__main">
                      {n.link ? <Link href={n.link}>{n.title}</Link> : n.title}
                      <span className="list__meta">{rel(n.createdAt)}</span>
                    </div>
                    <Badge tone="teal">New</Badge>
                  </li>
                ))}
                {announcements.map((a) => (
                  <li key={a.id}>
                    <Icon name="megaphone" />
                    <div className="list__main">
                      <Link href={`/portal/student/notifications#announcement-${a.id}`}>{a.title}</Link>
                      <span className="list__meta">{rel(a.publishedAt)}</span>
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
