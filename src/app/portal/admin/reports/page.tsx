import Link from "next/link";
import { Icon } from "@/components/icons";
import { Badge, Card, Empty, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { pct } from "@/lib/display";
import { studentSummaries } from "@/server/reports";
import { pageAdmin } from "@/server/session";

export const metadata = { title: "Reports" };

export default async function ReportsPage(props: PageProps<"/portal/admin/reports">) {
  await pageAdmin("/portal/admin/reports");
  const sp = await props.searchParams;
  const batches = await prisma.batch.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } });
  const batch = typeof sp.batch === "string" && sp.batch ? sp.batch : (batches[0]?.id ?? "");
  const rows = batch ? await studentSummaries(batch) : [];

  return (
    <>
      <PageHead
        title="Reports"
        description="Calculated from records. Each figure shows its denominator so it can be checked."
        actions={
          batch && (
            <a className="btn btn--secondary" href={`/api/reports/export?batch=${batch}`}>
              <Icon name="download" /> Export CSV
            </a>
          )
        }
      />
      <div className="stack">
        <form className="row" method="get">
          <label htmlFor="batch" className="small" style={{ fontWeight: 700 }}>
            Batch
          </label>
          <select id="batch" name="batch" defaultValue={batch} style={{ minHeight: 36, borderRadius: 8, border: "1px solid var(--line-strong)", padding: "4px 8px" }}>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
          <button className="btn btn--secondary btn--sm">Show</button>
        </form>

        <Card title="Student summary" flush>
          {rows.length === 0 ? (
            <Empty icon="chart" title="No students in this batch yet" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    <th scope="col" className="num">On time</th>
                    <th scope="col" className="num">Late</th>
                    <th scope="col" className="num">Missing</th>
                    <th scope="col" className="num">To review</th>
                    <th scope="col" className="num">Avg test</th>
                    <th scope="col" className="num">Below pass</th>
                    <th scope="col" className="num">Attendance</th>
                    <th scope="col" className="num">Open doubts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.student.id}>
                      <td>
                        <Link href={`/portal/admin/students/${r.student.id}?tab=performance`}>{r.student.name}</Link>
                        {r.student.suspendedAt && <> <Badge tone="bad">Suspended</Badge></>}
                      </td>
                      <td className="num">
                        {r.assignments.onTime}/{r.assignments.due}
                        <div className="small muted">{pct(r.assignments.onTimeRate)}</div>
                      </td>
                      <td className="num">{r.assignments.late}</td>
                      <td className="num">{r.assignments.missing > 0 ? <Badge tone="bad">{r.assignments.missing}</Badge> : 0}</td>
                      <td className="num">{r.assignments.awaitingReview}</td>
                      <td className="num">
                        {pct(r.tests.averagePercent)}
                        <div className="small muted">{r.tests.gradedCount} graded</div>
                      </td>
                      <td className="num">{r.tests.failed}</td>
                      <td className="num">
                        {pct(r.attendance.rate)}
                        <div className="small muted">of {r.attendance.denominator}</div>
                      </td>
                      <td className="num">{r.openDoubts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="How these numbers are calculated">
          <dl className="dl">
            <dt>Due assignments</dt>
            <dd>Published, not cancelled, assigned to the student (directly or through a batch they belonged to at the due date), with a due date in the past. Future deadlines are excluded.</dd>
            <dt>On time / late / missing</dt>
            <dd>On time: first submission at or before the due date. Late: submitted after it. Missing: never submitted. Awaiting review is submitted work not yet marked — not missing, not failed.</dd>
            <dt>Average test</dt>
            <dd>Mean of score ÷ maximum for fully graded attempts. Attempts awaiting grading or affected by code-runner errors are excluded and shown separately.</dd>
            <dt>Below pass</dt>
            <dd>Graded attempts below the test's pass mark, when a pass mark is set.</dd>
            <dt>Attendance</dt>
            <dd>(Present + late) ÷ sessions with attendance recorded as present, late or absent. Excused sessions are excluded. Attendance is recorded manually by trainers.</dd>
            <dt>Placement</dt>
            <dd>Eligibility and refund decisions are recorded by an authorised person on each student's Placement tab. The portal applies no automatic thresholds.</dd>
          </dl>
        </Card>
      </div>
    </>
  );
}
