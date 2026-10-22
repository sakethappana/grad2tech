import { authorizeFile } from "@/server/files";
import { jsonError } from "@/server/http";
import { requireUser } from "@/server/session";
import { getObject, IMAGE_EXTENSIONS, servingContentType } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Private file download. Every request is checked against the file's owner, assignment or doubt. */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]">) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const file = await authorizeFile(user, id);
    const bytes = await getObject(file.storageKey);
    const ext = file.filename.split(".").pop()?.toLowerCase() ?? "";
    const inline = IMAGE_EXTENSIONS.includes(ext) || ext === "pdf";
    const disposition = `${inline ? "inline" : "attachment"}; filename="${file.filename.replace(/"/g, "")}"`;
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": servingContentType(file.filename, file.mimeType),
        "Content-Length": String(bytes.length),
        "Content-Disposition": disposition,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        // Uploaded content can never run scripts in the portal's origin.
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
