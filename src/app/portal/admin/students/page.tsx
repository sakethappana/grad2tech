import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { ConfirmAction } from "@/components/forms";
import { Badge, Card, Empty, PageHead, Pager } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dDate, rel } from "@/lib/display";
import { pageAdmin } from "@/server/session";
import { revokeInviteAction } from "../people-actions";
import { InviteForm } from "./invite-form";

export const metadata = { title: "Students" };
const PAGE_SIZE = 25;

export default async function StudentsPage(props: PageProps<"/portal/admin/students">) {
  await pageAdmin("/portal/admin/students");
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = one(sp.q).trim();
  const batch = one(sp.batch);
  const status = one(sp.status) || "all";
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const where: Prisma.UserWhereInput = { role: "STUDENT" };
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }];
  if (batch) where.enrolments = { some: { batchId: batch, status: "ACTIVE" } };
  if (status === "active") Object.assign(where, { suspendedAt: null, enrolments: { some: { status: "ACTIVE", ...(batch ? { batchId: batch } : {}) } } });
  if (status === "suspended") where.suspendedAt = { not: null };
  if (status === "unassigned") where.enrolments = { none: { status: "ACTIVE" } };

  const [total, students, batches, invites] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        suspendedAt: true,
        createdAt: true,
        enrolments: { where: { status: "ACTIVE" }, select: { batch: { select: { id: true, code: true } } } },
        sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
      },
    }),
    prisma.batch.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    prisma.invitation.findMany({
      where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      include: { batch: { select: { code: true } } },
    }),
  ]);
  const batchOptions = batches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }));
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (batch) u.set("batch", batch);
    if (status !== "all") u.set("status", status);
    u.set("page", String(p));
    return `/portal/admin/students?${u}`;
  };

  return (
    <>
      <PageHead title="Students" description="Students get portal access only through an invitation after admission. Suspending access keeps their academic history." />
      <div className="grid grid--main-side">
        <Card flush>
          <form className="toolbar" role="search" method="get">
            <div className="field toolbar__search">
              <label htmlFor="q">Search</label>
              <input id="q" name="q" type="search" defaultValue={q} placeholder="Name or email" />
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
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={status}>
                <option value="all">All</option>
                <option value="active">Active (enrolled)</option>
                <option value="unassigned">No active batch</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <button className="btn btn--secondary">Apply</button>
          </form>
          {students.length === 0 ? (
            <Empty icon="users" title="No students match">
              {q || batch || status !== "all" ? "Try clearing the filters." : "Invite your first student with the form on the right."}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    <th scope="col">Batches</th>
                    <th scope="col">Last active</th>
                    <th scope="col">Access</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/portal/admin/students/${s.id}`}>{s.name}</Link>
                        <div className="small muted">{s.email}</div>
                      </td>
                      <td>{s.enrolments.length ? s.enrolments.map((e) => <Badge key={e.batch.id} plain>{e.batch.code}</Badge>) : <span className="muted">—</span>}</td>
                      <td className="nowrap">{s.sessions[0] ? rel(s.sessions[0].updatedAt) : <span className="muted">Never signed in</span>}</td>
                      <td>{s.suspendedAt ? <Badge tone="bad">Suspended</Badge> : <Badge tone="ok">Active</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} pageSize={PAGE_SIZE} total={total} hrefFor={qs} />
        </Card>

        <div className="stack">
          <Card title="Invite a student or trainer" description="Creates a one-time link to set a password.">
            {batchOptions.length === 0 ? (
              <Empty icon="layers" title="Create a batch first" action={<Link className="btn btn--secondary btn--sm" href="/portal/admin/batches">Go to batches</Link>} />
            ) : (
              <InviteForm batches={batchOptions} defaultBatch={one(sp.batch) || undefined} />
            )}
          </Card>
          <Card title={`Pending invitations (${invites.length})`} flush>
            {invites.length === 0 ? (
              <Empty icon="mail" title="No pending invitations" />
            ) : (
              <ul className="list">
                {invites.map((i) => (
                  <li key={i.id} style={{ flexWrap: "wrap" }}>
                    <div className="list__main">
                      <span className="list__title">{i.name}</span>
                      <span className="list__meta">
                        {i.email} · {i.role === "ADMIN" ? "Trainer" : (i.batch?.code ?? "Student")} · expires {dDate(i.expiresAt)}
                      </span>
                    </div>
                    <ConfirmAction action={revokeInviteAction} fields={{ id: i.id }} label="Revoke" confirmLabel="Revoke" variant="danger" />
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
