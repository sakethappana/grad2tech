# Grad2Tech — Training & Placement Platform

Grad2Tech (**Graduation to Technology**) runs a live Full Stack Development program. This repository contains:

- **Public website** at `/` — the approved marketing site (served unchanged from `public/site/`), now with a **Learning Portal** link in the header, mobile menu and footer.
- **Learning Portal** at `/portal` — admin/trainer and student portals with assignments, tests, a coding playground, a full-stack workspace, doubts, live classes, reports and notifications.

## Architecture

| Concern | Choice | Why |
| --- | --- | --- |
| Web app | Next.js 16 (App Router) + TypeScript | Server-rendered pages, Server Actions with built-in CSRF origin checks |
| Database | PostgreSQL 14+ via Prisma 7 (`@prisma/adapter-pg`) | Relational integrity, migrations, transactions |
| Auth | Better Auth (email + password, database sessions) | Maintained library; public sign-up disabled; role is a server-only field |
| Background jobs | pg-boss on the same PostgreSQL, separate worker process | Durable queue and cron without extra infrastructure |
| Code execution | Judge0 adapter (RapidAPI or self-hosted on an isolated host) | Student code never runs on the web server or worker |
| Full-stack workspace | StackBlitz WebContainers in the student's browser + sandboxed static previews | Real Node.js execution, isolated per student, on a separate origin |
| Files | Private storage adapter: local directory (dev) or S3-compatible bucket | Downloads only through permission-checked routes |
| Editor / charts | Monaco (served from our origin), Recharts | |

```
src/
  app/                 Next.js routes (portal pages, API route handlers, Server Actions)
  components/          Shared UI (shell, forms, charts, editor, test runner pieces)
  lib/                 env, db, auth config, time formatting
  server/              Domain services — every rule lives here:
    access.ts          batch-membership & ownership visibility rules
    assessments/       lifecycle, attempts (server-timed), grading, admin publishing/versions
    execution/         provider-neutral types + Judge0 adapter
    workspace/         project files, snapshots, starter templates
    assignments.ts, doubts.ts, classes.ts, people.ts, reports.ts, playground.ts, files.ts, storage.ts, audit.ts, notifications.ts, jobs.ts
worker/index.ts        pg-boss worker: grading, deadline finalisation, scheduled notices, reminders, cleanup
prisma/                schema, migrations, development-only seed
scripts/               local database, initial-admin setup, Monaco copy
tests/                 Vitest integration tests (real PostgreSQL)
e2e/                   Playwright browser tests (system Chrome)
public/site/           The approved public website
```

### Security model (summary)

- **Roles come from the database only.** The "Student / Admin login" choice is cosmetic; after sign-in the server redirects by stored role. `role` and `suspendedAt` are `input:false` fields in Better Auth, and the sign-up, update-user, delete-user and change-email endpoints are disabled.
- **Accounts are created only by invitation** (one-time, hashed tokens, 7-day expiry) or the initial-admin script. Applicants on the public site never get portal access.
- **Every page, Server Action, route handler and file download** calls `requireAdmin()` / `requireStudent()` and uses `server/access.ts` for batch-membership and ownership checks. Forbidden records return 404 so their existence isn't leaked.
- **Tests:** attempts are created on the server; the deadline is `min(close time, start + duration)`; autosaves after the deadline are rejected; expired attempts are finalised by the worker (and lazily on access); finalisation and grading are guarded by conditional updates and unique constraints, so duplicates can't double-grade. Published question sets are frozen; edits create a revision that only new attempts use.
- **Hidden data:** answer keys, solutions and hidden test cases are never selected into student responses. Hidden-case outputs are never stored; expected outputs are compared on the server and never sent to the runner.
- **Runner failures** set `EXECUTION_ERROR` (never "wrong"), are retried with backoff (bounded), and can be re-graded by admins.
- **Uploads:** allow-listed extensions, magic-byte checks for binaries, size limits, random storage keys, served with `nosniff`, a sandboxing CSP and `Content-Disposition`.
- **CSRF:** Server Actions check `Origin` (Next.js); JSON routes call `assertSameOrigin`; session cookies are `SameSite=Lax`.
- **Rate limits:** Better Auth limits sign-in/reset (database-backed); code runs have per-user per-minute, per-day and concurrency quotas.
- **Markdown** is rendered with raw HTML disabled and `rehype-sanitize`.
- **Audit trail** for publishing, grade changes, enrolment changes, account actions and exports.
- **Timestamps** are stored in UTC and shown in Asia/Kolkata with a timezone label.

## Local setup (Windows, macOS or Linux)

Requirements: Node.js 22+, ~2 GB free disk, and ~4 GB free memory for `next dev` / `next build`.

```bash
git clone https://github.com/sakethappana/grad2tech.git && cd grad2tech && git checkout platform
npm install                       # also generates the Prisma client and copies Monaco into public/monaco
cp .env.example .env              # then edit: LOCAL_PG_PASSWORD, DATABASE_URL, TEST_DATABASE_URL, BETTER_AUTH_SECRET
npm run db:local                  # terminal 1: local PostgreSQL (UTF-8) on port 5433, data in .data/postgres
npm run db:deploy                 # apply migrations to the dev database
npm run setup:admin -- --email you@example.com --name "Your Name"
npm run dev                       # terminal 2: http://localhost:3000
npm run worker                    # terminal 3: background jobs
```

Optional sample data for development only: `npm run seed:dev` (refuses to run against non-local databases; every record is labelled `[Dev sample]`; the password comes from `DEV_SEED_PASSWORD`).

### Connecting the code runner (Judge0)

1. Create a Judge0 CE subscription on RapidAPI and copy the key.
2. In `.env` set:
   ```
   JUDGE0_URL=https://judge0-ce.p.rapidapi.com
   JUDGE0_RAPIDAPI_KEY=<your key>
   JUDGE0_RAPIDAPI_HOST=judge0-ce.p.rapidapi.com
   ```
3. Restart `npm run dev` and `npm run worker`. **Settings → Integrations** lists the languages discovered from the provider.
4. Run the live checks: `npx vitest run tests/judge0.live.test.ts` (Python, C, C++ and an infinite-loop time limit).

For a self-hosted Judge0, run it on a **separate Linux host** (not the app server), restrict its network egress, set `AUTHN_TOKEN` there, and use `JUDGE0_URL` + `JUDGE0_AUTH_TOKEN` here. Judge0 enforces CPU/wall time, memory, process and file-size limits through `isolate`, with networking disabled per submission (`enable_network: false`).

### Full Stack Workspace

- **HTML/CSS/JS** projects preview in an `iframe sandbox="allow-scripts"` (opaque origin: no access to portal cookies, storage or parent APIs). Console output reaches the logs panel through `postMessage`, which the portal validates by source.
- **React, Node/Express and full-stack** projects run in a **WebContainer** inside the student's browser: `npm install`, then the start command; the running app opens from a `*.webcontainer-api.io` origin, separate from the portal. Each student's runtime is their own browser tab; it shuts down after 30 minutes of inactivity and on leaving the page. No portal secrets or databases are reachable from it.
- Requires cross-origin isolation (sent only on `/portal/student/workspace/*`) and a recent Chrome, Edge or Firefox on a laptop or desktop; the UI explains when a device can't run it. Files are saved to PostgreSQL either way and can be exported as a .zip.
- **Licensing:** WebContainers are free for prototypes and non-commercial use; production use by a for-profit company requires a commercial WebContainer API licence from StackBlitz. When you have one, set `WEBCONTAINER_CLIENT_ID`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run start:prod` | Apply migrations, then start (used in production) |
| `npm run worker` | Background worker (must run alongside the web app) |
| `npm run db:local` | Local embedded PostgreSQL for development and tests |
| `npm run db:migrate` | Create a new migration from schema changes (development) |
| `npm run db:deploy` | Apply migrations (production/CI) |
| `npm run setup:admin` | Create the first admin (refuses if one exists unless `--additional`) |
| `npm run seed:dev` | Development-only sample data |
| `npm run typecheck` | TypeScript check (`npx tsc --noEmit --singleThreaded` on low-memory machines) |
| `npm test` | Vitest integration suite against `TEST_DATABASE_URL` |
| `npm run test:e2e` | Playwright browser tests against a running dev server |

## Tests

`npm test` runs against the separate `grad2tech_test` database (migrations applied with `prisma migrate deploy`; each test empties the tables itself).

Latest run: **50 passed, 2 skipped** (the 2 skipped are the live Judge0 tests, which need a key). Coverage of the required workflows:

| # | Workflow | Test |
| --- | --- | --- |
| 1 | Admin invites a student and enrols them | `access.test.ts` — invitation → account with server role → enrolment; one-time token; sign-in works; no public sign-up |
| 2 | Student sees only authorised content | `access.test.ts` — batch-targeted visibility |
| 3 | Published work appears for the correct students | `access.test.ts`, `assessments.test.ts` — drafts/scheduled hidden, notifications only to targets |
| 4 | Save, refresh, resume, submit | `assessments.test.ts` — revisions acknowledged, reload restores answers, same attempt/timer |
| 5 | Server deadlines without the browser | `assessments.test.ts` — sweep auto-submits at the deadline; late saves rejected |
| 6 | No duplicate grades | `assessments.test.ts` — concurrent submits + duplicate job delivery grade once |
| 7 | Python, C, C++ execute in the isolated runner | `judge0.live.test.ts` (**needs Judge0 key**) |
| 8 | Infinite loop terminated | `judge0.live.test.ts` (**needs Judge0 key**); fake-runner path in `execution.test.ts` |
| 9 | Hidden data absent from student responses | `assessments.test.ts` |
| 10 | Doubt → reply → student notified | `doubts.test.ts` |
| 11 | Reviewed work updates reports | `reports.test.ts` |
| 12 | Project reopened, run, submitted | `workspace.test.ts` (save/reopen/submit snapshot); browser run in `e2e/portal.spec.ts` |
| 13 | Other students' records / admin endpoints rejected | `access.test.ts`, `assessments.test.ts`, `workspace.test.ts`, `e2e/portal.spec.ts` |
| 14 | Runner outages are recoverable and not marked wrong | `assessments.test.ts`, `execution.test.ts` |

## Deployment

Three processes are needed: **web**, **worker**, **PostgreSQL** (UTF-8), plus the external **Judge0** service and an S3-compatible **bucket**.

- **Render:** `render.yaml` (managed Postgres + web + worker). Set the `sync: false` secrets in the dashboard; give the worker the same `BETTER_AUTH_SECRET` as the web service.
- **Single VPS:** `docker compose up -d --build` with `docker-compose.yml` (Postgres + web + worker). Put HTTPS in front (Caddy, Nginx or a load balancer). WebContainers require HTTPS in production.
- **Any Node host:** `npm ci && npm run build`, then `npm run start:prod` (web) and `npm run worker` (worker).

Production checklist: `APP_URL` set to the HTTPS origin; strong `BETTER_AUTH_SECRET`; `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` when running more than one web instance; `STORAGE_DRIVER=s3` with a **private** bucket; Judge0 configured; the worker running; never run `seed:dev`.

The current GitHub Pages site (`main` branch) is the static website only. The portal needs a Node host as above; once deployed, point the domain at it (the public site is included at `/`).

## Backup and restore

Database (contains all academic records):

```bash
pg_dump --format=custom --no-owner "$DATABASE_URL" > grad2tech-$(date +%F).dump                 # backup
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" grad2tech-YYYY-MM-DD.dump    # restore
```

Run daily (managed Postgres providers also offer point-in-time recovery — enable it). Keep at least 7 daily and 4 weekly copies off the server, and test a restore into a scratch database regularly.

Files: enable versioning on the S3 bucket, or sync it (`aws s3 sync s3://bucket ./backup`). With local storage, back up `STORAGE_LOCAL_DIR` together with the database dump — file records and stored objects must match.

## External services and expected usage

| Service | Needed for | Notes / limits |
| --- | --- | --- |
| PostgreSQL | Everything | Render basic plan or any managed Postgres; ~1 GB is ample for early cohorts |
| Judge0 CE (RapidAPI) | Playground and coding questions | Free tier ≈ 50 submissions/day; each grading case is one submission (a 10-case question × 30 students ≈ 300). Use a paid plan or self-hosted Judge0 for real cohorts |
| S3-compatible storage (e.g. Cloudflare R2, AWS S3) | Attachments in production | Uploads limited to 10 MB each by default |
| StackBlitz WebContainers | Running Node projects in the workspace | Commercial licence required for for-profit production use |
| SMTP (optional) | Emailing invitations/reset links | Without it, admins copy one-time links from the portal |

## Status

**Implemented and verified by automated tests:** invitations and enrolment, roles and access boundaries, assignment publishing/scheduling/review, the test engine (server timing, autosave, deadlines, duplicate-safe finalisation and grading, frozen versions, hidden data), runner-outage handling, doubts, reports and metric definitions, workspace file storage and snapshots, CSV export, timezone handling.

**Implemented, awaiting service configuration:** real code execution (Judge0 key), email delivery (SMTP), production file storage (S3 bucket), WebContainer commercial licence for production.

**Not yet verified in a browser on the development machine:** the machine ran out of memory (`next dev` aborted while compiling the portal), so the portal pages and `e2e/portal.spec.ts` are type-checked but not yet exercised in Chrome. Run `npm run dev` and `npm run test:e2e` on a machine with ~4 GB free memory to complete that check.
