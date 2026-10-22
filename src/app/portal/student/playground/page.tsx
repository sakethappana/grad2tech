import { Badge, Card, Empty, PageHead } from "@/components/ui";
import { dt } from "@/lib/display";
import { env } from "@/lib/env";
import { runHistory } from "@/server/playground";
import { pageStudent } from "@/server/session";
import { Playground } from "./playground";

export const metadata = { title: "Coding Playground" };

const STATUS = { QUEUED: ["Queued", "info"], RUNNING: ["Running", "info"], COMPLETED: ["Finished", "ok"], CANCELLED: ["Stopped", "muted"], SERVICE_ERROR: ["Runner unavailable", "warn"] } as const;

export default async function PlaygroundPage() {
  const me = await pageStudent("/portal/student/playground");
  const history = await runHistory(me.id, 15);
  const e = env();
  return (
    <>
      <PageHead
        title="Coding Playground"
        description={`Write and run programs in an isolated sandbox. Each run is limited to ${e.RUN_CPU_TIME_LIMIT_S}s of CPU time and ${Math.round(e.RUN_MEMORY_LIMIT_KB / 1024)} MB of memory. Drafts save automatically for each language.`}
      />
      <div className="stack">
        <Playground />
        <Card title="Recent runs" description={`The last ${e.RUN_HISTORY_KEEP} runs are kept for ${e.RUN_HISTORY_DAYS} days.`} flush>
          {history.length === 0 ? (
            <Empty icon="code" title="No runs yet" />
          ) : (
            <ul className="list">
              {history.map((r) => (
                <li key={r.id}>
                  <div className="list__main">
                    <span className="list__title">{r.languageLabel}</span>
                    <span className="list__meta">
                      {dt(r.createdAt)}
                      {r.timeMs !== null ? ` · ${r.timeMs} ms` : ""}
                      {r.memoryKb !== null ? ` · ${(r.memoryKb / 1024).toFixed(1)} MB` : ""}
                      {r.verdict && !/accepted|wrong answer/i.test(r.verdict) ? ` · ${r.verdict}` : ""}
                    </span>
                  </div>
                  <Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
