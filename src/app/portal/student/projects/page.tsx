import Link from "next/link";
import { Icon } from "@/components/icons";
import { Badge, Card, Empty, Markdown, PageHead } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt } from "@/lib/display";
import { activeBatchIds, visibleBriefWhere } from "@/server/access";
import { pageStudent } from "@/server/session";

export const metadata = { title: "Projects" };

export default async function StudentProjects() {
  const me = await pageStudent("/portal/student/projects");
  const batchIds = await activeBatchIds(me.id);
  const [briefs, submissions] = await Promise.all([
    prisma.projectBrief.findMany({
      where: visibleBriefWhere(me.id, batchIds),
      orderBy: { createdAt: "desc" },
      include: { projects: { where: { ownerId: me.id, archivedAt: null }, select: { id: true, name: true } } },
    }),
    prisma.projectSubmission.findMany({
      where: { studentId: me.id },
      orderBy: { submittedAt: "desc" },
      include: { project: { select: { id: true, name: true } }, brief: { select: { title: true, maxMarks: true } } },
    }),
  ]);
  return (
    <>
      <PageHead title="Projects" description="Project briefs from your trainers, and the versions you've submitted for review." />
      <div className="stack">
        {briefs.length === 0 ? (
          <Card title="Assigned projects">
            <Empty icon="folder" title="No projects assigned yet">You can still practise in the Full Stack Workspace.</Empty>
          </Card>
        ) : (
          briefs.map((b) => (
            <Card
              key={b.id}
              title={b.title}
              description={b.dueAt ? `Due ${dt(b.dueAt)} · ${b.maxMarks} marks` : `${b.maxMarks} marks`}
              actions={
                <>
                  {b.projects[0] ? (
                    <Link className="btn btn--primary btn--sm" href={`/portal/student/workspace/${b.projects[0].id}`}>
                      <Icon name="terminal" /> Open in workspace
                    </Link>
                  ) : (
                    <Link className="btn btn--primary btn--sm" href={`/portal/student/workspace?brief=${b.id}`}>
                      <Icon name="plus" /> Start project
                    </Link>
                  )}
                  <Link className="btn btn--secondary btn--sm" href={`/portal/student/doubts/new?link=project:${b.id}`}>
                    Ask a doubt
                  </Link>
                </>
              }
            >
              <Markdown>{b.description}</Markdown>
            </Card>
          ))
        )}
        <Card title="Your submissions" flush>
          {submissions.length === 0 ? (
            <Empty icon="send" title="Nothing submitted yet">Use Submit in the workspace to send a fixed version for review.</Empty>
          ) : (
            <ul className="list">
              {submissions.map((s) => (
                <li key={s.id} style={{ alignItems: "flex-start" }}>
                  <div className="list__main">
                    <span className="list__title">{s.brief?.title ?? s.project.name}</span>
                    <span className="list__meta">
                      Submitted {dt(s.submittedAt)} · {s.fileCount} files ·{" "}
                      <a href={`/api/projects/submissions/${s.id}/export`}>download this version</a>
                    </span>
                    {s.feedback && (
                      <div className="msg__bubble" style={{ marginTop: 8 }}>
                        <strong className="small">Trainer feedback</strong>
                        <Markdown>{s.feedback}</Markdown>
                      </div>
                    )}
                  </div>
                  <Badge tone={s.status === "REVIEWED" ? "ok" : s.status === "SUBMITTED" ? "info" : "warn"}>
                    {s.status === "REVIEWED" ? (s.marks !== null ? `${s.marks} / ${s.brief?.maxMarks ?? 100}` : "Reviewed") : s.status === "SUBMITTED" ? "Awaiting review" : "Changes requested"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
