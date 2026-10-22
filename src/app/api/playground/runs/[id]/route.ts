import { jsonError } from "@/server/http";
import { refreshRun } from "@/server/playground";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

/** Polls a run (owner only) and returns its current state and output. */
export async function GET(_req: Request, ctx: RouteContext<"/api/playground/runs/[id]">) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const r = await refreshRun(user.id, id);
    return Response.json(
      {
        id: r.id,
        status: r.status,
        verdict: r.verdict,
        stdout: r.stdout,
        stderr: r.stderr,
        compileOutput: r.compileOutput,
        exitCode: r.exitCode,
        timeMs: r.timeMs,
        memoryKb: r.memoryKb,
        errorMessage: r.errorMessage,
        languageLabel: r.languageLabel,
        createdAt: r.createdAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return jsonError(e);
  }
}
