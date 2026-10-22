import { prisma } from "@/lib/db";
import { notFound } from "@/server/errors";
import { jsonError } from "@/server/http";
import { requireUser } from "@/server/session";
import { buildZip } from "@/server/workspace/projects";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/projects/submissions/[id]/export">) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const s = await prisma.projectSubmission.findUnique({ where: { id }, include: { project: { select: { name: true } } } });
    if (!s || (user.role !== "ADMIN" && s.studentId !== user.id)) throw notFound("Submission");
    const zip = await buildZip(s.snapshot as Record<string, string>);
    const name = `${s.project.name.replace(/[^\w-]+/g, "-")}-submission.zip`;
    return new Response(new Uint8Array(zip), {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return jsonError(e);
  }
}
