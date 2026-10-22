import { prisma } from "@/lib/db";
import { finalizeAttempt } from "@/server/assessments/attempts";
import { notFound } from "@/server/errors";
import { jsonError } from "@/server/http";
import { requireStudent } from "@/server/session";

export const dynamic = "force-dynamic";

/** Server time and attempt status, used to re-sync the timer and saved revisions after reconnecting. */
export async function GET(_req: Request, ctx: RouteContext<"/api/attempts/[id]/state">) {
  try {
    const me = await requireStudent();
    const { id } = await ctx.params;
    let attempt = await prisma.attempt.findFirst({
      where: { id, studentId: me.id },
      select: { id: true, status: true, deadlineAt: true, answers: { select: { questionId: true, revision: true, savedAt: true } } },
    });
    if (!attempt) throw notFound("Attempt");
    const now = new Date();
    if (attempt.status === "IN_PROGRESS" && now >= attempt.deadlineAt) {
      await finalizeAttempt(id, "SYSTEM", now);
      attempt = { ...attempt, status: "AUTO_SUBMITTED" };
    }
    return Response.json(
      { serverNow: now.toISOString(), status: attempt.status, deadlineAt: attempt.deadlineAt, revisions: attempt.answers },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return jsonError(e);
  }
}
