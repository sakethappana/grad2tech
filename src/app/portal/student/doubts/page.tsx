import Link from "next/link";
import { Badge, Card, Empty, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { rel } from "@/lib/display";
import { activeBatchIds } from "@/server/access";
import { DOUBT_STATUS_LABEL } from "@/server/doubts";
import { pageStudent } from "@/server/session";

export const metadata = { title: "My Doubts" };

export default async function StudentDoubts() {
  const me = await pageStudent("/portal/student/doubts");
  const now = new Date();
  const batchIds = await activeBatchIds(me.id);
  const [mine, shared] = await Promise.all([
    prisma.doubtThread.findMany({
      where: { studentId: me.id },
      orderBy: { lastActivityAt: "desc" },
      include: { _count: { select: { messages: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { author: { select: { role: true } } } } },
    }),
    prisma.doubtThread.findMany({
      where: {
        visibility: "BATCH",
        batchId: { in: batchIds },
        studentId: { not: me.id },
        OR: [{ assessmentId: null }, { assessment: { closesAt: { lte: now } } }],
      },
      orderBy: { lastActivityAt: "desc" },
      take: 30,
      include: { student: { select: { name: true } }, _count: { select: { messages: true } } },
    }),
  ]);
  return (
    <>
      <PageHead
        title="My Doubts"
        description="Ask your trainers when you're stuck. Doubts are private unless you choose to share them with your batch."
        actions={
          <Link className="btn btn--primary" href="/portal/student/doubts/new">
            Ask a doubt
          </Link>
        }
      />
      <div className="stack">
        <Card title="Your doubts" flush>
          {mine.length === 0 ? (
            <Empty icon="question" title="No doubts yet" action={<Link className="btn btn--secondary btn--sm" href="/portal/student/doubts/new">Ask your first doubt</Link>} />
          ) : (
            <ul className="list">
              {mine.map((t) => {
                const trainerReplied = t.messages[0]?.author.role === "ADMIN";
                return (
                  <li key={t.id}>
                    <div className="list__main">
                      <Link href={`/portal/student/doubts/${t.id}`}>{t.title}</Link>
                      <span className="list__meta">
                        {t.topic} · {t._count.messages} messages · {rel(t.lastActivityAt)} {t.visibility === "BATCH" ? "· shared with batch" : "· private"}
                      </span>
                    </div>
                    {trainerReplied && t.status !== "RESOLVED" && <Badge tone="teal">Trainer replied</Badge>}
                    <Badge tone={t.status === "RESOLVED" ? "ok" : t.status === "IN_PROGRESS" ? "info" : "warn"}>{DOUBT_STATUS_LABEL[t.status]}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Shared in your batch" description="Doubts classmates chose to share. Doubts about open tests stay hidden until the test closes." flush>
          {shared.length === 0 ? (
            <Empty icon="users" title="No shared doubts" />
          ) : (
            <ul className="list">
              {shared.map((t) => (
                <li key={t.id}>
                  <div className="list__main">
                    <Link href={`/portal/student/doubts/${t.id}`}>{t.title}</Link>
                    <span className="list__meta">
                      {t.student.name} · {t.topic} · {t._count.messages} messages · {rel(t.lastActivityAt)}
                    </span>
                  </div>
                  <Badge tone={t.status === "RESOLVED" ? "ok" : "warn"}>{DOUBT_STATUS_LABEL[t.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
