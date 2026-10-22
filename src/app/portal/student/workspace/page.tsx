import Link from "next/link";
import { ActionForm, Select, SubmitButton, TextField } from "@/components/forms";
import { Alert, Badge, Card, Empty, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { rel } from "@/lib/display";
import { activeBatchIds, visibleBriefWhere } from "@/server/access";
import { pageStudent } from "@/server/session";
import { TEMPLATE_LIST, TEMPLATES, isTemplateKey } from "@/server/workspace/templates";
import { createProjectAction } from "./actions";

export const metadata = { title: "Full Stack Workspace" };

export default async function WorkspaceList(props: PageProps<"/portal/student/workspace">) {
  const me = await pageStudent("/portal/student/workspace");
  const sp = await props.searchParams;
  const batchIds = await activeBatchIds(me.id);
  const [projects, briefs] = await Promise.all([
    prisma.workspaceProject.findMany({
      where: { ownerId: me.id, archivedAt: null },
      orderBy: { updatedAt: "desc" },
      include: { brief: { select: { title: true } }, _count: { select: { files: true, submissions: true } } },
    }),
    prisma.projectBrief.findMany({ where: visibleBriefWhere(me.id, batchIds), orderBy: { createdAt: "desc" }, select: { id: true, title: true, starterTemplate: true } }),
  ]);
  const presetBrief = typeof sp.brief === "string" ? briefs.find((b) => b.id === sp.brief) : undefined;

  return (
    <>
      <PageHead
        title="Full Stack Workspace"
        description="Build frontend and backend projects in your browser. Files are saved to your account; projects run in an isolated sandbox on your device."
      />
      <div className="grid grid--main-side">
        <div className="stack">
          <Card title="Your projects" flush>
            {projects.length === 0 ? (
              <Empty icon="folder" title="No projects yet">Start one from a template on the right.</Empty>
            ) : (
              <ul className="list">
                {projects.map((p) => (
                  <li key={p.id}>
                    <div className="list__main">
                      <Link href={`/portal/student/workspace/${p.id}`}>{p.name}</Link>
                      <span className="list__meta">
                        {isTemplateKey(p.template) ? TEMPLATES[p.template].name : p.template} · {p._count.files} files · edited {rel(p.updatedAt)}
                        {p.brief ? ` · for "${p.brief.title}"` : ""}
                      </span>
                    </div>
                    {p._count.submissions > 0 && <Badge tone="teal">{p._count.submissions} submitted</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Alert tone="info" title="Device requirements.">
            Node.js projects run in WebContainers inside your browser: use a recent Chrome, Edge or Firefox on a laptop or desktop. HTML/CSS/JS projects preview on any modern browser.
          </Alert>
        </div>
        <Card title="Start a project">
          <ActionForm action={createProjectAction}>
            <TextField name="name" label="Project name" defaultValue={presetBrief ? presetBrief.title : ""} placeholder="My portfolio" required />
            <Select
              name="template"
              label="Starter"
              options={TEMPLATE_LIST.map((t) => ({ value: t.key, label: `${t.name} — ${t.description}` }))}
              defaultValue={presetBrief?.starterTemplate ?? "static-web"}
            />
            <Select name="briefId" label="For a project brief (optional)" options={briefs.map((b) => ({ value: b.id, label: b.title }))} defaultValue={presetBrief?.id ?? ""} placeholder="Independent practice" />
            <SubmitButton>Create project</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
