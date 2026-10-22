import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";
import { AppError, invalid } from "@/server/errors";

/**
 * Private object storage. Keys are random and never exposed to the browser; every
 * download goes through a permission-checked route handler.
 */

const ALLOWED: Record<string, { mimes: string[]; magic?: (b: Buffer) => boolean }> = {
  pdf: { mimes: ["application/pdf"], magic: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  png: { mimes: ["image/png"], magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  jpg: { mimes: ["image/jpeg"], magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mimes: ["image/jpeg"], magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  webp: { mimes: ["image/webp"], magic: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  zip: { mimes: ["application/zip", "application/x-zip-compressed"], magic: (b) => b[0] === 0x50 && b[1] === 0x4b },
  txt: { mimes: ["text/plain"] },
  md: { mimes: ["text/markdown", "text/plain"] },
  csv: { mimes: ["text/csv", "text/plain"] },
  json: { mimes: ["application/json", "text/plain"] },
  py: { mimes: ["text/x-python", "text/plain", "application/octet-stream"] },
  js: { mimes: ["text/javascript", "application/javascript", "text/plain"] },
  ts: { mimes: ["video/mp2t", "text/plain", "application/typescript", "application/octet-stream"] },
  java: { mimes: ["text/x-java", "text/plain", "application/octet-stream"] },
  c: { mimes: ["text/x-c", "text/plain", "application/octet-stream"] },
  cpp: { mimes: ["text/x-c++", "text/plain", "application/octet-stream"] },
  html: { mimes: ["text/html"] },
  css: { mimes: ["text/css"] },
};

const TEXT_EXT = new Set(["txt", "md", "csv", "json", "py", "js", "ts", "java", "c", "cpp", "html", "css"]);

export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED);
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

/** Content type used when serving: text-like files are always served as plain text. */
export function servingContentType(filename: string, storedMime: string): string {
  const ext = extOf(filename);
  if (TEXT_EXT.has(ext)) return "text/plain; charset=utf-8";
  return storedMime;
}

function extOf(filename: string) {
  return path.extname(filename).slice(1).toLowerCase();
}

export function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ()]+/g, "_").slice(0, 120);
  return base || "file";
}

export type ValidatedUpload = { filename: string; mimeType: string; bytes: Buffer; sha256: string };

export async function validateUpload(file: File, opts: { imagesOnly?: boolean } = {}): Promise<ValidatedUpload> {
  const max = env().UPLOAD_MAX_BYTES;
  if (file.size === 0) throw invalid(`"${file.name}" is empty.`);
  if (file.size > max) throw new AppError(`"${file.name}" is larger than ${Math.round(max / 1024 / 1024)} MB.`, 413, "TOO_LARGE");
  const filename = sanitizeFilename(file.name);
  const ext = extOf(filename);
  const rule = ALLOWED[ext];
  if (!rule || (opts.imagesOnly && !IMAGE_EXTENSIONS.includes(ext))) {
    const allowed = opts.imagesOnly ? IMAGE_EXTENSIONS : ALLOWED_EXTENSIONS;
    throw invalid(`"${file.name}" is not an allowed file type. Allowed: ${allowed.join(", ")}.`);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (rule.magic && !rule.magic(bytes)) throw invalid(`"${file.name}" does not look like a valid .${ext} file.`);
  const declared = (file.type || "").toLowerCase();
  const mimeType = rule.mimes.includes(declared) ? declared : rule.mimes[0];
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { filename, mimeType, bytes, sha256 };
}

// ── Drivers ────────────────────────────────────────────────────

interface Driver {
  put(key: string, bytes: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

function localDriver(): Driver {
  const root = path.resolve(env().STORAGE_LOCAL_DIR);
  const resolve = (key: string) => {
    const p = path.resolve(root, key);
    if (!p.startsWith(root + path.sep)) throw new Error("Invalid storage key");
    return p;
  };
  return {
    async put(key, bytes) {
      const p = resolve(key);
      await mkdir(path.dirname(p), { recursive: true });
      await writeFile(p, bytes);
    },
    async get(key) {
      return readFile(resolve(key));
    },
    async remove(key) {
      await unlink(resolve(key)).catch(() => {});
    },
  };
}

function s3Driver(): Driver {
  const e = env();
  if (!e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY) {
    throw new AppError("File storage is not configured.", 503, "UNAVAILABLE");
  }
  const client = new S3Client({
    region: e.S3_REGION || "auto",
    endpoint: e.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(e.S3_ENDPOINT),
    credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
  });
  return {
    async put(key, bytes, mimeType) {
      await client.send(new PutObjectCommand({ Bucket: e.S3_BUCKET, Key: key, Body: bytes, ContentType: mimeType }));
    },
    async get(key) {
      const res = await client.send(new GetObjectCommand({ Bucket: e.S3_BUCKET, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes) throw new Error("Empty object");
      return Buffer.from(bytes);
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: e.S3_BUCKET, Key: key }));
    },
  };
}

let driver: Driver | null = null;
function getDriver(): Driver {
  driver ??= env().STORAGE_DRIVER === "s3" ? s3Driver() : localDriver();
  return driver;
}

export function newStorageKey(prefix: string) {
  const d = new Date();
  return `${prefix}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}`;
}

export async function putObject(key: string, bytes: Buffer, mimeType: string) {
  await getDriver().put(key, bytes, mimeType);
}

export async function getObject(key: string) {
  return getDriver().get(key);
}

export async function removeObject(key: string) {
  await getDriver().remove(key);
}
