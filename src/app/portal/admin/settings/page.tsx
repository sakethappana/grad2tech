import Link from "next/link";
import { Alert, Badge, Card, Empty, PageHead, Pager, Tabs } from "@/components/ui";
import { prisma } from "@/lib/db";
import { dt } from "@/lib/display";
import { env } from "@/lib/env";
import { emailConfigured } from "@/server/email";
import { availableLanguages } from "@/server/playground";
import { pageAdmin } from "@/server/session";

export const metadata = { title: "Settings" };

export default async function SettingsPage(props: PageProps<"/portal/admin/settings">) {
  await pageAdmin("/portal/admin/settings");
  const sp = await props.searchParams;
  const tab = sp.tab === "audit" ? "audit" : sp.tab === "team" ? "team" : "integrations";
  const tabs = [
    { key: "integrations", label: "Integrations", href: "/portal/admin/settings" },
    { key: "team", label: "Admins & trainers", href: "/portal/admin/settings?tab=team" },
    { key: "audit", label: "Audit log", href: "/portal/admin/settings?tab=audit" },
  ];
  return (
    <>
      <PageHead title="Settings" description="Service connections, admin accounts and the audit trail." />
      <Tabs items={tabs} current={tab} />
      {tab === "integrations" && <Integrations />}
      {tab === "team" && <Team />}
      {tab === "audit" && <Audit page={Math.max(1, Number(sp.page) || 1)} />}
    </>
  );
}

async function Integrations() {
  const e = env();
  const langs = await availableLanguages();
  const jobs = await prisma.$queryRawUnsafe<{ ok: number }[]>(`SELECT 1 AS ok FROM information_schema.schemata WHERE schema_name = 'pgboss'`).catch(() => []);
  const lastSweep = await prisma.attempt.findFirst({ where: { status: "AUTO_SUBMITTED" }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } });
  return (
    <div className="grid grid--2">
      <Card title="Code execution (Judge0)">
        <div className="stack stack--sm">
          {!langs.configured ? (
            <Alert tone="warn" title="Not configured.">
              Set JUDGE0_URL and credentials in the server environment. Playground runs and coding-question grading are unavailable until then; coding answers are kept and graded
              once it's connected.
            </Alert>
          ) : langs.error ? (
            <Alert tone="bad" title="Unreachable.">
              {langs.error}
            </Alert>
          ) : (
            <Alert tone="ok" title="Connected.">
              {langs.languages.length} languages available.
            </Alert>
          )}
          {langs.languages.length > 0 && (
            <ul className="list" style={{ border: "1px solid var(--line)", borderRadius: 10 }}>
              {langs.languages.map((l) => (
                <li key={l.key}>
                  <div className="list__main">{l.name}</div>
                  <code className="small">id {l.key}</code>
                </li>
              ))}
            </ul>
          )}
          <p className="small muted">
            Limits per playground run: {e.RUN_CPU_TIME_LIMIT_S}s CPU, {e.RUN_WALL_TIME_LIMIT_S}s wall-clock, {Math.round(e.RUN_MEMORY_LIMIT_KB / 1024)} MB memory. Quotas: {e.RUN_MAX_PER_MINUTE}/minute, {e.RUN_MAX_PER_DAY}/day,{" "}
            {e.RUN_MAX_CONCURRENT} concurrent per student.
          </p>
        </div>
      </Card>
      <Card title="Background worker">
        <div className="stack stack--sm">
          {jobs.length ? <Alert tone="ok">Job queue schema present. The worker grades code, finalises expired attempts and sends scheduled notifications.</Alert> : <Alert tone="warn">The worker has not started yet. Run it as a separate process (npm run worker).</Alert>}
          <p className="small muted">Last automatic attempt finalisation: {lastSweep ? dt(lastSweep.updatedAt) : "none yet"}.</p>
        </div>
      </Card>
      <Card title="Email">
        {emailConfigured() ? (
          <Alert tone="ok">SMTP configured. Invitations and reset links are emailed.</Alert>
        ) : (
          <Alert tone="info">Not configured. The portal works without it: invitation and reset links are shown to admins to share directly.</Alert>
        )}
      </Card>
      <Card title="File storage">
        <Alert tone={e.STORAGE_DRIVER === "s3" ? "ok" : "info"}>
          {e.STORAGE_DRIVER === "s3" ? `Private S3-compatible bucket "${e.S3_BUCKET}".` : `Local private directory "${e.STORAGE_LOCAL_DIR}" on the app server. Use S3-compatible storage in production.`} Uploads are limited to{" "}
          {Math.round(e.UPLOAD_MAX_BYTES / 1024 / 1024)} MB each.
        </Alert>
      </Card>
      <Card title="Full Stack Workspace">
        <Alert tone="info">
          Projects run in StackBlitz WebContainers inside each student&apos;s own browser (Chromium-based browsers and Firefox; Safari support is limited). {e.WEBCONTAINER_CLIENT_ID ? "A WebContainer client id is configured." : "Commercial production use requires a WebContainer API licence."}
        </Alert>
      </Card>
      <Card title="Time zone">
        <p>
          Times are stored in UTC and shown in <strong>{e.DISPLAY_TIMEZONE}</strong> with a timezone label.
        </p>
      </Card>
    </div>
  );
}

async function Team() {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true, suspendedAt: true, createdAt: true } });
  return (
    <div className="grid grid--main-side">
      <Card title="Admins and trainers" flush>
        <ul className="list">
          {admins.map((a) => (
            <li key={a.id}>
              <div className="list__main">
                <span className="list__title">{a.name}</span>
                <span className="list__meta">
                  {a.email} · since {dt(a.createdAt)}
                </span>
              </div>
              {a.suspendedAt ? <Badge tone="bad">Suspended</Badge> : <Badge tone="ok">Active</Badge>}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Add a trainer">
        <p className="small">
          Trainers are invited like students, with the account type set to Admin / trainer. There is no public admin sign-up. <Link href="/portal/admin/students">Open the invitation form</Link>.
        </p>
      </Card>
    </div>
  );
}

async function Audit({ page }: { page: number }) {
  const size = 50;
  const [total, events] = await Promise.all([
    prisma.auditEvent.count(),
    prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * size, take: size, include: { actor: { select: { name: true } } } }),
  ]);
  return (
    <Card title="Audit log" description="Publishing, grade changes, enrolment changes and account actions." flush>
      {events.length === 0 ? (
        <Empty icon="info" title="No events yet" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Who</th>
                <th scope="col">Action</th>
                <th scope="col">Record</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td className="nowrap small">{dt(ev.createdAt)}</td>
                  <td>{ev.actor?.name ?? "System"}</td>
                  <td>
                    <code className="small">{ev.action}</code>
                  </td>
                  <td className="small">
                    {ev.entityType} <span className="muted">{ev.entityId.slice(0, 10)}</span>
                  </td>
                  <td className="small muted" style={{ maxWidth: 320, overflowWrap: "anywhere" }}>
                    {ev.metadata ? JSON.stringify(ev.metadata) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pageSize={size} total={total} hrefFor={(p) => `/portal/admin/settings?tab=audit&page=${p}`} />
    </Card>
  );
}
