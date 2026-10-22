import { submitAttempt } from "@/server/assessments/attempts";
import { assertSameOrigin, jsonError } from "@/server/http";
import { requireStudent } from "@/server/session";

export const dynamic = "force-dynamic";

/** Final submission. Idempotent: repeated requests return the same finalised attempt. */
export async function POST(req: Request, ctx: RouteContext<"/api/attempts/[id]/submit">) {
  try {
    assertSameOrigin(req);
    const me = await requireStudent();
    const { id } = await ctx.params;
    const attempt = await submitAttempt(me.id, id);
    return Response.json({ status: attempt.status, submittedAt: attempt.submittedAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(e);
  }
}
