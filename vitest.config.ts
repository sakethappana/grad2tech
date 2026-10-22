import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnv();

// Tests always run against the disposable TEST_DATABASE_URL, never the development database.
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error("Set TEST_DATABASE_URL in .env to run the test suite.");

export default defineConfig({
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    env: {
      DATABASE_URL: testDb,
      NODE_ENV: "test",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_DIR: ".data/test-storage",
      // Real Judge0 settings are kept only for the opt-in integration test (tests/judge0.live.test.ts).
      JUDGE0_URL: process.env.JUDGE0_URL ?? "",
    },
    // One database: run files one at a time.
    fileParallelism: false,
    pool: "forks",
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
