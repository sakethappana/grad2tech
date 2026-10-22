import { jsonError } from "@/server/http";
import { availableLanguages } from "@/server/playground";
import { STARTER_TEMPLATES } from "@/server/execution";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

/** Languages discovered from the configured execution provider. */
export async function GET() {
  try {
    await requireUser();
    const res = await availableLanguages();
    return Response.json(
      { ...res, languages: res.languages.map((l) => ({ ...l, starter: STARTER_TEMPLATES[l.family] ?? "" })) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return jsonError(e);
  }
}
