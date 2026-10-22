/**
 * DEVELOPMENT-ONLY sample data. Never run against production.
 *
 *   npm run seed:dev
 *
 * Every record is labelled "[Dev sample]" or uses the reserved .test email domain.
 * Passwords come from DEV_SEED_PASSWORD, or a random one is generated and printed once.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "../src/lib/db";

const url = process.env.DATABASE_URL ?? "";
if (process.env.NODE_ENV === "production" || !/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  console.error("Refusing to seed: development seed data only runs against a local database (localhost) outside production.");
  process.exit(1);
}

const id = () => randomBytes(16).toString("hex");
const hours = (h: number) => new Date(Date.now() + h * 3600_000);

async function user(email: string, name: string, role: "ADMIN" | "STUDENT", passwordHash: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const uid = id();
  const u = await prisma.user.create({ data: { id: uid, email, name, role, emailVerified: true } });
  await prisma.account.create({ data: { id: id(), accountId: uid, providerId: "credential", userId: uid, password: passwordHash } });
  if (role === "STUDENT") await prisma.studentProfile.create({ data: { userId: uid, background: "[Dev sample] Recent graduate" } });
  return u;
}

async function main() {
  if (await prisma.batch.findUnique({ where: { code: "DEV-SAMPLE" } })) {
    console.log("Dev sample data already present. Nothing to do.");
    return;
  }
  const password = process.env.DEV_SEED_PASSWORD || randomBytes(9).toString("base64url");
  const hash = await hashPassword(password);

  const admin = await user("trainer@grad2tech.test", "Dev Sample Trainer", "ADMIN", hash);
  const s1 = await user("student.one@grad2tech.test", "Dev Sample Student One", "STUDENT", hash);
  const s2 = await user("student.two@grad2tech.test", "Dev Sample Student Two", "STUDENT", hash);

  const batch = await prisma.batch.create({
    data: { name: "[Dev sample] Full Stack batch", code: "DEV-SAMPLE", description: "Development sample data — not real students.", startDate: hours(-24 * 14), createdById: admin.id },
  });
  for (const s of [s1, s2]) await prisma.enrolment.create({ data: { studentId: s.id, batchId: batch.id, startDate: hours(-24 * 14), changedById: admin.id } });

  await prisma.assignment.create({
    data: {
      title: "[Dev sample] Build a responsive profile card",
      instructions: "Create a responsive profile card using **HTML and CSS**.\n\n- Use Flexbox\n- Make it readable at 375px\n- Submit your code or a link",
      topic: "HTML & CSS",
      difficulty: "EASY",
      status: "PUBLISHED",
      publishAt: hours(-2),
      notifiedAt: hours(-2),
      dueAt: hours(30),
      allowLate: true,
      maxMarks: 10,
      responseTypes: ["TEXT", "CODE", "LINK"],
      createdById: admin.id,
      targets: { create: [{ batchId: batch.id }] },
    },
  });

  const test = await prisma.assessment.create({
    data: {
      title: "[Dev sample] JavaScript basics practice",
      instructions: "A short practice test. Answers save automatically.",
      kind: "PRACTICE",
      status: "PUBLISHED",
      publishAt: hours(-1),
      notifiedAt: hours(-1),
      opensAt: hours(-1),
      closesAt: hours(48),
      durationMinutes: 30,
      maxAttempts: 2,
      passPercent: 50,
      resultPolicy: "WHEN_GRADED",
      solutionPolicy: "WITH_RESULTS",
      helpPolicy: "PRIVATE_CLARIFICATION",
      createdById: admin.id,
      targets: { create: [{ batchId: batch.id }] },
    },
  });
  const version = await prisma.assessmentVersion.create({ data: { assessmentId: test.id, number: 1, lockedAt: new Date() } });
  await prisma.question.create({
    data: {
      versionId: version.id,
      order: 1,
      type: "MCQ_SINGLE",
      topic: "JavaScript",
      prompt: "Which keyword declares a block-scoped variable that can be reassigned?",
      marks: 2,
      options: [
        { id: "o1", text: "var" },
        { id: "o2", text: "let" },
        { id: "o3", text: "const" },
      ],
      correctOptionIds: ["o2"],
      solution: "`let` is block-scoped and can be reassigned; `const` cannot be reassigned.",
    },
  });
  await prisma.question.create({
    data: {
      versionId: version.id,
      order: 2,
      type: "SHORT_ANSWER",
      topic: "JavaScript",
      prompt: "In one or two sentences, explain what a Promise represents.",
      marks: 3,
      solution: "A Promise represents the eventual result (or failure) of an asynchronous operation.",
    },
  });
  await prisma.question.create({
    data: {
      versionId: version.id,
      order: 3,
      type: "CODING",
      topic: "Problem solving",
      prompt: "Read two integers on one line and print their sum.",
      inputFormat: "Two integers a and b separated by a space.",
      outputFormat: "A single integer: a + b.",
      constraints: "-10^9 ≤ a, b ≤ 10^9",
      marks: 5,
      allowedLanguages: [],
      timeLimitMs: 2000,
      memoryLimitKb: 128000,
      scoring: "PROPORTIONAL",
      cases: {
        create: [
          { order: 1, isSample: true, input: "2 3\n", expectedOutput: "5\n", weight: 0 },
          { order: 2, isSample: false, input: "-4 10\n", expectedOutput: "6\n", weight: 1 },
          { order: 3, isSample: false, input: "1000000000 1000000000\n", expectedOutput: "2000000000\n", weight: 1 },
        ],
      },
    },
  });

  await prisma.classSession.create({
    data: {
      batchId: batch.id,
      topic: "[Dev sample] Async JavaScript and fetch",
      instructorId: admin.id,
      startsAt: hours(20),
      durationMinutes: 90,
      meetingUrl: "https://meet.example.com/dev-sample",
      resources: "- [MDN: Using promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises)",
      createdById: admin.id,
    },
  });

  await prisma.announcement.create({ data: { title: "[Dev sample] Welcome to the portal", body: "This is development sample data.", batchId: batch.id, authorId: admin.id } });

  console.log("Development sample data created (labelled [Dev sample]).");
  console.log("Accounts: trainer@grad2tech.test, student.one@grad2tech.test, student.two@grad2tech.test");
  if (!process.env.DEV_SEED_PASSWORD) console.log(`Shared dev password (shown once): ${password}`);
  console.log("Note: the coding question allows no languages until the code runner is configured; edit it via a test revision to choose languages.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
