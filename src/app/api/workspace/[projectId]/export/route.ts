import { jsonError } from "@/server/http";
import { requireUser } from "@/server/session";
import { buildZip, getProjectFor } from "@/server/workspace/projects";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/workspace/[projectId]/export">) {
  try {
    const user = await requireUser();
    const { projectId } = await ctx.params;
    const p = await getProjectFor(user, projectId);
    const zip = await buildZip(Object.fromEntries(p.files.map((f) => [f.path, f.content])));
    const name = `${p.name.replace(/[^\w-]+/g, "-")}.zip`;
    return new Response(new Uint8Array(zip), {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return jsonError(e);
  }
}
