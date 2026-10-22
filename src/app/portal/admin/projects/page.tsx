import Link from "next/link";
import { Badge, Card, Empty, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt, rel } from "@/lib/display";
import { pageAdmin } from "@/server/session";
import { TEMPLATES, isTemplateKey } from "@/server/workspace/templates";
import { targetSummary } from "../targets";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  await pageAdmin("/portal/admin/projects");
  const now = new Date();
  const [briefs, queue] = await Promise.all([
    prisma.projectBrief.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        targets: { include: { batch: { select: { code: true } }, student: { select: { name: true } } } },
        _count: { select: { submissions: true } },
      },
    }),
    prisma.projectSubmission.findMany({
      where: { status: "SUBMITTED" },
      orderBy: { submittedAt: "asc" },
      include: { student: { select: { name: true } }, project: { select: { name: true } }, brief: { select: { title: true } } },
    }),
  ]);
  return (
    <>
      <PageHead
        title="Projects"
        description="Project briefs students build in the Full Stack Workspace. Each submission is a frozen snapshot of the files."
        actions={
          <Link className="btn btn--primary" href="/portal/admin/projects/new">
            New project brief
          </Link>
        }
      />
      <div className="grid grid--main-side">
        <Card title="Project briefs" flush>
          {briefs.length === 0 ? (
            <Empty icon="folder" title="No project briefs yet" action={<Link className="btn btn--secondary btn--sm" href="/portal/admin/projects/new">Create one</Link>} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Project</th>
                    <th scope="col">Assigned to</th>
                    <th scope="col">Status</th>
                    <th scope="col">Due</th>
                    <th scope="col" className="num">Submissions</th>
                  </tr>
                </thead>
                <tbody>
                  {briefs.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <Link href={`/portal/admin/projects/${b.id}`}>{b.title}</Link>
                        <div className="small muted">{isTemplateKey(b.starterTemplate) ? TEMPLATES[b.starterTemplate].name : b.starterTemplate}</div>
                      </td>
                      <td className="small">{targetSummary(b.targets)}</td>
                      <td>{b.status === "DRAFT" ? <Badge>Draft</Badge> : b.publishAt && b.publishAt > now ? <Badge tone="info">Scheduled</Badge> : <Badge tone="ok">Published</Badge>}</td>
                      <td className="nowrap">{dt(b.dueAt)}</td>
                      <td className="num">{b._count.submissions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title={`Waiting for review (${queue.length})`} flush>
          {queue.length === 0 ? (
            <Empty icon="check" title="Nothing to review" />
          ) : (
            <ul className="list">
              {queue.map((s) => (
                <li key={s.id}>
                  <div className="list__main">
                    <Link href={`/portal/admin/projects/submissions/${s.id}`}>{s.brief?.title ?? s.project.name}</Link>
                    <span className="list__meta">
                      {s.student.name} · {rel(s.submittedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
