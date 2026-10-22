import { assertSameOrigin, jsonError } from "@/server/http";
import { cancelRun } from "@/server/playground";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/playground/runs/[id]/cancel">) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const { id } = await ctx.params;
    await cancelRun(user.id, id);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
