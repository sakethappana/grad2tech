import { z } from "zod";
import { saveAnswer } from "@/server/assessments/attempts";
import { assertSameOrigin, jsonError, readJson } from "@/server/http";
import { requireStudent } from "@/server/session";

export const dynamic = "force-dynamic";

const body = z.object({
  questionId: z.string().min(1),
  selectedOptionIds: z.array(z.string()).max(20).optional(),
  textAnswer: z.string().optional(),
  code: z.string().optional(),
  languageKey: z.string().max(20).optional(),
});

/** Autosave one answer. The server checks ownership, attempt status and the deadline. */
export async function PUT(req: Request, ctx: RouteContext<"/api/attempts/[id]/answers">) {
  try {
    assertSameOrigin(req);
    const me = await requireStudent();
    const { id } = await ctx.params;
    const input = body.parse(await readJson(req, 250_000));
    const { questionId, ...payload } = input;
    const saved = await saveAnswer(me.id, id, questionId, payload);
    return Response.json({ revision: saved.revision, savedAt: saved.savedAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(e);
  }
}
