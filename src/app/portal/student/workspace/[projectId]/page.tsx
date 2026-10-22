import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { isAppError } from "@/server/errors";
import { pageStudent } from "@/server/session";
import { getProjectFor } from "@/server/workspace/projects";
import { isTemplateKey, TEMPLATES } from "@/server/workspace/templates";
import { Workspace } from "./workspace";

export const metadata = { title: "Workspace" };

export default async function WorkspacePage(props: PageProps<"/portal/student/workspace/[projectId]">) {
  const { projectId } = await props.params;
  const me = await pageStudent(`/portal/student/workspace/${projectId}`);
  const p = await getProjectFor(me, projectId).catch((e) => {
    if (isAppError(e) && e.status === 404) notFound();
    throw e;
  });
  if (p.archivedAt) notFound();
  const t = isTemplateKey(p.template) ? TEMPLATES[p.template] : TEMPLATES["static-web"];
  return (
    <Workspace
      projectId={p.id}
      name={p.name}
      runtime={t.runtime}
      install={t.install ?? null}
      start={t.start ?? null}
      initialFiles={Object.fromEntries(p.files.map((f) => [f.path, f.content]))}
      clientId={env().WEBCONTAINER_CLIENT_ID || null}
      briefTitle={p.brief?.title ?? null}
    />
  );
}
