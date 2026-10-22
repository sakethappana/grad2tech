import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertSameOrigin, jsonError, readJson } from "@/server/http";
import { saveDraft } from "@/server/playground";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

const body = z.object({ languageKey: z.string().min(1).max(20), code: z.string(), stdin: z.string().default("") });

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const languageKey = new URL(req.url).searchParams.get("languageKey") ?? "";
    const d = await prisma.codeDraft.findUnique({ where: { userId_languageKey: { userId: user.id, languageKey } } });
    return Response.json({ draft: d ? { code: d.code, stdin: d.stdin, updatedAt: d.updatedAt } : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PUT(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const input = body.parse(await readJson(req, 250_000));
    await saveDraft(user.id, input.languageKey, input.code, input.stdin);
    return Response.json({ savedAt: new Date().toISOString() });
  } catch (e) {
    return jsonError(e);
  }
}
