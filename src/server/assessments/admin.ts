import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { resolveTargetStudents } from "@/server/access";
import { audit } from "@/server/audit";
import { conflict, invalid, notFound } from "@/server/errors";
import { notify } from "@/server/notifications";
import { notifyVisibleResults } from "./grading";
import { assessmentPhase } from "./lifecycle";

export const assessmentSettingsSchema = z
  .object({
    title: z.string().trim().min(3, "Enter a title").max(150),
    instructions: z.string().trim().max(20_000).default(""),
    kind: z.enum(["PRACTICE", "WEEKLY"]),
    opensAt: z.date({ message: "Choose an opening time" }),
    closesAt: z.date({ message: "Choose a closing time" }),
    durationMinutes: z.coerce.number().int().min(1, "At least 1 minute").max(600),
    maxAttempts: z.coerce.number().int().min(1).max(20),
    passPercent: z.coerce.number().int().min(0).max(100).nullable(),
    randomizeQuestions: z.boolean(),
    resultPolicy: z.enum(["MANUAL", "AFTER_CLOSE", "WHEN_GRADED"]),
    solutionPolicy: z.enum(["NEVER", "WITH_RESULTS"]),
    helpPolicy: z.enum(["NO_HELP_WHILE_OPEN", "PRIVATE_CLARIFICATION", "ALLOWED"]),
    batchIds: z.array(z.string()).default([]),
    studentIds: z.array(z.string()).default([]),
  })
  .refine((v) => v.closesAt > v.opensAt, { message: "Closing time must be after opening time", path: ["closesAt"] })
  .refine((v) => v.batchIds.length + v.studentIds.length > 0, { message: "Choose at least one batch or student", path: ["batchIds"] });

export type AssessmentSettings = z.infer<typeof assessmentSettingsSchema>;

async function replaceTargets(tx: Tx, assessmentId: string, batchIds: string[], studentIds: string[]) {
  await tx.assessmentTarget.deleteMany({ where: { assessmentId } });
  const data = [
    ...[...new Set(batchIds)].map((batchId) => ({ assessmentId, batchId })),
    ...[...new Set(studentIds)].map((studentId) => ({ assessmentId, studentId })),
  ];
  if (data.length) await tx.assessmentTarget.createMany({ data });
}

export async function createAssessment(adminId: string, input: AssessmentSettings) {
  const { batchIds, studentIds, ...fields } = input;
  return prisma.$transaction(async (tx) => {
    const a = await tx.assessment.create({ data: { ...fields, createdById: adminId } });
    await tx.assessmentVersion.create({ data: { assessmentId: a.id, number: 1 } });
    await replaceTargets(tx, a.id, batchIds, studentIds);
    await audit({ actorId: adminId, action: "assessment.created", entityType: "Assessment", entityId: a.id }, tx);
    return a;
  });
}

/** Settings remain editable after publishing (e.g. extending the window); questions do not. */
export async function updateAssessmentSettings(adminId: string, id: string, input: AssessmentSettings) {
  const existing = await prisma.assessment.findUnique({ where: { id } });
  if (!existing) throw notFound("Test");
  const { batchIds, studentIds, ...fields } = input;
  await prisma.$transaction(async (tx) => {
    await tx.assessment.update({ where: { id }, data: fields });
    await replaceTargets(tx, id, batchIds, studentIds);
    await audit(
      {
        actorId: adminId,
        action: "assessment.updated",
        entityType: "Assessment",
        entityId: id,
        metadata: { opensAt: fields.opensAt.toISOString(), closesAt: fields.closesAt.toISOString(), durationMinutes: fields.durationMinutes },
      },
      tx,
    );
  });
}

/** The version admins edit: the latest version, which must be unlocked. */
export async function editableVersion(assessmentId: string, tx: Tx | typeof prisma = prisma) {
  const v = await tx.assessmentVersion.findFirst({ where: { assessmentId }, orderBy: { number: "desc" } });
  if (!v) throw notFound("Test version");
  if (v.lockedAt) throw conflict("Questions in a published version are frozen. Create a revision to change them.");
  return v;
}

const optionSchema = z.object({ id: z.string().min(1), text: z.string().trim().min(1, "Option text is required").max(1000) });
const caseSchema = z.object({
  isSample: z.boolean(),
  input: z.string().max(100_000),
  expectedOutput: z.string().max(100_000),
  weight: z.coerce.number().int().min(0).max(100).default(1),
});

export const questionSchema = z
  .object({
    type: z.enum(["MCQ_SINGLE", "MCQ_MULTI", "SHORT_ANSWER", "CODING"]),
    topic: z.string().trim().min(1, "Enter a topic").max(80),
    prompt: z.string().trim().min(1, "Enter the question").max(20_000),
    marks: z.coerce.number().positive("Marks must be greater than 0").max(1000),
    options: z.array(optionSchema).default([]),
    correctOptionIds: z.array(z.string()).default([]),
    solution: z.string().max(20_000).nullable().default(null),
    inputFormat: z.string().max(5000).nullable().default(null),
    outputFormat: z.string().max(5000).nullable().default(null),
    constraints: z.string().max(5000).nullable().default(null),
    starterCode: z.record(z.string(), z.string().max(20_000)).default({}),
    allowedLanguages: z.array(z.string()).default([]),
    timeLimitMs: z.coerce.number().int().min(100).max(15_000).nullable().default(null),
    memoryLimitKb: z.coerce.number().int().min(16_000).max(512_000).nullable().default(null),
    scoring: z.enum(["ALL_OR_NOTHING", "PROPORTIONAL"]).nullable().default(null),
    cases: z.array(caseSchema).max(50).default([]),
  })
  .superRefine((q, ctx) => {
    if (q.type === "MCQ_SINGLE" || q.type === "MCQ_MULTI") {
      if (q.options.length < 2) ctx.addIssue({ code: "custom", message: "Add at least two options", path: ["options"] });
      const ids = new Set(q.options.map((o) => o.id));
      if (q.correctOptionIds.length === 0) ctx.addIssue({ code: "custom", message: "Mark the correct option", path: ["correctOptionIds"] });
      if (q.correctOptionIds.some((id) => !ids.has(id))) ctx.addIssue({ code: "custom", message: "Correct option not found", path: ["correctOptionIds"] });
      if (q.type === "MCQ_SINGLE" && q.correctOptionIds.length > 1) {
        ctx.addIssue({ code: "custom", message: "Single-answer questions have exactly one correct option", path: ["correctOptionIds"] });
      }
    }
  });

export type QuestionInput = z.infer<typeof questionSchema>;

/** Extra requirements checked when a version is published (drafts may be incomplete). */
export function publishProblems(q: Pick<QuestionInput, "type" | "allowedLanguages"> & { cases: { isSample: boolean; weight: number }[] }): string | null {
  if (q.type !== "CODING") return null;
  if (q.allowedLanguages.length === 0) return "allow at least one language";
  if (!q.cases.some((c) => !c.isSample)) return "add at least one hidden grading case";
  if (q.cases.reduce((s, c) => s + c.weight, 0) <= 0) return "case weights must add up to more than 0";
  return null;
}

export const newOptionId = () => randomBytes(4).toString("hex");

function questionData(q: QuestionInput) {
  const coding = q.type === "CODING";
  const mcq = q.type === "MCQ_SINGLE" || q.type === "MCQ_MULTI";
  return {
    type: q.type,
    topic: q.topic,
    prompt: q.prompt,
    marks: q.marks,
    options: mcq ? (q.options as Prisma.InputJsonValue) : undefined,
    correctOptionIds: mcq ? q.correctOptionIds : [],
    solution: q.solution,
    inputFormat: coding ? q.inputFormat : null,
    outputFormat: coding ? q.outputFormat : null,
    constraints: coding ? q.constraints : null,
    starterCode: coding ? (q.starterCode as Prisma.InputJsonValue) : undefined,
    allowedLanguages: coding ? q.allowedLanguages : [],
    timeLimitMs: coding ? (q.timeLimitMs ?? 2000) : null,
    memoryLimitKb: coding ? (q.memoryLimitKb ?? 256_000) : null,
    scoring: coding ? (q.scoring ?? "PROPORTIONAL") : null,
  };
}

export async function upsertQuestion(adminId: string, assessmentId: string, questionId: string | null, input: QuestionInput) {
  return prisma.$transaction(async (tx) => {
    const version = await editableVersion(assessmentId, tx);
    let id = questionId;
    if (id) {
      const existing = await tx.question.findFirst({ where: { id, versionId: version.id } });
      if (!existing) throw notFound("Question");
      await tx.question.update({ where: { id }, data: questionData(input) });
      await tx.codingCase.deleteMany({ where: { questionId: id } });
    } else {
      const last = await tx.question.findFirst({ where: { versionId: version.id }, orderBy: { order: "desc" } });
      const created = await tx.question.create({ data: { ...questionData(input), versionId: version.id, order: (last?.order ?? 0) + 1 } });
      id = created.id;
    }
    if (input.type === "CODING" && input.cases.length) {
      await tx.codingCase.createMany({
        data: input.cases.map((c, i) => ({ questionId: id!, order: i + 1, isSample: c.isSample, input: c.input, expectedOutput: c.expectedOutput, weight: c.weight })),
      });
    }
    await audit({ actorId: adminId, action: "assessment.updated", entityType: "Assessment", entityId: assessmentId, metadata: { questionId: id } }, tx);
    return id!;
  });
}

export async function deleteQuestion(adminId: string, assessmentId: string, questionId: string) {
  await prisma.$transaction(async (tx) => {
    const version = await editableVersion(assessmentId, tx);
    const q = await tx.question.findFirst({ where: { id: questionId, versionId: version.id } });
    if (!q) throw notFound("Question");
    await tx.question.delete({ where: { id: questionId } });
    // Re-number remaining questions to keep order contiguous.
    const rest = await tx.question.findMany({ where: { versionId: version.id }, orderBy: { order: "asc" } });
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].order !== i + 1) await tx.question.update({ where: { id: rest[i].id }, data: { order: -(i + 1) } });
    }
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].order !== i + 1) await tx.question.update({ where: { id: rest[i].id }, data: { order: i + 1 } });
    }
    await audit({ actorId: adminId, action: "assessment.updated", entityType: "Assessment", entityId: assessmentId, metadata: { deletedQuestion: questionId } }, tx);
  });
}

async function assertVersionReady(versionId: string) {
  const qs = await prisma.question.findMany({ where: { versionId }, include: { cases: true } });
  if (qs.length === 0) throw invalid("Add at least one question before publishing.");
  for (const q of qs) {
    const parsed = questionSchema.safeParse({
      ...q,
      options: (q.options as unknown[]) ?? [],
      starterCode: (q.starterCode as Record<string, string>) ?? {},
      cases: q.cases,
    });
    if (!parsed.success) throw invalid(`Question ${q.order} is incomplete: ${parsed.error.issues[0]?.message}`);
    const problem = publishProblems(q);
    if (problem) throw invalid(`Question ${q.order} is incomplete: ${problem}.`);
  }
}

/** Publishes the test (immediately or at publishAt). Freezes the current question version. */
export async function publishAssessment(adminId: string, id: string, publishAt: Date | null, now = new Date()) {
  const a = await prisma.assessment.findUnique({ where: { id }, include: { targets: true } });
  if (!a) throw notFound("Test");
  if (a.status !== "DRAFT") throw conflict("Only draft tests can be published.");
  if (a.closesAt <= now) throw invalid("The closing time is in the past. Update the schedule first.");
  if (a.targets.length === 0) throw invalid("Choose at least one batch or student.");
  const version = await editableVersion(id);
  await assertVersionReady(version.id);
  const when = publishAt && publishAt > now ? publishAt : now;
  await prisma.$transaction(async (tx) => {
    await tx.assessmentVersion.update({ where: { id: version.id }, data: { lockedAt: now } });
    await tx.assessment.update({ where: { id }, data: { status: "PUBLISHED", publishAt: when } });
    await audit({ actorId: adminId, action: "assessment.published", entityType: "Assessment", entityId: id, metadata: { publishAt: when.toISOString(), version: version.number } }, tx);
  });
  if (when <= now) await notifyAssessmentPublished(id);
}

export async function notifyAssessmentPublished(id: string) {
  const a = await prisma.assessment.findUnique({ where: { id }, include: { targets: true } });
  if (!a || a.status !== "PUBLISHED" || a.notifiedAt) return;
  const students = await resolveTargetStudents(a.targets);
  await notify(students, {
    type: "TEST_PUBLISHED",
    title: `New ${a.kind === "WEEKLY" ? "weekly examination" : "practice test"}: ${a.title}`,
    link: `/portal/student/tests/${a.id}`,
    dedupeKey: `test-published:${a.id}`,
  });
  await prisma.assessment.update({ where: { id }, data: { notifiedAt: new Date() } });
}

/** Copies the latest locked version into a new editable revision. Ongoing attempts keep their version. */
export async function createRevision(adminId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const latest = await tx.assessmentVersion.findFirst({
      where: { assessmentId: id },
      orderBy: { number: "desc" },
      include: { questions: { include: { cases: true }, orderBy: { order: "asc" } } },
    });
    if (!latest) throw notFound("Test");
    if (!latest.lockedAt) return latest;
    const v = await tx.assessmentVersion.create({ data: { assessmentId: id, number: latest.number + 1 } });
    for (const q of latest.questions) {
      const { id: _qid, versionId: _v, cases, options, starterCode, ...rest } = q;
      const nq = await tx.question.create({
        data: {
          ...rest,
          versionId: v.id,
          options: (options ?? undefined) as Prisma.InputJsonValue | undefined,
          starterCode: (starterCode ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      if (cases.length) {
        await tx.codingCase.createMany({
          data: cases.map((c) => ({ questionId: nq.id, order: c.order, isSample: c.isSample, input: c.input, expectedOutput: c.expectedOutput, weight: c.weight })),
        });
      }
    }
    await audit({ actorId: adminId, action: "assessment.revision_created", entityType: "Assessment", entityId: id, metadata: { version: v.number } }, tx);
    return v;
  });
}

/** Locks a revision so new attempts use it. Attempts already started keep their original version. */
export async function publishRevision(adminId: string, id: string) {
  const a = await prisma.assessment.findUnique({ where: { id } });
  if (!a) throw notFound("Test");
  if (a.status !== "PUBLISHED") throw conflict("Publish the test first.");
  const version = await editableVersion(id);
  await assertVersionReady(version.id);
  await prisma.$transaction(async (tx) => {
    await tx.assessmentVersion.update({ where: { id: version.id }, data: { lockedAt: new Date() } });
    await audit({ actorId: adminId, action: "assessment.revision_published", entityType: "Assessment", entityId: id, metadata: { version: version.number } }, tx);
  });
}

export async function discardRevision(adminId: string, id: string) {
  const version = await editableVersion(id);
  if (version.number === 1) throw conflict("The first version cannot be discarded. Delete questions instead.");
  await prisma.$transaction(async (tx) => {
    await tx.assessmentVersion.delete({ where: { id: version.id } });
    await audit({ actorId: adminId, action: "assessment.updated", entityType: "Assessment", entityId: id, metadata: { discardedVersion: version.number } }, tx);
  });
}

export async function cancelAssessment(adminId: string, id: string) {
  const a = await prisma.assessment.findUnique({ where: { id } });
  if (!a) throw notFound("Test");
  if (a.status === "CANCELLED") return;
  await prisma.$transaction(async (tx) => {
    await tx.assessment.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit({ actorId: adminId, action: "assessment.cancelled", entityType: "Assessment", entityId: id }, tx);
  });
}

export async function releaseResults(adminId: string, id: string, now = new Date()) {
  const a = await prisma.assessment.findUnique({ where: { id } });
  if (!a) throw notFound("Test");
  const phase = assessmentPhase(a, now);
  // Releasing earlier could reveal answers to students who have not attempted the test yet.
  if (phase !== "CLOSED") throw conflict("Results can be released after the test closes.");
  await prisma.$transaction(async (tx) => {
    await tx.assessment.update({ where: { id }, data: { resultsReleasedAt: now } });
    await audit({ actorId: adminId, action: "assessment.results_released", entityType: "Assessment", entityId: id }, tx);
  });
  return notifyVisibleResults(id, now);
}
