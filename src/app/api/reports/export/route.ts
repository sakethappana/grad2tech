import { audit } from "@/server/audit";
import { jsonError } from "@/server/http";
import { studentSummaryCsv } from "@/server/reports";
import { requireAdmin } from "@/server/session";

export const dynamic = "force-dynamic";

/** Admin-only CSV export of the student summary for one batch (or all students). */
export async function GET(req: Request) {
  try {
    const admin = await requireAdmin();
    const batch = new URL(req.url).searchParams.get("batch");
    const csv = await studentSummaryCsv(batch || null);
    await audit({ actorId: admin.id, action: "report.exported", entityType: "Batch", entityId: batch || "all" });
    const date = new Date().toISOString().slice(0, 10);
    return new Response("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="grad2tech-student-summary-${date}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
