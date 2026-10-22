import { assertSameOrigin, jsonError, readJson } from "@/server/http";
import { runSchema, startRun } from "@/server/playground";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

/** Starts a run on the isolated execution service (never on this server). */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const input = runSchema.parse(await readJson(req, 250_000));
    const run = await startRun(user.id, input);
    return Response.json(
      { id: run.id, status: run.status, errorMessage: run.errorMessage },
      { status: run.status === "SERVICE_ERROR" ? 503 : 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return jsonError(e);
  }
}
