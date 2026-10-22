"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RunState = {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "CANCELLED" | "SERVICE_ERROR";
  verdict: string | null;
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  exitCode: number | null;
  timeMs: number | null;
  memoryKb: number | null;
  errorMessage: string | null;
};

/** Starts a run through the API and polls until it finishes. Never executes code in the browser or web server. */
export function useRunner() {
  const [run, setRun] = useState<RunState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef<string | null>(null);

  const stopPolling = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stopPolling, []);

  const poll = useCallback(async (id: string, delay = 600) => {
    timer.current = setTimeout(async () => {
      if (active.current !== id) return;
      try {
        const res = await fetch(`/api/playground/runs/${id}`, { cache: "no-store" });
        if (res.status === 401) {
          setError("Your session has ended. Sign in again to run code.");
          setBusy(false);
          return;
        }
        const data = (await res.json()) as RunState & { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Could not check the run.");
          setBusy(false);
          return;
        }
        setRun(data);
        if (data.status === "QUEUED" || data.status === "RUNNING") poll(id, Math.min(delay * 1.4, 2500));
        else setBusy(false);
      } catch {
        // Network blip: keep polling a little slower.
        poll(id, 2500);
      }
    }, delay);
  }, []);

  const start = useCallback(
    async (body: { languageKey: string; code: string; stdin: string; attemptId?: string | null; questionId?: string | null }) => {
      stopPolling();
      setError(null);
      setRun(null);
      setBusy(true);
      try {
        const res = await fetch("/api/playground/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = (await res.json()) as { id?: string; status?: string; errorMessage?: string | null; error?: string };
        if (!res.ok || !data.id) {
          setError(data.errorMessage ?? data.error ?? "The code runner is unavailable right now. Your code is saved — try again shortly.");
          setBusy(false);
          return;
        }
        active.current = data.id;
        setRun({ id: data.id, status: "RUNNING", verdict: null, stdout: null, stderr: null, compileOutput: null, exitCode: null, timeMs: null, memoryKb: null, errorMessage: null });
        poll(data.id);
      } catch {
        setError("Could not reach the server. Check your connection and try again.");
        setBusy(false);
      }
    },
    [poll],
  );

  const cancel = useCallback(async () => {
    const id = active.current;
    stopPolling();
    active.current = null;
    setBusy(false);
    if (!id) return;
    setRun((r) => (r ? { ...r, status: "CANCELLED" } : r));
    await fetch(`/api/playground/runs/${id}/cancel`, { method: "POST" }).catch(() => {});
  }, []);

  return { run, error, busy, start, cancel };
}
