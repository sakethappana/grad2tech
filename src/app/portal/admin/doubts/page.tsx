import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { Badge, Card, Empty, PageHead, Pager } from "@/components/ui";
import { prisma } from "@/lib/db";
import { rel } from "@/lib/display";
import { DOUBT_STATUS_LABEL } from "@/server/doubts";
import { pageAdmin } from "@/server/session";

export const metadata = { title: "Doubts" };
const PAGE_SIZE = 30;

export default async function AdminDoubts(props: PageProps<"/portal/admin/doubts">) {
  const admin = await pageAdmin("/portal/admin/doubts");
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const status = one(sp.status) || "open";
  const batch = one(sp.batch);
  const topic = one(sp.topic).trim();
  const q = one(sp.q).trim();
  const assignee = one(sp.assignee);
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const where: Prisma.DoubtThreadWhereInput = {};
  if (status === "open") where.status = { not: "RESOLVED" };
  if (status === "unanswered") Object.assign(where, { status: { not: "RESOLVED" }, firstResponseAt: null });
  if (status === "in_progress") where.status = "IN_PROGRESS";
  if (status === "resolved") where.status = "RESOLVED";
  if (batch) where.batchId = batch;
  if (topic) where.topic = { contains: topic, mode: "insensitive" };
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { student: { name: { contains: q, mode: "insensitive" } } }];
  if (assignee === "me") where.assignedToId = admin.id;
  if (assignee === "none") where.assignedToId = null;

  const [total, threads, batches] = await Promise.all([
    prisma.doubtThread.count({ where }),
    prisma.doubtThread.findMany({
      where,
      orderBy: [{ firstResponseAt: { sort: "asc", nulls: "first" } }, { lastActivityAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        student: { select: { name: true } },
        batch: { select: { code: true } },
        assignedTo: { select: { name: true } },
        assignment: { select: { title: true } },
        assessment: { select: { title: true } },
        projectBrief: { select: { title: true } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.batch.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, code: true } }),
  ]);
  const href = (p: number) => {
    const u = new URLSearchParams({ status, ...(batch ? { batch } : {}), ...(topic ? { topic } : {}), ...(q ? { q } : {}), ...(assignee ? { assignee } : {}), page: String(p) });
    return `/portal/admin/doubts?${u}`;
  };

  return (
    <>
      <PageHead title="Doubts" description="Private by default between the student and trainers. Unanswered doubts are listed first." />
      <Card flush>
        <form className="toolbar" method="get" role="search">
          <div className="field toolbar__search">
            <label htmlFor="q">Search</label>
            <input id="q" name="q" type="search" defaultValue={q} placeholder="Title or student" />
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={status}>
              <option value="open">Open + in progress</option>
              <option value="unanswered">Unanswered</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="all">All</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="batch">Batch</label>
            <select id="batch" name="batch" defaultValue={batch}>
              <option value="">All</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="topic">Topic</label>
            <input id="topic" name="topic" defaultValue={topic} placeholder="Any" />
          </div>
          <div className="field">
            <label htmlFor="assignee">Assigned</label>
            <select id="assignee" name="assignee" defaultValue={assignee}>
              <option value="">Anyone</option>
              <option value="me">To me</option>
              <option value="none">Unassigned</option>
            </select>
          </div>
          <button className="btn btn--secondary">Apply</button>
        </form>
        {threads.length === 0 ? (
          <Empty icon="question" title="No doubts match" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Doubt</th>
                  <th scope="col">Student</th>
                  <th scope="col">Linked to</th>
                  <th scope="col">Status</th>
                  <th scope="col">Assigned</th>
                  <th scope="col">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {threads.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link href={`/portal/admin/doubts/${t.id}`}>{t.title}</Link>
                      <div className="small muted">
                        {t.topic} · {t._count.messages} messages {t.visibility === "BATCH" && <Badge plain tone="info">Shared with batch</Badge>}
                      </div>
                    </td>
                    <td>
                      {t.student.name}
                      <div className="small muted">{t.batch?.code ?? ""}</div>
                    </td>
                    <td className="small">{t.assignment?.title ?? t.assessment?.title ?? t.projectBrief?.title ?? "—"}</td>
                    <td>
                      {!t.firstResponseAt && t.status !== "RESOLVED" ? (
                        <Badge tone="bad">Unanswered</Badge>
                      ) : (
                        <Badge tone={t.status === "RESOLVED" ? "ok" : t.status === "IN_PROGRESS" ? "info" : "warn"}>{DOUBT_STATUS_LABEL[t.status]}</Badge>
                      )}
                    </td>
                    <td className="small">{t.assignedTo?.name ?? "—"}</td>
                    <td className="nowrap small">{rel(t.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageSize={PAGE_SIZE} total={total} hrefFor={href} />
      </Card>
    </>
  );
}
