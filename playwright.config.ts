import { defineConfig } from "@playwright/test";

/**
 * Browser end-to-end tests. Uses the locally installed Google Chrome (no browser download).
 * Start the database (npm run db:local) and app (npm run dev) first, with dev seed data loaded.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    channel: "chrome",
    trace: "retain-on-failure",
    viewport: { width: 1366, height: 860 },
  },
});
