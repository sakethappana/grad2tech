import type { FilePurpose } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getVisibleAssignment, getVisibleDoubt } from "@/server/access";
import { notFound } from "@/server/errors";
import type { CurrentUser } from "@/server/session";
import { newStorageKey, putObject, removeObject, validateUpload } from "@/server/storage";

const MAX_FILES_PER_UPLOAD = 5;

type Link = { assignmentId?: string; submissionId?: string; doubtMessageId?: string };

/** Validates and stores uploads, then records them. Stored objects are removed if the DB write fails. */
export async function saveUploads(files: File[], ctx: { ownerId: string; purpose: FilePurpose; imagesOnly?: boolean } & Link) {
  const real = files.filter((f) => f && typeof f === "object" && f.size > 0);
  if (real.length > MAX_FILES_PER_UPLOAD) throw new Error(`Upload at most ${MAX_FILES_PER_UPLOAD} files at a time.`);
  const validated = [];
  for (const f of real) validated.push(await validateUpload(f, { imagesOnly: ctx.imagesOnly }));
  const stored: string[] = [];
  try {
    const created = [];
    for (const v of validated) {
      const key = newStorageKey(ctx.purpose.toLowerCase());
      await putObject(key, v.bytes, v.mimeType);
      stored.push(key);
      created.push(
        await prisma.fileObject.create({
          data: {
            ownerId: ctx.ownerId,
            purpose: ctx.purpose,
            storageKey: key,
            filename: v.filename,
            mimeType: v.mimeType,
            sizeBytes: v.bytes.length,
            sha256: v.sha256,
            assignmentId: ctx.assignmentId,
            submissionId: ctx.submissionId,
            doubtMessageId: ctx.doubtMessageId,
          },
        }),
      );
    }
    return created;
  } catch (e) {
    await Promise.all(stored.map((k) => removeObject(k).catch(() => {})));
    throw e;
  }
}

/** Returns the file record if `user` may download it; otherwise throws 404. */
export async function authorizeFile(user: CurrentUser, fileId: string) {
  const file = await prisma.fileObject.findUnique({
    where: { id: fileId },
    include: { submission: { select: { studentId: true } }, doubtMessage: { select: { threadId: true } } },
  });
  if (!file) throw notFound("File");
  if (user.role === "ADMIN") return file;

  switch (file.purpose) {
    case "ASSIGNMENT_RESOURCE":
      if (!file.assignmentId) throw notFound("File");
      await getVisibleAssignment(user.id, file.assignmentId);
      return file;
    case "SUBMISSION":
      if (file.submission?.studentId !== user.id) throw notFound("File");
      return file;
    case "DOUBT_ATTACHMENT":
      if (!file.doubtMessage) throw notFound("File");
      await getVisibleDoubt(user.id, file.doubtMessage.threadId);
      return file;
    default:
      throw notFound("File");
  }
}

/** Students may delete their own draft submission files. */
export async function deleteOwnSubmissionFile(studentId: string, fileId: string) {
  const file = await prisma.fileObject.findFirst({
    where: { id: fileId, purpose: "SUBMISSION", ownerId: studentId, submission: { status: { in: ["DRAFT", "RESUBMIT_REQUESTED"] } } },
  });
  if (!file) throw notFound("File");
  await prisma.fileObject.delete({ where: { id: file.id } });
  await removeObject(file.storageKey).catch(() => {});
}
