/**
 * Creates the first admin account. There is no public admin sign-up.
 *
 *   npm run setup:admin -- --email you@example.com --name "Your Name"
 *
 * The password is read from SETUP_ADMIN_PASSWORD if set, otherwise prompted for (not echoed).
 * Refuses to run when an admin already exists, unless --additional is passed.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import readline from "node:readline";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "../src/lib/db";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function promptHidden(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = rl as unknown as { _writeToOutput?: (s: string) => void; output: NodeJS.WriteStream };
  let muted = false;
  out._writeToOutput = (s: string) => {
    if (!muted) out.output.write(s);
  };
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) {
    console.error('Usage: npm run setup:admin -- --email you@example.com --name "Your Name" [--additional]');
    process.exit(1);
  }
  const existingAdmins = await prisma.user.count({ where: { role: "ADMIN" } });
  if (existingAdmins > 0 && !process.argv.includes("--additional")) {
    console.error("An admin already exists. Invite more trainers from Students → Invite (account type: Admin / trainer), or pass --additional.");
    process.exit(1);
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    console.error("A user with that email already exists.");
    process.exit(1);
  }
  let password = process.env.SETUP_ADMIN_PASSWORD ?? "";
  if (!password) {
    password = await promptHidden("Password (min 10 characters): ");
    const confirm = await promptHidden("Confirm password: ");
    if (password !== confirm) {
      console.error("Passwords do not match.");
      process.exit(1);
    }
  }
  if (password.length < 10 || password.length > 128) {
    console.error("Password must be 10–128 characters.");
    process.exit(1);
  }

  const id = randomBytes(16).toString("hex");
  await prisma.$transaction(async (tx) => {
    await tx.user.create({ data: { id, name, email, emailVerified: true, role: "ADMIN" } });
    await tx.account.create({
      data: { id: randomBytes(16).toString("hex"), accountId: id, providerId: "credential", userId: id, password: await hashPassword(password) },
    });
    await tx.auditEvent.create({ data: { actorId: null, action: "user.admin_created", entityType: "User", entityId: id, metadata: { via: "setup-admin script" } } });
  });
  console.log(`Admin account created for ${email}. Sign in at ${process.env.APP_URL ?? "http://localhost:3000"}/portal/login`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
