import Link from "next/link";
import { dDate, dt, marks, pct } from "@/lib/display";
import type { studentReport } from "@/server/reports";
import { ScoreTrend, TopicBars } from "./charts";
import { Badge, Card, Empty, Markdown, Stat, type Tone } from "./ui";

type Report = Awaited<ReturnType<typeof studentReport>>;

const STATE: Record<string, { label: string; tone: Tone }> = {
  ON_TIME: { label: "On time", tone: "ok" },
  LATE: { label: "Late", tone: "warn" },
  MISSING: { label: "Missing", tone: "bad" },
  UPCOMING: { label: "Not due yet", tone: "muted" },
};
const REVIEW: Record<string, { label: string; tone: Tone }> = {
  REVIEWED: { label: "Reviewed", tone: "ok" },
  AWAITING_REVIEW: { label: "Awaiting review", tone: "info" },
  RESUBMIT_REQUESTED: { label: "Resubmission requested", tone: "warn" },
};
const TEST: Record<string, { label: string; tone: Tone }> = {
  AWAITING_GRADING: { label: "Awaiting grading", tone: "info" },
  PARTIALLY_GRADED: { label: "Partially graded", tone: "info" },
  EXECUTION_ERROR: { label: "Runner error — not marked wrong", tone: "warn" },
  NOT_RELEASED: { label: "Graded · results not released", tone: "muted" },
  PASSED: { label: "Passed", tone: "ok" },
  FAILED: { label: "Below pass mark", tone: "bad" },
  GRADED: { label: "Graded", tone: "ok" },
};
const ATT: Record<string, { label: string; tone: Tone }> = {
  PRESENT: { label: "Present", tone: "ok" },
  LATE: { label: "Late", tone: "warn" },
  ABSENT: { label: "Absent", tone: "bad" },
  EXCUSED: { label: "Excused", tone: "muted" },
  NOT_RECORDED: { label: "Not recorded", tone: "muted" },
};

export function PerformanceReport({ report, viewer }: { report: Report; viewer: "admin" | "student" }) {
  const a = report.assignments.summary;
  const t = report.tests.summary;
  const att = report.attendance;
  const testHref = (r: Report["tests"]["rows"][number]) =>
    viewer === "admin" ? `/portal/admin/tests/${r.assessmentId}/attempts/${r.attemptId}` : `/portal/student/tests/${r.assessmentId}/attempts/${r.attemptId}`;
  const assignmentHref = (id: string) => (viewer === "admin" ? `/portal/admin/assignments/${id}` : `/portal/student/assignments/${id}`);

  return (
    <div className="stack">
      <div className="stats">
        <Stat label="On-time assignments" value={pct(a.onTimeRate)} hint={`${a.onTime} of ${a.due} due assignments`} />
        <Stat label="Missing assignments" value={a.missing} hint={`of ${a.due} due · ${a.late} submitted late`} alert={a.missing > 0} />
        <Stat label="Average test score" value={pct(t.averagePercent)} hint={`${t.gradedCount} graded ${t.gradedCount === 1 ? "attempt" : "attempts"}`} />
        <Stat label="Attendance" value={pct(att.rate)} hint={`${att.counts.PRESENT + att.counts.LATE} of ${att.denominator} recorded sessions`} />
      </div>

      <Card title="Assignments" description="Counts only published, non-cancelled work assigned to this student with a due date in the past. Work not due yet is listed but not counted." flush>
        {report.assignments.rows.length === 0 ? (
          <Empty icon="clipboard" title="No assignments yet" />
        ) : (
          <>
            <div className="row" style={{ padding: "12px 20px", gap: 8 }}>
              <Badge tone="ok">On time {a.onTime}</Badge>
              <Badge tone="warn">Late {a.late}</Badge>
              <Badge tone="bad">Missing {a.missing}</Badge>
              <Badge tone="info">Awaiting review {a.awaitingReview}</Badge>
              <span className="small muted">Reviewed marks: {pct(a.marksPct)} across {a.reviewed} reviewed</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Assignment</th>
                    <th scope="col">Topic</th>
                    <th scope="col">Due</th>
                    <th scope="col">Submission</th>
                    <th scope="col">Review</th>
                    <th scope="col" className="num">Marks</th>
                  </tr>
                </thead>
                <tbody>
                  {report.assignments.rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={assignmentHref(r.id)}>{r.title}</Link>
                      </td>
                      <td>{r.topic}</td>
                      <td className="nowrap">{dt(r.dueAt)}</td>
                      <td>
                        <Badge tone={STATE[r.state].tone}>{STATE[r.state].label}</Badge>
                      </td>
                      <td>{r.reviewState ? <Badge tone={REVIEW[r.reviewState].tone}>{REVIEW[r.reviewState].label}</Badge> : <span className="muted">—</span>}</td>
                      <td className="num">{r.marks !== null ? marks(r.marks, r.maxMarks) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card
        title="Test scores over time"
        description={
          viewer === "student"
            ? "Score as a percentage of maximum marks, for attempts whose results have been released."
            : "Score as a percentage of maximum marks, for fully graded attempts."
        }
      >
        {report.tests.series.length === 0 ? (
          <Empty icon="test" title="No graded results yet" />
        ) : (
          <ScoreTrend data={report.tests.series.map((s) => ({ label: s.label, date: dDate(s.date), percent: s.percent }))} />
        )}
      </Card>

      <Card title="Test attempts" description="Awaiting grading, runner errors and results not yet released are shown separately and never counted as failures." flush>
        {report.tests.rows.length === 0 ? (
          <Empty icon="test" title="No submitted attempts" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Test</th>
                  <th scope="col">Type</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">Score</th>
                  <th scope="col" className="num">%</th>
                </tr>
              </thead>
              <tbody>
                {report.tests.rows.map((r) => (
                  <tr key={r.attemptId}>
                    <td>
                      <Link href={testHref(r)}>{r.title}</Link>
                      {r.number > 1 && <span className="small muted"> · attempt {r.number}</span>}
                    </td>
                    <td>{r.kind === "WEEKLY" ? "Weekly exam" : "Practice"}</td>
                    <td className="nowrap">{dt(r.submittedAt)}</td>
                    <td>
                      <Badge tone={TEST[r.status].tone}>{TEST[r.status].label}</Badge>
                    </td>
                    <td className="num">{r.score !== null ? marks(r.score, r.maxScore) : "—"}</td>
                    <td className="num">{r.percent !== null ? `${r.percent}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid--2">
        <Card title="Topic strengths and weaknesses" description="Marks earned ÷ marks available per topic, from graded test answers and reviewed assignments. Weakest first.">
          {report.topics.length === 0 ? (
            <Empty icon="chart" title="Not enough graded work yet" />
          ) : (
            <div className="stack stack--sm">
              <TopicBars data={report.topics.filter((x) => x.percent !== null).map((x) => ({ topic: x.topic, percent: x.percent as number }))} />
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Topic</th>
                      <th scope="col" className="num">Earned / available</th>
                      <th scope="col" className="num">%</th>
                      <th scope="col" className="num">Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.topics.map((x) => (
                      <tr key={x.topic}>
                        <td>{x.topic}</td>
                        <td className="num">
                          {x.earned} / {x.possible}
                        </td>
                        <td className="num">{pct(x.percent)}</td>
                        <td className="num">{x.items}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
        <div className="stack">
          <Card title="Coding question outcomes" description="Per coding answer in submitted tests." flush>
            <table className="table">
              <tbody>
                <tr><td>All grading cases passed (full marks)</td><td className="num">{report.coding.fullyPassed}</td></tr>
                <tr><td>Some cases passed (partial marks)</td><td className="num">{report.coding.partiallyPassed}</td></tr>
                <tr><td>No marks earned</td><td className="num">{report.coding.notPassed}</td></tr>
                <tr><td>Not answered</td><td className="num">{report.coding.unanswered}</td></tr>
                <tr><td>Awaiting grading</td><td className="num">{report.coding.awaitingGrading}</td></tr>
                <tr><td>Runner error (re-grade pending, not marked wrong)</td><td className="num">{report.coding.executionError}</td></tr>
                {viewer === "student" && <tr><td>Results not released yet</td><td className="num">{report.coding.notReleased}</td></tr>}
              </tbody>
            </table>
          </Card>
          <Card
            title="Attendance"
            description="Recorded manually by trainers. Rate = (present + late) ÷ sessions marked present, late or absent. Excused sessions are excluded."
            flush
          >
            <div className="row" style={{ padding: "12px 20px", gap: 8 }}>
              <Badge tone="ok">Present {att.counts.PRESENT}</Badge>
              <Badge tone="warn">Late {att.counts.LATE}</Badge>
              <Badge tone="bad">Absent {att.counts.ABSENT}</Badge>
              <Badge>Excused {att.counts.EXCUSED}</Badge>
              <Badge>Not recorded {att.counts.NOT_RECORDED}</Badge>
            </div>
            {att.rows.length > 0 && (
              <ul className="list">
                {att.rows.slice(0, 8).map((r) => (
                  <li key={r.id}>
                    <div className="list__main">
                      <span className="list__title">{r.topic}</span>
                      <span className="list__meta">{dt(r.startsAt)}</span>
                    </div>
                    <Badge tone={ATT[r.status].tone}>{ATT[r.status].label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="grid grid--2">
        <Card title="Project reviews" flush>
          {report.projects.length === 0 ? (
            <Empty icon="folder" title="No project submissions" />
          ) : (
            <ul className="list">
              {report.projects.map((p) => (
                <li key={p.id}>
                  <div className="list__main">
                    {viewer === "admin" ? (
                      <Link href={`/portal/admin/projects/submissions/${p.id}`}>{p.brief?.title ?? p.project.name}</Link>
                    ) : (
                      <span className="list__title">{p.brief?.title ?? p.project.name}</span>
                    )}
                    <span className="list__meta">Submitted {dt(p.submittedAt)}</span>
                  </div>
                  <Badge tone={p.status === "REVIEWED" ? "ok" : p.status === "SUBMITTED" ? "info" : "warn"}>
                    {p.status === "REVIEWED" ? (p.marks !== null ? `Reviewed · ${marks(p.marks, p.brief?.maxMarks ?? 100)}` : "Reviewed") : p.status === "SUBMITTED" ? "Awaiting review" : "Changes requested"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Trainer feedback" id="feedback" flush>
          {report.feedback.length === 0 ? (
            <Empty icon="info" title="No trainer feedback yet" />
          ) : (
            <ul className="list">
              {report.feedback.map((f) => (
                <li key={f.id} style={{ alignItems: "flex-start" }}>
                  <div className="list__main">
                    <span className="list__meta" style={{ marginBottom: 6 }}>
                      {f.author.name} · {dt(f.createdAt)}
                    </span>
                    <Markdown>{f.body}</Markdown>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
