"use client";

import { Icon } from "./icons";
import type { RunState } from "./use-runner";

const STATUS_TEXT: Record<RunState["status"], string> = {
  QUEUED: "Queued",
  RUNNING: "Running…",
  COMPLETED: "Finished",
  CANCELLED: "Stopped",
  SERVICE_ERROR: "Runner unavailable",
};

/** Output, errors and resource usage for one run. */
export function RunOutput({ run, error, busy }: { run: RunState | null; error: string | null; busy: boolean }) {
  if (error) {
    return (
      <div className="alert alert--warn" role="alert">
        <Icon name="alert" />
        <div>{error}</div>
      </div>
    );
  }
  if (!run) return <p className="small muted">Run your code to see output here.</p>;
  const failed = run.verdict && !/accepted|wrong answer/i.test(run.verdict);
  return (
    <div className="stack stack--sm" aria-live="polite">
      <div className="row small">
        <strong>{STATUS_TEXT[run.status]}</strong>
        {run.verdict && run.status === "COMPLETED" && <span className={`badge ${failed ? "badge--warn" : "badge--ok"}`}>{/accepted|wrong answer/i.test(run.verdict) ? "Ran successfully" : run.verdict}</span>}
        {run.timeMs !== null && <span className="muted">{run.timeMs} ms</span>}
        {run.memoryKb !== null && <span className="muted">{(run.memoryKb / 1024).toFixed(1)} MB</span>}
        {run.exitCode !== null && run.exitCode !== 0 && <span className="muted">exit code {run.exitCode}</span>}
        {busy && <span className="muted">Waiting for the isolated runner…</span>}
      </div>
      {run.status === "SERVICE_ERROR" && (
        <div className="alert alert--warn">
          <Icon name="alert" />
          <div>{run.errorMessage ?? "The code runner is unavailable. This is not a problem with your code."}</div>
        </div>
      )}
      {run.status === "CANCELLED" && <p className="small muted">Stopped waiting. The runner ends the program at its time limit.</p>}
      {run.compileOutput && (
        <div>
          <span className="small" style={{ fontWeight: 700 }}>Compiler output</span>
          <pre className="codeblock" style={{ maxHeight: 220, color: "#FCA5A5" }}>{run.compileOutput}</pre>
        </div>
      )}
      {(run.stdout || run.status === "COMPLETED") && (
        <div>
          <span className="small" style={{ fontWeight: 700 }}>Output</span>
          <pre className="codeblock" style={{ maxHeight: 260 }}>{run.stdout || <span style={{ color: "#94A3B8" }}>(no output)</span>}</pre>
        </div>
      )}
      {run.stderr && (
        <div>
          <span className="small" style={{ fontWeight: 700 }}>Errors</span>
          <pre className="codeblock" style={{ maxHeight: 220, color: "#FCA5A5" }}>{run.stderr}</pre>
        </div>
      )}
    </div>
  );
}
