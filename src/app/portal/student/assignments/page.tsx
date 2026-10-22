import Link from "next/link";
import { Badge, Card, Empty, PageHead, Tabs, type Tone } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt, rel, DISPLAY_TZ } from "@/lib/display";
import { startOfZonedDay } from "@/lib/time";
import { activeBatchIds, visibleAssignmentWhere } from "@/server/access";
import { studentAssignmentStatus, STUDENT_STATUS_LABEL, type StudentAssignmentStatus } from "@/server/assignments";
import { pageStudent } from "@/server/session";

export const metadata = { title: "Assignments" };

const TONE: Record<StudentAssignmentStatus, Tone> = { NOT_STARTED: "muted", IN_PROGRESS: "info", SUBMITTED: "teal", OVERDUE: "bad", REVIEWED: "ok", RESUBMIT_REQUESTED: "warn" };
const VIEWS = [
  { key: "todo", label: "To do" },
  { key: "today", label: "Due today" },
  { key: "overdue", label: "Overdue" },
  { key: "done", label: "Submitted & reviewed" },
  { key: "all", label: "All" },
];

export default async function StudentAssignments(props: PageProps<"/portal/student/assignments">) {
  const me = await pageStudent("/portal/student/assignments");
  const sp = await props.searchParams;
  const view = VIEWS.some((v) => v.key === sp.view) ? String(sp.view) : "todo";
  const now = new Date();
  const batchIds = await activeBatchIds(me.id);
  const assignments = await prisma.assignment.findMany({
    where: { OR: [visibleAssignmentWhere(me.id, batchIds, now), { status: "PUBLISHED", submissions: { some: { studentId: me.id, status: { not: "DRAFT" } } } }] },
    orderBy: { dueAt: "asc" },
    include: { submissions: { where: { studentId: me.id } } },
  });
  const todayEnd = new Date(startOfZonedDay(now, DISPLAY_TZ).getTime() + 86_400_000);
  const rows = assignments
    .map((a) => ({ a, s: a.submissions[0], status: studentAssignmentStatus(a, a.submissions[0], now) }))
    .filter(({ a, status }) => {
      if (view === "todo") return status === "NOT_STARTED" || status === "IN_PROGRESS" || status === "RESUBMIT_REQUESTED" || (status === "OVERDUE" && a.allowLate);
      if (view === "today") return a.dueAt >= now && a.dueAt < todayEnd && status !== "SUBMITTED" && status !== "REVIEWED";
      if (view === "overdue") return status === "OVERDUE";
      if (view === "done") return status === "SUBMITTED" || status === "REVIEWED";
      return true;
    });
  if (view === "done" || view === "all") rows.reverse();

  return (
    <>
      <PageHead title="Assignments" description="Daily practice from your trainers. Save drafts as you go and submit before the deadline." />
      <Tabs items={VIEWS.map((v) => ({ ...v, href: `/portal/student/assignments?view=${v.key}` }))} current={view} />
      <Card flush>
        {rows.length === 0 ? (
          <Empty icon="clipboard" title={view === "todo" ? "Nothing to do right now" : "Nothing here"}>
            {view === "todo" ? "New assignments appear here as soon as they are published." : undefined}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Assignment</th>
                  <th scope="col">Due</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">Marks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ a, s, status }) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/portal/student/assignments/${a.id}`}>{a.title}</Link>
                      <div className="small muted">
                        {a.topic} · {a.difficulty.toLowerCase()}
                      </div>
                    </td>
                    <td className="nowrap">
                      {dt(a.dueAt)}
                      <div className="small muted">{rel(a.dueAt)}</div>
                    </td>
                    <td>
                      <Badge tone={TONE[status]}>{STUDENT_STATUS_LABEL[status]}</Badge>
                      {status === "OVERDUE" && (a.allowLate ? <div className="small muted">Late work accepted</div> : <div className="small muted">Closed</div>)}
                      {s?.isLate && s.status !== "DRAFT" && <> <Badge tone="warn">Late</Badge></>}
                    </td>
                    <td className="num">{s?.status === "REVIEWED" ? `${s.marks} / ${a.maxMarks}` : "—"}</td>
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
