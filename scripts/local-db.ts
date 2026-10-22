/**
 * Runs a local PostgreSQL server for development and tests (no system install needed).
 * Data lives in LOCAL_PG_DIR (default .data/postgres). Stop with Ctrl+C.
 *
 *   npm run db:local
 */
import "dotenv/config";
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const port = Number(process.env.LOCAL_PG_PORT ?? 5433);
const password = process.env.LOCAL_PG_PASSWORD;
const dir = path.resolve(process.env.LOCAL_PG_DIR ?? ".data/postgres");

if (!password) {
  console.error("Set LOCAL_PG_PASSWORD in .env before starting the local database.");
  process.exit(1);
}

const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "postgres",
  password,
  port,
  persistent: true,
  // Always UTF-8 (Windows would otherwise default to WIN1252 and reject non-Latin text).
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
});

async function main() {
  const fresh = !existsSync(path.join(dir, "PG_VERSION"));
  if (fresh) {
    console.log(`Initialising PostgreSQL cluster in ${dir}`);
    await pg.initialise();
  }
  await pg.start();
  for (const name of ["grad2tech_dev", "grad2tech_test"]) {
    try {
      await pg.createDatabase(name);
      console.log(`Created database ${name}`);
    } catch {
      // already exists
    }
  }
  console.log(`PostgreSQL ready on port ${port}. Press Ctrl+C to stop.`);

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await pg.stop();
  } catch {}
  process.exit(1);
});
