import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton, TextField } from "@/components/forms";
import { Alert, Badge, Card, Empty, Markdown, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt, toLocalInput } from "@/lib/display";
import { pageAdmin } from "@/server/session";
import { targetOptions } from "../../targets";
import { publishBriefAction } from "../actions";
import { BriefForm } from "../brief-form";

export default async function BriefDetail(props: PageProps<"/portal/admin/projects/[id]">) {
  const { id } = await props.params;
  await pageAdmin(`/portal/admin/projects/${id}`);
  const b = await prisma.projectBrief.findUnique({
    where: { id },
    include: {
      targets: true,
      submissions: { orderBy: { submittedAt: "desc" }, include: { student: { select: { name: true } } } },
    },
  });
  if (!b) notFound();
  const now = new Date();
  return (
    <>
      <PageHead eyebrow="Project brief" title={b.title} description={b.dueAt ? `Due ${dt(b.dueAt)} · ${b.maxMarks} marks` : `${b.maxMarks} marks`} />
      <div className="grid grid--main-side">
        <div className="stack">
          <Card title={`Submissions (${b.submissions.length})`} flush>
            {b.submissions.length === 0 ? (
              <Empty icon="folder" title="No submissions yet" />
            ) : (
              <ul className="list">
                {b.submissions.map((s) => (
                  <li key={s.id}>
                    <div className="list__main">
                      <Link href={`/portal/admin/projects/submissions/${s.id}`}>{s.student.name}</Link>
                      <span className="list__meta">
                        {dt(s.submittedAt)} · {s.fileCount} files
                      </span>
                    </div>
                    <Badge tone={s.status === "REVIEWED" ? "ok" : s.status === "SUBMITTED" ? "info" : "warn"}>
                      {s.status === "REVIEWED" ? (s.marks !== null ? `${s.marks} / ${b.maxMarks}` : "Reviewed") : s.status === "SUBMITTED" ? "To review" : "Changes requested"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Brief">
            <Markdown>{b.description}</Markdown>
          </Card>
        </div>
        <div className="stack">
          <Card title="Publication">
            {b.status === "DRAFT" ? (
              <div className="stack">
                <ActionForm action={publishBriefAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="mode" value="now" />
                  <SubmitButton>Publish now</SubmitButton>
                </ActionForm>
                <ActionForm action={publishBriefAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="mode" value="schedule" />
                  <TextField name="publishAt" label="Or schedule for" type="datetime-local" defaultValue={toLocalInput(new Date(now.getTime() + 3600_000))} />
                  <SubmitButton variant="secondary">Schedule</SubmitButton>
                </ActionForm>
              </div>
            ) : (
              <Alert tone="ok">{b.publishAt && b.publishAt > now ? `Scheduled for ${dt(b.publishAt)}.` : `Published ${dt(b.publishAt)}.`}</Alert>
            )}
          </Card>
          <Card title="Edit brief">
            <details>
              <summary className="link-button" style={{ cursor: "pointer" }}>
                Edit details and targets
              </summary>
              <div style={{ marginTop: 16 }}>
                <BriefForm
                  brief={b}
                  options={await targetOptions()}
                  targets={{ batchIds: b.targets.map((t) => t.batchId).filter(Boolean) as string[], studentIds: b.targets.map((t) => t.studentId).filter(Boolean) as string[] }}
                />
              </div>
            </details>
          </Card>
        </div>
      </div>
    </>
  );
}
