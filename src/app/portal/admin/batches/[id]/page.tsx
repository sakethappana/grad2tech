import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmAction, SubmitButton, TextArea, TextField } from "@/components/forms";
import { Badge, Card, Empty, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dDate, dt } from "@/lib/display";
import { utcToZonedLocal } from "@/lib/time";
import { DISPLAY_TZ } from "@/lib/display";
import { pageAdmin } from "@/server/session";
import { archiveBatchAction, updateBatchAction } from "../../people-actions";

export default async function BatchDetail(props: PageProps<"/portal/admin/batches/[id]">) {
  const { id } = await props.params;
  await pageAdmin(`/portal/admin/batches/${id}`);
  const batch = await prisma.batch.findUnique({
    where: { id },
    include: {
      enrolments: { include: { student: { select: { id: true, name: true, email: true, suspendedAt: true } } }, orderBy: [{ status: "asc" }, { startDate: "desc" }] },
      classes: { where: { startsAt: { gte: new Date() }, cancelledAt: null }, orderBy: { startsAt: "asc" }, take: 5 },
    },
  });
  if (!batch) notFound();
  const active = batch.enrolments.filter((e) => e.status === "ACTIVE");
  const past = batch.enrolments.filter((e) => e.status !== "ACTIVE");

  return (
    <>
      <PageHead
        eyebrow={batch.code}
        title={batch.name}
        description={batch.description ?? undefined}
        actions={
          <>
            <Link className="btn btn--primary" href={`/portal/admin/students?invite=1&batch=${batch.id}`}>
              Invite students
            </Link>
            <ConfirmAction
              action={archiveBatchAction}
              fields={{ id: batch.id, archive: batch.archivedAt ? "0" : "1" }}
              label={batch.archivedAt ? "Restore batch" : "Archive batch"}
              confirmLabel={batch.archivedAt ? "Restore" : "Archive"}
              description={batch.archivedAt ? undefined : "Records are kept."}
            />
          </>
        }
      />
      {batch.archivedAt && (
        <p style={{ marginBottom: 16 }}>
          <Badge tone="warn">Archived {dDate(batch.archivedAt)}</Badge>
        </p>
      )}
      <div className="grid grid--main-side">
        <div className="stack">
          <Card title={`Active students (${active.length})`} flush>
            {active.length === 0 ? (
              <Empty icon="users" title="No active students">Invite students or enrol existing ones from their profile.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Student</th>
                      <th scope="col">Enrolled</th>
                      <th scope="col">Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <Link href={`/portal/admin/students/${e.student.id}`}>{e.student.name}</Link>
                          <div className="small muted">{e.student.email}</div>
                        </td>
                        <td>{dDate(e.startDate)}</td>
                        <td>{e.student.suspendedAt ? <Badge tone="bad">Suspended</Badge> : <Badge tone="ok">Active</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          {past.length > 0 && (
            <Card title="Previous enrolments" description="Students who moved or left. Their records stay linked to this batch." flush>
              <ul className="list">
                {past.map((e) => (
                  <li key={e.id}>
                    <div className="list__main">
                      <Link href={`/portal/admin/students/${e.student.id}`}>{e.student.name}</Link>
                      <span className="list__meta">
                        {dDate(e.startDate)} – {dDate(e.endDate)} · {e.endReason ?? "Ended"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="stack">
          <Card title="Upcoming classes" flush actions={<Link className="btn btn--ghost btn--sm" href={`/portal/admin/classes?batch=${batch.id}`}>All classes</Link>}>
            {batch.classes.length === 0 ? (
              <Empty icon="video" title="Nothing scheduled" />
            ) : (
              <ul className="list">
                {batch.classes.map((c) => (
                  <li key={c.id}>
                    <div className="list__main">
                      <Link href={`/portal/admin/classes/${c.id}`}>{c.topic}</Link>
                      <span className="list__meta">{dt(c.startsAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Batch details">
            <ActionForm action={updateBatchAction}>
              <input type="hidden" name="id" value={batch.id} />
              <TextField name="name" label="Name" defaultValue={batch.name} required />
              <TextField name="code" label="Code" defaultValue={batch.code} required />
              <TextField name="startDate" label="Start date" type="date" defaultValue={batch.startDate ? utcToZonedLocal(batch.startDate, DISPLAY_TZ).slice(0, 10) : ""} />
              <TextArea name="description" label="Description" rows={3} defaultValue={batch.description} />
              <SubmitButton>Save changes</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
