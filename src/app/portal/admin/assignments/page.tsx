import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { Badge, Card, Empty, PageHead, Pager, Tabs } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt } from "@/lib/display";
import { pageAdmin } from "@/server/session";
import { targetSummary } from "../targets";

export const metadata = { title: "Assignments" };
const PAGE_SIZE = 25;

const VIEWS = [
  { key: "all", label: "All" },
  { key: "drafts", label: "Drafts" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
  { key: "due", label: "Due in 7 days" },
  { key: "review", label: "To review" },
  { key: "cancelled", label: "Cancelled" },
];

export default async function AssignmentsPage(props: PageProps<"/portal/admin/assignments">) {
  await pageAdmin("/portal/admin/assignments");
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const view = VIEWS.some((v) => v.key === one(sp.view)) ? one(sp.view) : "all";
  const q = one(sp.q).trim();
  const batch = one(sp.batch);
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const now = new Date();

  const where: Prisma.AssignmentWhereInput = { archivedAt: null };
  if (view === "drafts") where.status = "DRAFT";
  if (view === "scheduled") Object.assign(where, { status: "PUBLISHED", publishAt: { gt: now } });
  if (view === "published") Object.assign(where, { status: "PUBLISHED", publishAt: { lte: now } });
  if (view === "due") Object.assign(where, { status: "PUBLISHED", dueAt: { gte: now, lte: new Date(now.getTime() + 7 * 86_400_000) } });
  if (view === "review") where.submissions = { some: { status: "SUBMITTED" } };
  if (view === "cancelled") where.status = "CANCELLED";
  if (view !== "cancelled" && view !== "all" && !where.status) where.status = { not: "CANCELLED" };
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { topic: { contains: q, mode: "insensitive" } }];
  if (batch) where.targets = { some: { batchId: batch } };

  const [total, rows, batches] = await Promise.all([
    prisma.assignment.count({ where }),
    prisma.assignment.findMany({
      where,
      orderBy: [{ dueAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        targets: { include: { batch: { select: { code: true } }, student: { select: { name: true } } } },
        _count: { select: { submissions: { where: { status: { not: "DRAFT" } } } } },
        submissions: { where: { status: "SUBMITTED" }, select: { id: true } },
      },
    }),
    prisma.batch.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, code: true } }),
  ]);

  const href = (params: Record<string, string>) => {
    const u = new URLSearchParams({ view, ...(q ? { q } : {}), ...(batch ? { batch } : {}), ...params });
    return `/portal/admin/assignments?${u}`;
  };

  return (
    <>
      <PageHead
        title="Assignments"
        description="Daily practice work. Publish immediately or schedule it; students see it without any redeploy."
        actions={
          <Link className="btn btn--primary" href="/portal/admin/assignments/new">
            New assignment
          </Link>
        }
      />
      <Tabs items={VIEWS.map((v) => ({ key: v.key, label: v.label, href: href({ view: v.key, page: "1" }) }))} current={view} />
      <Card flush>
        <form className="toolbar" method="get" role="search">
          <input type="hidden" name="view" value={view} />
          <div className="field toolbar__search">
            <label htmlFor="q">Search</label>
            <input id="q" name="q" type="search" defaultValue={q} placeholder="Title or topic" />
          </div>
          <div className="field">
            <label htmlFor="batch">Batch</label>
            <select id="batch" name="batch" defaultValue={batch}>
              <option value="">All batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn--secondary">Apply</button>
        </form>
        {rows.length === 0 ? (
          <Empty icon="clipboard" title="No assignments here" action={<Link className="btn btn--secondary btn--sm" href="/portal/admin/assignments/new">Create an assignment</Link>}>
            {view === "review" ? "Nothing is waiting for review." : "Assignments matching this view will appear here."}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Assignment</th>
                  <th scope="col">Assigned to</th>
                  <th scope="col">Status</th>
                  <th scope="col">Due</th>
                  <th scope="col" className="num">Submitted</th>
                  <th scope="col" className="num">To review</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const scheduled = a.status === "PUBLISHED" && a.publishAt && a.publishAt > now;
                  return (
                    <tr key={a.id}>
                      <td>
                        <Link href={`/portal/admin/assignments/${a.id}`}>{a.title}</Link>
                        <div className="small muted">{a.topic}</div>
                      </td>
                      <td className="small">{targetSummary(a.targets)}</td>
                      <td>
                        {a.status === "DRAFT" ? (
                          <Badge>Draft</Badge>
                        ) : a.status === "CANCELLED" ? (
                          <Badge tone="bad">Cancelled</Badge>
                        ) : scheduled ? (
                          <Badge tone="info">Scheduled {dt(a.publishAt)}</Badge>
                        ) : (
                          <Badge tone="ok">Published</Badge>
                        )}
                      </td>
                      <td className="nowrap">
                        {dt(a.dueAt)} {a.dueAt < now && a.status === "PUBLISHED" && <Badge plain>Past due</Badge>}
                      </td>
                      <td className="num">{a._count.submissions}</td>
                      <td className="num">{a.submissions.length ? <Badge tone="info">{a.submissions.length}</Badge> : 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => href({ page: String(p) })} />
      </Card>
    </>
  );
}
