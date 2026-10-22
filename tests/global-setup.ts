import { execSync } from "node:child_process";

/**
 * Applies pending migrations to the disposable test database before the suite runs.
 * (Non-destructive `migrate deploy`; each test empties the test tables itself.)
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  if (!/\/grad2tech_test(\?|$)/.test(url)) throw new Error("TEST_DATABASE_URL must point at the grad2tech_test database");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
