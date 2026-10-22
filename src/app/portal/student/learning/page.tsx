import { Icon } from "@/components/icons";
import { Badge, Card, Empty, Markdown, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dDate, dt } from "@/lib/display";
import { pageStudent } from "@/server/session";

export const metadata = { title: "My Learning" };

const ATT = { PRESENT: ["Present", "ok"], LATE: ["Late", "warn"], ABSENT: ["Absent", "bad"], EXCUSED: ["Excused", "muted"] } as const;

export default async function LearningPage() {
  const me = await pageStudent("/portal/student/learning");
  const now = new Date();
  const enrolments = await prisma.enrolment.findMany({
    where: { studentId: me.id },
    include: { batch: { select: { id: true, name: true, code: true, description: true, archivedAt: true } } },
    orderBy: { startDate: "desc" },
  });
  const active = enrolments.filter((e) => e.status === "ACTIVE" && !e.batch.archivedAt);
  const batchIds = active.map((e) => e.batch.id);
  const [upcoming, past] = await Promise.all([
    prisma.classSession.findMany({
      where: { batchId: { in: batchIds }, startsAt: { gte: new Date(now.getTime() - 3 * 3600_000) } },
      orderBy: { startsAt: "asc" },
      take: 20,
      include: { instructor: { select: { name: true } }, batch: { select: { code: true } } },
    }),
    prisma.classSession.findMany({
      where: { batchId: { in: enrolments.map((e) => e.batch.id) }, startsAt: { lt: new Date(now.getTime() - 3 * 3600_000) }, cancelledAt: null },
      orderBy: { startsAt: "desc" },
      take: 30,
      include: { instructor: { select: { name: true } }, attendance: { where: { studentId: me.id } } },
    }),
  ]);

  return (
    <>
      <PageHead title="My Learning" description="Your batch, live class schedule and class resources." />
      <div className="stack">
        <div className="grid grid--3">
          {active.length === 0 ? (
            <Card title="No active batch">
              <p className="muted">You are not currently enrolled in an active batch.</p>
            </Card>
          ) : (
            active.map((e) => (
              <Card key={e.id} title={e.batch.name}>
                <p className="small muted">
                  {e.batch.code} · enrolled {dDate(e.startDate)}
                </p>
                {e.batch.description && <p style={{ marginTop: 8 }}>{e.batch.description}</p>}
              </Card>
            ))
          )}
        </div>

        <Card title="Upcoming live classes" description="Attendance is recorded by your trainer during or after class." flush>
          {upcoming.length === 0 ? (
            <Empty icon="video" title="No classes scheduled yet" />
          ) : (
            <ul className="list">
              {upcoming.map((c) => {
                const end = new Date(c.startsAt.getTime() + c.durationMinutes * 60_000);
                const live = !c.cancelledAt && c.startsAt.getTime() - now.getTime() < 15 * 60_000 && now < end;
                return (
                  <li key={c.id} style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div className="list__main">
                      <span className="list__title">{c.topic}</span>
                      <span className="list__meta">
                        {dt(c.startsAt)} · {c.durationMinutes} min · {c.instructor.name} · {c.batch.code}
                      </span>
                      {c.resources && (
                        <details style={{ marginTop: 8 }}>
                          <summary className="link-button" style={{ cursor: "pointer" }}>
                            Resources
                          </summary>
                          <Markdown>{c.resources}</Markdown>
                        </details>
                      )}
                    </div>
                    {c.cancelledAt ? (
                      <Badge tone="bad">Cancelled</Badge>
                    ) : (
                      <a className={`btn ${live ? "btn--primary" : "btn--secondary"} btn--sm`} href={c.meetingUrl} target="_blank" rel="noopener noreferrer">
                        <Icon name="video" /> {live ? "Join class now" : "Join class"}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Past classes" flush>
          {past.length === 0 ? (
            <Empty icon="calendar" title="No past classes yet" />
          ) : (
            <ul className="list">
              {past.map((c) => {
                const a = c.attendance[0];
                return (
                  <li key={c.id} style={{ alignItems: "flex-start" }}>
                    <div className="list__main">
                      <span className="list__title">{c.topic}</span>
                      <span className="list__meta">
                        {dt(c.startsAt)} · {c.instructor.name}
                      </span>
                      {c.resources && (
                        <details style={{ marginTop: 8 }}>
                          <summary className="link-button" style={{ cursor: "pointer" }}>
                            Resources
                          </summary>
                          <Markdown>{c.resources}</Markdown>
                        </details>
                      )}
                    </div>
                    {a ? <Badge tone={ATT[a.status][1]}>{ATT[a.status][0]}</Badge> : <Badge>Attendance not recorded</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
