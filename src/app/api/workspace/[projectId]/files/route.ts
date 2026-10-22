import { z } from "zod";
import { assertSameOrigin, jsonError, readJson } from "@/server/http";
import { requireStudent } from "@/server/session";
import { createEntry, deleteEntry, renameEntry, saveFile } from "@/server/workspace/projects";

export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/workspace/[projectId]/files">;

/** Save a file (owner only). */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    assertSameOrigin(req);
    const me = await requireStudent();
    const { projectId } = await ctx.params;
    const body = z.object({ path: z.string(), content: z.string() }).parse(await readJson(req, 600_000));
    const f = await saveFile(me.id, projectId, body.path, body.content);
    return Response.json({ path: f.path, updatedAt: f.updatedAt });
  } catch (e) {
    return jsonError(e);
  }
}

/** Create an empty file or folder. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    assertSameOrigin(req);
    const me = await requireStudent();
    const { projectId } = await ctx.params;
    const body = z.object({ path: z.string(), kind: z.enum(["file", "folder"]) }).parse(await readJson(req));
    await createEntry(me.id, projectId, body.path, body.kind);
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

/** Rename a file or folder. */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    assertSameOrigin(req);
    const me = await requireStudent();
    const { projectId } = await ctx.params;
    const body = z.object({ from: z.string(), to: z.string() }).parse(await readJson(req));
    await renameEntry(me.id, projectId, body.from, body.to);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

/** Delete a file or folder. */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    assertSameOrigin(req);
    const me = await requireStudent();
    const { projectId } = await ctx.params;
    const path = new URL(req.url).searchParams.get("path") ?? "";
    await deleteEntry(me.id, projectId, path);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
