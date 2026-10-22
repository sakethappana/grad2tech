import Link from "next/link";
import { notFound } from "next/navigation";
import { DoubtMessages, messageInclude } from "@/components/doubt-thread";
import { ActionForm, ConfirmAction, Select, SubmitButton } from "@/components/forms";
import { ReplyForm } from "@/components/reply-form";
import { Badge, Card, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt } from "@/lib/display";
import { DOUBT_STATUS_LABEL } from "@/server/doubts";
import { pageAdmin } from "@/server/session";
import { assignDoubtAction, doubtStatusAction } from "../../../doubt-actions";

export default async function AdminDoubt(props: PageProps<"/portal/admin/doubts/[id]">) {
  const { id } = await props.params;
  await pageAdmin(`/portal/admin/doubts/${id}`);
  const t = await prisma.doubtThread.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, name: true, email: true } },
      batch: { select: { code: true } },
      assignment: { select: { id: true, title: true } },
      assessment: { select: { id: true, title: true } },
      projectBrief: { select: { id: true, title: true } },
      messages: messageInclude,
    },
  });
  if (!t) notFound();
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", suspendedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const responseMins = t.firstResponseAt ? Math.round((t.firstResponseAt.getTime() - t.createdAt.getTime()) / 60000) : null;

  return (
    <>
      <PageHead
        eyebrow={`Doubt · ${t.topic}`}
        title={t.title}
        description={
          <>
            <Badge tone={t.status === "RESOLVED" ? "ok" : t.status === "IN_PROGRESS" ? "info" : "warn"}>{DOUBT_STATUS_LABEL[t.status]}</Badge>{" "}
            {t.visibility === "BATCH" ? <Badge tone="info">Shared with {t.batch?.code ?? "batch"}</Badge> : <Badge>Private</Badge>} · asked by{" "}
            <Link href={`/portal/admin/students/${t.student.id}`}>{t.student.name}</Link> {dt(t.createdAt)}
          </>
        }
        actions={
          <Link className="btn btn--secondary" href="/portal/admin/doubts">
            All doubts
          </Link>
        }
      />
      <div className="grid grid--main-side">
        <div className="stack">
          <DoubtMessages messages={t.messages} />
          <Card title="Reply to the student">
            <ReplyForm threadId={t.id} />
          </Card>
        </div>
        <div className="stack">
          <Card title="Status">
            <div className="stack stack--sm">
              <p className="small muted">
                {responseMins === null ? "No trainer reply yet." : `First trainer reply after ${responseMins < 60 ? `${responseMins} min` : `${Math.round(responseMins / 6) / 10} h`}.`}
              </p>
              <div className="row">
                {t.status !== "IN_PROGRESS" && <ConfirmAction action={doubtStatusAction} fields={{ threadId: t.id, status: "IN_PROGRESS" }} label="Mark in progress" confirmLabel="Confirm" />}
                {t.status !== "RESOLVED" && <ConfirmAction action={doubtStatusAction} fields={{ threadId: t.id, status: "RESOLVED" }} label="Mark resolved" confirmLabel="Resolve" variant="primary" />}
                {t.status === "RESOLVED" && <ConfirmAction action={doubtStatusAction} fields={{ threadId: t.id, status: "OPEN" }} label="Reopen" confirmLabel="Reopen" />}
              </div>
            </div>
          </Card>
          <Card title="Assigned trainer">
            <ActionForm action={assignDoubtAction}>
              <input type="hidden" name="threadId" value={t.id} />
              <Select name="assigneeId" label="Trainer" options={admins.map((a) => ({ value: a.id, label: a.name }))} defaultValue={t.assignedToId ?? ""} placeholder="Unassigned" />
              <SubmitButton variant="secondary">Update</SubmitButton>
            </ActionForm>
          </Card>
          {(t.assignment || t.assessment || t.projectBrief) && (
            <Card title="Linked task">
              {t.assignment && <Link href={`/portal/admin/assignments/${t.assignment.id}`}>Assignment: {t.assignment.title}</Link>}
              {t.assessment && <Link href={`/portal/admin/tests/${t.assessment.id}`}>Test: {t.assessment.title}</Link>}
              {t.projectBrief && <Link href={`/portal/admin/projects/${t.projectBrief.id}`}>Project: {t.projectBrief.title}</Link>}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
