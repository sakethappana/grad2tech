import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/forms";
import { Icon } from "@/components/icons";
import { Alert, Badge, Card, Empty, Markdown, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt } from "@/lib/display";
import { pageAdmin } from "@/server/session";
import { attendanceAction, cancelClassAction } from "../actions";
import { ClassForm } from "../class-form";

export default async function ClassDetail(props: PageProps<"/portal/admin/classes/[id]">) {
  const { id } = await props.params;
  await pageAdmin(`/portal/admin/classes/${id}`);
  const c = await prisma.classSession.findUnique({
    where: { id },
    include: { batch: true, instructor: { select: { name: true } }, attendance: true },
  });
  if (!c) notFound();
  const now = new Date();
  const end = new Date(c.startsAt.getTime() + c.durationMinutes * 60_000);
  const roster = await prisma.enrolment.findMany({
    where: { batchId: c.batchId, startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: c.startsAt } }] },
    include: { student: { select: { id: true, name: true, email: true } } },
    orderBy: { student: { name: "asc" } },
  });
  const students = [...new Map(roster.map((r) => [r.student.id, r.student])).values()];
  const att = new Map(c.attendance.map((a) => [a.studentId, a.status]));
  const [batches, instructors] = await Promise.all([
    prisma.batch.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    prisma.user.findMany({ where: { role: "ADMIN", suspendedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHead
        eyebrow={`${c.batch.name} · ${c.instructor.name}`}
        title={c.topic}
        description={
          <>
            {dt(c.startsAt)} · {c.durationMinutes} minutes {c.cancelledAt && <Badge tone="bad">Cancelled</Badge>}
          </>
        }
        actions={
          <>
            <a className="btn btn--secondary" href={c.meetingUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="externalLink" /> Open meeting link
            </a>
            {!c.cancelledAt && c.startsAt > now && <ConfirmAction action={cancelClassAction} fields={{ id: c.id }} label="Cancel class" confirmLabel="Cancel class" variant="danger" />}
          </>
        }
      />
      <div className="grid grid--main-side">
        <div className="stack">
          <Card title="Attendance" description="Recorded by trainers. A student opening the meeting link does not count as attendance.">
            {c.cancelledAt ? (
              <Alert tone="info">Attendance is not recorded for cancelled classes.</Alert>
            ) : c.startsAt > now ? (
              <Alert tone="info">You can record attendance once the class has started.</Alert>
            ) : students.length === 0 ? (
              <Empty icon="users" title="No students were enrolled at the time of this class" />
            ) : (
              <ActionForm action={attendanceAction}>
                <input type="hidden" name="sessionId" value={c.id} />
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Student</th>
                        {["Present", "Late", "Absent", "Excused"].map((h) => (
                          <th scope="col" key={h} style={{ textAlign: "center" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s) => (
                        <tr key={s.id}>
                          <td>
                            {s.name}
                            <div className="small muted">{s.email}</div>
                          </td>
                          {(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const).map((st) => (
                            <td key={st} style={{ textAlign: "center" }}>
                              <input type="radio" name={`att_${s.id}`} value={st} defaultChecked={att.get(s.id) === st} aria-label={`${s.name}: ${st.toLowerCase()}`} style={{ width: 18, height: 18, accentColor: "var(--teal-ink)" }} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <SubmitButton>Save attendance</SubmitButton>
              </ActionForm>
            )}
          </Card>
          {c.resources && (
            <Card title="Resources">
              <Markdown>{c.resources}</Markdown>
            </Card>
          )}
        </div>
        <Card title="Edit class">
          {c.cancelledAt ? (
            <Alert tone="info">Cancelled classes can't be edited.</Alert>
          ) : (
            <ClassForm session={c} batches={batches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }))} instructors={instructors.map((i) => ({ value: i.id, label: i.name }))} />
          )}
          <p className="small" style={{ marginTop: 12 }}>
            <Link href="/portal/admin/classes">← All classes</Link>
          </p>
        </Card>
      </div>
    </>
  );
}
