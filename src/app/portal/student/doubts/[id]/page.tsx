import Link from "next/link";
import { notFound } from "next/navigation";
import { DoubtMessages, messageInclude } from "@/components/doubt-thread";
import { ConfirmAction } from "@/components/forms";
import { ReplyForm } from "@/components/reply-form";
import { Badge, Card, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt } from "@/lib/display";
import { getVisibleDoubt } from "@/server/access";
import { DOUBT_STATUS_LABEL } from "@/server/doubts";
import { isAppError } from "@/server/errors";
import { pageStudent } from "@/server/session";
import { doubtStatusAction } from "../../../doubt-actions";

export default async function StudentDoubt(props: PageProps<"/portal/student/doubts/[id]">) {
  const { id } = await props.params;
  const me = await pageStudent(`/portal/student/doubts/${id}`);
  await getVisibleDoubt(me.id, id).catch((e) => {
    if (isAppError(e) && e.status === 404) notFound();
    throw e;
  });
  const t = await prisma.doubtThread.findUniqueOrThrow({
    where: { id },
    include: {
      student: { select: { name: true } },
      assignment: { select: { id: true, title: true } },
      assessment: { select: { id: true, title: true } },
      projectBrief: { select: { id: true, title: true } },
      messages: messageInclude,
    },
  });
  const own = t.studentId === me.id;
  return (
    <>
      <PageHead
        eyebrow={`Doubt · ${t.topic}`}
        title={t.title}
        description={
          <>
            <Badge tone={t.status === "RESOLVED" ? "ok" : t.status === "IN_PROGRESS" ? "info" : "warn"}>{DOUBT_STATUS_LABEL[t.status]}</Badge> {t.visibility === "BATCH" ? <Badge tone="info">Shared with batch</Badge> : <Badge>Private</Badge>}{" "}
            {own ? "" : `· asked by ${t.student.name}`} · {dt(t.createdAt)}
          </>
        }
        actions={
          own && (
            <>
              {t.status !== "RESOLVED" ? (
                <ConfirmAction action={doubtStatusAction} fields={{ threadId: t.id, status: "RESOLVED" }} label="Mark as resolved" confirmLabel="Resolve" variant="primary" />
              ) : (
                <ConfirmAction action={doubtStatusAction} fields={{ threadId: t.id, status: "OPEN" }} label="Reopen — I still need help" confirmLabel="Reopen" />
              )}
            </>
          )
        }
      />
      <div className="grid grid--main-side">
        <div className="stack">
          <DoubtMessages messages={t.messages} />
          {(own || t.visibility === "BATCH") && (
            <Card title={t.status === "RESOLVED" && own ? "Reply (this reopens the doubt)" : "Reply"}>
              <ReplyForm threadId={t.id} />
            </Card>
          )}
        </div>
        <div className="stack">
          {(t.assignment || t.assessment || t.projectBrief) && (
            <Card title="Linked task">
              {t.assignment && <Link href={`/portal/student/assignments/${t.assignment.id}`}>Assignment: {t.assignment.title}</Link>}
              {t.assessment && <Link href={`/portal/student/tests/${t.assessment.id}`}>Test: {t.assessment.title}</Link>}
              {t.projectBrief && <Link href="/portal/student/projects">Project: {t.projectBrief.title}</Link>}
            </Card>
          )}
          <Card title="Tips">
            <p className="small">Mark the doubt as resolved when your question is answered. You can reopen it any time if you need more help.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
