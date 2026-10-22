import { ActionForm, ConfirmAction, Select, SubmitButton, TextArea, TextField } from "@/components/forms";
import { Badge, Card, Empty, Markdown, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt } from "@/lib/display";
import { pageAdmin } from "@/server/session";
import { archiveAnnouncementAction, publishAnnouncementAction } from "./actions";

export const metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  await pageAdmin("/portal/admin/announcements");
  const [items, batches] = await Promise.all([
    prisma.announcement.findMany({ where: { archivedAt: null }, orderBy: { publishedAt: "desc" }, take: 50, include: { author: { select: { name: true } }, batch: { select: { code: true } } } }),
    prisma.batch.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
  ]);
  return (
    <>
      <PageHead title="Announcements" description="Published immediately to the chosen students, who get an in-app notification." />
      <div className="grid grid--main-side">
        <Card title="Published announcements" flush>
          {items.length === 0 ? (
            <Empty icon="megaphone" title="No announcements yet" />
          ) : (
            <ul className="list">
              {items.map((a) => (
                <li key={a.id} style={{ alignItems: "flex-start" }}>
                  <div className="list__main">
                    <span className="list__title">{a.title}</span>
                    <span className="list__meta" style={{ marginBottom: 8 }}>
                      {a.batch ? <Badge plain>{a.batch.code}</Badge> : <Badge plain tone="teal">All batches</Badge>} {a.author.name} · {dt(a.publishedAt)}
                    </span>
                    <Markdown>{a.body}</Markdown>
                  </div>
                  <ConfirmAction action={archiveAnnouncementAction} fields={{ id: a.id }} label="Archive" confirmLabel="Archive" />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="New announcement">
          <ActionForm action={publishAnnouncementAction} resetOnSuccess>
            <TextField name="title" label="Title" required />
            <Select name="batchId" label="Audience" options={batches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }))} placeholder="All active students" />
            <TextArea name="body" label="Message" rows={8} hint="Markdown supported." required />
            <SubmitButton>Publish announcement</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
