import Link from "next/link";
import { Badge, Card, Empty, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt } from "@/lib/display";
import { pageAdmin } from "@/server/session";
import { ClassForm } from "./class-form";

export const metadata = { title: "Live classes" };

export default async function ClassesPage(props: PageProps<"/portal/admin/classes">) {
  const admin = await pageAdmin("/portal/admin/classes");
  const sp = await props.searchParams;
  const batch = typeof sp.batch === "string" ? sp.batch : "";
  const now = new Date();
  const [upcoming, past, batches, instructors] = await Promise.all([
    prisma.classSession.findMany({
      where: { startsAt: { gte: new Date(now.getTime() - 3 * 3600_000) }, ...(batch ? { batchId: batch } : {}) },
      orderBy: { startsAt: "asc" },
      take: 50,
      include: { batch: { select: { code: true } }, instructor: { select: { name: true } } },
    }),
    prisma.classSession.findMany({
      where: { startsAt: { lt: new Date(now.getTime() - 3 * 3600_000) }, ...(batch ? { batchId: batch } : {}) },
      orderBy: { startsAt: "desc" },
      take: 30,
      include: { batch: { select: { code: true } }, instructor: { select: { name: true } }, _count: { select: { attendance: true } } },
    }),
    prisma.batch.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    prisma.user.findMany({ where: { role: "ADMIN", suspendedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHead title="Live classes" description="Schedule classes, share meeting links and record attendance manually after each session." />
      <form className="row" method="get" style={{ marginBottom: 16 }}>
        <label htmlFor="batch" className="small" style={{ fontWeight: 700 }}>
          Batch
        </label>
        <select id="batch" name="batch" defaultValue={batch} style={{ minHeight: 36, borderRadius: 8, border: "1px solid var(--line-strong)", padding: "4px 8px" }}>
          <option value="">All batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code}
            </option>
          ))}
        </select>
        <button className="btn btn--secondary btn--sm">Filter</button>
      </form>
      <div className="grid grid--main-side">
        <div className="stack">
          <Card title="Upcoming and today" flush>
            {upcoming.length === 0 ? (
              <Empty icon="video" title="No upcoming classes" />
            ) : (
              <ul className="list">
                {upcoming.map((c) => (
                  <li key={c.id}>
                    <div className="list__main">
                      <Link href={`/portal/admin/classes/${c.id}`}>{c.topic}</Link>
                      <span className="list__meta">
                        {dt(c.startsAt)} · {c.durationMinutes} min · {c.batch.code} · {c.instructor.name}
                      </span>
                    </div>
                    {c.cancelledAt ? <Badge tone="bad">Cancelled</Badge> : c.startsAt <= now ? <Badge tone="ok">Live / recent</Badge> : <Badge tone="info">Scheduled</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Past classes" description="Record attendance from each class page." flush>
            {past.length === 0 ? (
              <Empty icon="calendar" title="No past classes" />
            ) : (
              <ul className="list">
                {past.map((c) => (
                  <li key={c.id}>
                    <div className="list__main">
                      <Link href={`/portal/admin/classes/${c.id}`}>{c.topic}</Link>
                      <span className="list__meta">
                        {dt(c.startsAt)} · {c.batch.code}
                      </span>
                    </div>
                    {c.cancelledAt ? <Badge tone="bad">Cancelled</Badge> : c._count.attendance > 0 ? <Badge tone="ok">Attendance recorded</Badge> : <Badge tone="warn">Attendance not taken</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card title="Schedule a class">
          <ClassForm
            batches={batches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }))}
            instructors={instructors.map((i) => ({ value: i.id, label: i.name }))}
            defaultBatch={batch || undefined}
            defaultInstructor={admin.id}
          />
        </Card>
      </div>
    </>
  );
}
