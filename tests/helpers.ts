import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/server/session";
import type { ExecLanguage, ExecRequest, ExecResult, ExecutionProvider, PollResult } from "@/server/execution";
import { ExecutionUnavailableError } from "@/server/execution";

export { prisma };

/** Empties every application table (keeps the migration history). */
export async function resetDb() {
  const rows = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (rows.length) await prisma.$executeRawUnsafe(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

const rid = () => randomBytes(8).toString("hex");

export async function makeUser(role: "ADMIN" | "STUDENT", name = role === "ADMIN" ? "Trainer" : "Student"): Promise<CurrentUser> {
  const id = rid();
  const email = `${name.toLowerCase().replace(/\s+/g, ".")}.${id}@example.test`;
  await prisma.user.create({ data: { id, name, email, role, emailVerified: true } });
  return { id, name, email, role };
}

export async function makeBatch(adminId: string, code = `B-${rid().slice(0, 6)}`) {
  return prisma.batch.create({ data: { name: `Batch ${code}`, code, createdById: adminId } });
}

export async function enrol(studentId: string, batchId: string, startDate = new Date(Date.now() - 30 * 86_400_000)) {
  return prisma.enrolment.create({ data: { studentId, batchId, startDate } });
}

export const minutes = (n: number) => n * 60_000;

/** Deterministic in-memory execution provider for tests (no real code is executed). */
export class FakeProvider implements ExecutionProvider {
  readonly name = "Fake";
  down = false;
  submissions: ExecRequest[] = [];
  private results = new Map<string, ExecResult>();
  constructor(private readonly judge: (req: ExecRequest) => Partial<ExecResult> = () => ({})) {}
  configured() {
    return true;
  }
  async languages(): Promise<ExecLanguage[]> {
    if (this.down) throw new ExecutionUnavailableError();
    return [
      { key: "71", name: "Python (3.8.1)", family: "python", editor: "python" },
      { key: "50", name: "C (GCC 9.2.0)", family: "c", editor: "c" },
      { key: "54", name: "C++ (GCC 9.2.0)", family: "cpp", editor: "cpp" },
    ];
  }
  async submit(req: ExecRequest) {
    if (this.down) throw new ExecutionUnavailableError();
    this.submissions.push(req);
    const token = rid();
    this.results.set(token, {
      outcome: "OK",
      verdict: "Accepted",
      stdout: "",
      stderr: "",
      compileOutput: "",
      exitCode: 0,
      timeMs: 5,
      memoryKb: 1000,
      ...this.judge(req),
    });
    return token;
  }
  async poll(token: string): Promise<PollResult> {
    if (this.down) throw new ExecutionUnavailableError();
    const r = this.results.get(token);
    if (!r) throw new ExecutionUnavailableError();
    return { done: true, result: r };
  }
}

/** A tiny "program": the fake judge evaluates `print-sum` code by adding the numbers in stdin. */
export function sumJudge(req: ExecRequest): Partial<ExecResult> {
  if (req.source.includes("while True")) return { outcome: "TIME_LIMIT", verdict: "Time Limit Exceeded", stdout: "" };
  if (req.source.includes("syntax error")) return { outcome: "COMPILE_ERROR", verdict: "Compilation Error", compileOutput: "error" };
  if (req.source.includes("print-sum")) {
    const nums = req.stdin.trim().split(/\s+/).map(Number);
    return { stdout: `${nums.reduce((a, b) => a + b, 0)}\n` };
  }
  return { stdout: "wrong\n" };
}

/** Creates a published, open test with MCQ, short-answer and coding questions. */
export async function makeOpenTest(adminId: string, batchId: string, opts: { durationMinutes?: number; closesInMinutes?: number; maxAttempts?: number; resultPolicy?: "MANUAL" | "AFTER_CLOSE" | "WHEN_GRADED" } = {}) {
  const now = Date.now();
  const a = await prisma.assessment.create({
    data: {
      title: "Test",
      instructions: "",
      status: "PUBLISHED",
      publishAt: new Date(now - minutes(5)),
      opensAt: new Date(now - minutes(5)),
      closesAt: new Date(now + minutes(opts.closesInMinutes ?? 120)),
      durationMinutes: opts.durationMinutes ?? 30,
      maxAttempts: opts.maxAttempts ?? 1,
      resultPolicy: opts.resultPolicy ?? "WHEN_GRADED",
      createdById: adminId,
      targets: { create: [{ batchId }] },
    },
  });
  const v = await prisma.assessmentVersion.create({ data: { assessmentId: a.id, number: 1, lockedAt: new Date() } });
  const mcq = await prisma.question.create({
    data: { versionId: v.id, order: 1, type: "MCQ_SINGLE", topic: "JS", prompt: "Pick b", marks: 2, options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctOptionIds: ["b"], solution: "B is right" },
  });
  const short = await prisma.question.create({ data: { versionId: v.id, order: 2, type: "SHORT_ANSWER", topic: "JS", prompt: "Explain", marks: 3 } });
  const coding = await prisma.question.create({
    data: {
      versionId: v.id,
      order: 3,
      type: "CODING",
      topic: "Algorithms",
      prompt: "Sum two numbers",
      marks: 5,
      allowedLanguages: ["71"],
      timeLimitMs: 1000,
      memoryLimitKb: 64000,
      scoring: "PROPORTIONAL",
      cases: {
        create: [
          { order: 1, isSample: true, input: "1 2\n", expectedOutput: "3\n", weight: 0 },
          { order: 2, isSample: false, input: "4071 2\n", expectedOutput: "4073\n", weight: 1 },
          { order: 3, isSample: false, input: "9100 23\n", expectedOutput: "9123\n", weight: 1 },
        ],
      },
    },
  });
  return { assessment: a, version: v, mcq, short, coding };
}
