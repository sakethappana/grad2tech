import JSZip from "jszip";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { getVisibleBrief, resolveTargetStudents } from "@/server/access";
import { audit } from "@/server/audit";
import { conflict, invalid, notFound } from "@/server/errors";
import { activeAdminIds, notify } from "@/server/notifications";
import type { CurrentUser } from "@/server/session";
import { isTemplateKey, TEMPLATES } from "./templates";

export const LIMITS = { maxFiles: 300, maxFileBytes: 500_000, maxProjectBytes: 5_000_000, maxProjects: 30 };

/** Relative POSIX paths only: no traversal, no absolute paths, no node_modules. */
export function validatePath(p: string): string {
  const path = p.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\.\//, "");
  if (!path || path.length > 200) throw invalid("File names must be 1–200 characters.");
  if (path.startsWith("/") || path.endsWith("/")) throw invalid("Use a relative file path like src/App.jsx.");
  const parts = path.split("/");
  if (parts.length > 8) throw invalid("Folders can be nested at most 8 levels deep.");
  for (const part of parts) {
    if (part === "." || part === "..") throw invalid("Paths cannot contain '.' or '..' segments.");
    if (!/^[A-Za-z0-9._@-]+$/.test(part)) throw invalid("Use letters, numbers, dots, dashes and underscores in file names.");
  }
  if (parts[0] === "node_modules" || parts.includes(".git")) throw invalid("That folder is managed automatically and can't be edited.");
  return path;
}

// ── Project briefs (admin) ─────────────────────────────────────

export const briefSchema = z
  .object({
    title: z.string().trim().min(3, "Enter a title").max(150),
    description: z.string().trim().min(1, "Describe the project").max(30_000),
    starterTemplate: z.string().refine(isTemplateKey, "Choose a starter"),
    dueAt: z.date().nullable().default(null),
    maxMarks: z.coerce.number().int().min(1).max(1000),
    batchIds: z.array(z.string()).default([]),
    studentIds: z.array(z.string()).default([]),
  })
  .refine((v) => v.batchIds.length + v.studentIds.length > 0, { message: "Choose at least one batch or student", path: ["batchIds"] });

async function replaceBriefTargets(tx: Tx, briefId: string, batchIds: string[], studentIds: string[]) {
  await tx.projectBriefTarget.deleteMany({ where: { briefId } });
  const data: { briefId: string; batchId?: string; studentId?: string }[] = [
    ...[...new Set(batchIds)].map((batchId) => ({ briefId, batchId })),
    ...[...new Set(studentIds)].map((studentId) => ({ briefId, studentId })),
  ];
  if (data.length) await tx.projectBriefTarget.createMany({ data });
}

export async function saveBrief(adminId: string, briefId: string | null, input: z.infer<typeof briefSchema>) {
  const { batchIds, studentIds, ...fields } = input;
  return prisma.$transaction(async (tx) => {
    const b = briefId
      ? await tx.projectBrief.update({ where: { id: briefId }, data: fields })
      : await tx.projectBrief.create({ data: { ...fields, createdById: adminId } });
    await replaceBriefTargets(tx, b.id, batchIds, studentIds);
    return b;
  });
}

export async function publishBrief(adminId: string, id: string, publishAt: Date | null, now = new Date()) {
  const b = await prisma.projectBrief.findUnique({ where: { id }, include: { targets: true } });
  if (!b) throw notFound("Project");
  if (b.status !== "DRAFT") throw conflict("Only drafts can be published.");
  if (b.targets.length === 0) throw invalid("Choose at least one batch or student.");
  const when = publishAt && publishAt > now ? publishAt : now;
  await prisma.$transaction(async (tx) => {
    await tx.projectBrief.update({ where: { id }, data: { status: "PUBLISHED", publishAt: when } });
    await audit({ actorId: adminId, action: "project.brief_published", entityType: "ProjectBrief", entityId: id, metadata: { publishAt: when.toISOString() } }, tx);
  });
  if (when <= now) await notifyBriefPublished(id);
}

export async function notifyBriefPublished(id: string) {
  const b = await prisma.projectBrief.findUnique({ where: { id }, include: { targets: true } });
  if (!b || b.status !== "PUBLISHED" || b.notifiedAt) return;
  await notify(await resolveTargetStudents(b.targets), {
    type: "PROJECT_PUBLISHED",
    title: `New project: ${b.title}`,
    link: `/portal/student/projects`,
    dedupeKey: `brief-published:${b.id}`,
  });
  await prisma.projectBrief.update({ where: { id }, data: { notifiedAt: new Date() } });
}

// ── Student workspace projects ─────────────────────────────────

export async function createProject(studentId: string, input: { name: string; template: string; briefId: string | null }) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw invalid("Project names must be 2–80 characters.");
  if (!isTemplateKey(input.template)) throw invalid("Choose a starter project.");
  if (input.briefId) await getVisibleBrief(studentId, input.briefId);
  const count = await prisma.workspaceProject.count({ where: { ownerId: studentId, archivedAt: null } });
  if (count >= LIMITS.maxProjects) throw conflict(`You can keep up to ${LIMITS.maxProjects} projects. Archive one first.`);
  const t = TEMPLATES[input.template];
  return prisma.$transaction(async (tx) => {
    const p = await tx.workspaceProject.create({ data: { ownerId: studentId, name, template: t.key, briefId: input.briefId } });
    await tx.workspaceFile.createMany({ data: Object.entries(t.files).map(([path, content]) => ({ projectId: p.id, path, content })) });
    return p;
  });
}

/** Owner (student) or any admin can read a project. */
export async function getProjectFor(user: CurrentUser, projectId: string) {
  const p = await prisma.workspaceProject.findUnique({
    where: { id: projectId },
    include: { files: { orderBy: { path: "asc" }, select: { path: true, content: true, updatedAt: true } }, brief: { select: { id: true, title: true } } },
  });
  if (!p || (user.role !== "ADMIN" && p.ownerId !== user.id)) throw notFound("Project");
  return p;
}

async function ownedProject(studentId: string, projectId: string) {
  const p = await prisma.workspaceProject.findFirst({ where: { id: projectId, ownerId: studentId, archivedAt: null } });
  if (!p) throw notFound("Project");
  return p;
}

async function assertCapacity(projectId: string, path: string, newBytes: number) {
  const files = await prisma.workspaceFile.findMany({ where: { projectId }, select: { path: true, content: true } });
  const others = files.filter((f) => f.path !== path);
  if (!files.some((f) => f.path === path) && files.length >= LIMITS.maxFiles) throw invalid(`Projects can have at most ${LIMITS.maxFiles} files.`);
  const total = others.reduce((s, f) => s + Buffer.byteLength(f.content), 0) + newBytes;
  if (total > LIMITS.maxProjectBytes) throw invalid("This project has reached its 5 MB size limit.");
}

export async function saveFile(studentId: string, projectId: string, rawPath: string, content: string) {
  await ownedProject(studentId, projectId);
  const path = validatePath(rawPath);
  const bytes = Buffer.byteLength(content);
  if (bytes > LIMITS.maxFileBytes) throw invalid("Files are limited to 500 KB.");
  await assertCapacity(projectId, path, bytes);
  const f = await prisma.workspaceFile.upsert({
    where: { projectId_path: { projectId, path } },
    create: { projectId, path, content },
    update: { content },
    select: { path: true, updatedAt: true },
  });
  await prisma.workspaceProject.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
  return f;
}

export async function createEntry(studentId: string, projectId: string, rawPath: string, kind: "file" | "folder") {
  await ownedProject(studentId, projectId);
  const path = validatePath(rawPath);
  const target = kind === "folder" ? `${path}/.gitkeep` : path;
  const exists = await prisma.workspaceFile.findFirst({ where: { projectId, OR: [{ path: target }, { path: { startsWith: `${path}/` } }] } });
  if (exists || (kind === "file" && (await prisma.workspaceFile.findFirst({ where: { projectId, path } })))) throw conflict("A file or folder with that name already exists.");
  await assertCapacity(projectId, target, 0);
  await prisma.workspaceFile.create({ data: { projectId, path: target, content: "" } });
}

/** Renames a file, or a folder (every file under it). */
export async function renameEntry(studentId: string, projectId: string, fromRaw: string, toRaw: string) {
  await ownedProject(studentId, projectId);
  const from = validatePath(fromRaw);
  const to = validatePath(toRaw);
  if (from === to) return;
  await prisma.$transaction(async (tx) => {
    const file = await tx.workspaceFile.findUnique({ where: { projectId_path: { projectId, path: from } } });
    const clash = await tx.workspaceFile.findFirst({ where: { projectId, OR: [{ path: to }, { path: { startsWith: `${to}/` } }] } });
    if (clash) throw conflict("A file or folder with that name already exists.");
    if (file) {
      await tx.workspaceFile.update({ where: { id: file.id }, data: { path: to } });
      return;
    }
    const inside = await tx.workspaceFile.findMany({ where: { projectId, path: { startsWith: `${from}/` } } });
    if (inside.length === 0) throw notFound("File or folder");
    for (const f of inside) {
      await tx.workspaceFile.update({ where: { id: f.id }, data: { path: validatePath(to + f.path.slice(from.length)) } });
    }
  });
}

export async function deleteEntry(studentId: string, projectId: string, rawPath: string) {
  await ownedProject(studentId, projectId);
  const path = validatePath(rawPath);
  const res = await prisma.workspaceFile.deleteMany({ where: { projectId, OR: [{ path }, { path: { startsWith: `${path}/` } }] } });
  if (res.count === 0) throw notFound("File or folder");
}

export async function archiveProject(studentId: string, projectId: string) {
  await ownedProject(studentId, projectId);
  await prisma.workspaceProject.update({ where: { id: projectId }, data: { archivedAt: new Date() } });
}

/** Freezes the current files as a submission for review. */
export async function submitProject(student: CurrentUser, projectId: string, note: string | null) {
  const p = await ownedProject(student.id, projectId);
  const files = await prisma.workspaceFile.findMany({ where: { projectId }, select: { path: true, content: true } });
  if (files.length === 0) throw invalid("Add some files before submitting.");
  const snapshot: Record<string, string> = Object.fromEntries(files.map((f) => [f.path, f.content]));
  const totalBytes = files.reduce((s, f) => s + Buffer.byteLength(f.content), 0);
  if (p.briefId) {
    const brief = await getVisibleBrief(student.id, p.briefId);
    if (brief.status !== "PUBLISHED") throw conflict("This project is no longer accepting submissions.");
    const pending = await prisma.projectSubmission.findFirst({ where: { briefId: p.briefId, studentId: student.id, status: "SUBMITTED" } });
    if (pending) throw conflict("You already have a submission waiting for review for this project.");
  }
  const sub = await prisma.projectSubmission.create({
    data: {
      projectId,
      briefId: p.briefId,
      studentId: student.id,
      snapshot: snapshot as Prisma.InputJsonValue,
      fileCount: files.length,
      totalBytes,
      note: note?.trim().slice(0, 2000) || null,
    },
  });
  await notify(await activeAdminIds(), {
    type: "SUBMISSION_RECEIVED",
    title: `Project submitted by ${student.name}: ${p.name}`,
    link: `/portal/admin/projects/submissions/${sub.id}`,
    dedupeKey: `project-sub:${sub.id}`,
  });
  return sub;
}

export const projectReviewSchema = z.object({
  decision: z.enum(["REVIEWED", "RESUBMIT_REQUESTED"]),
  marks: z.coerce.number().min(0).nullable().default(null),
  feedback: z.string().trim().max(10_000).nullable().default(null),
});

export async function reviewProjectSubmission(adminId: string, id: string, input: z.infer<typeof projectReviewSchema>) {
  const sub = await prisma.projectSubmission.findUnique({ where: { id }, include: { brief: true, project: true } });
  if (!sub) throw notFound("Submission");
  if (input.decision === "REVIEWED" && input.marks !== null && sub.brief && input.marks > sub.brief.maxMarks) {
    throw invalid(`Marks cannot exceed ${sub.brief.maxMarks}.`);
  }
  if (input.decision === "RESUBMIT_REQUESTED" && !input.feedback) throw invalid("Explain what needs to change.");
  await prisma.$transaction(async (tx) => {
    await tx.projectSubmission.update({
      where: { id },
      data: { status: input.decision, marks: input.marks, feedback: input.feedback, reviewedById: adminId, reviewedAt: new Date() },
    });
    await audit({ actorId: adminId, action: "project.reviewed", entityType: "ProjectSubmission", entityId: id, metadata: { decision: input.decision, marks: input.marks } }, tx);
  });
  await notify([sub.studentId], {
    type: "FEEDBACK",
    title: input.decision === "REVIEWED" ? `Project reviewed: ${sub.project.name}` : `Changes requested: ${sub.project.name}`,
    link: `/portal/student/projects`,
    dedupeKey: `project-review:${id}:${Date.now()}`,
  });
}

/** Builds a .zip of a project (live files) or of a frozen submission. */
export async function buildZip(files: Record<string, string>) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(validatePath(path), content);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
