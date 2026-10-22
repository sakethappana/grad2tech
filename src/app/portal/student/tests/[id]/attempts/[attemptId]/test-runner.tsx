"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodeEditor } from "@/components/code-editor";
import { Icon } from "@/components/icons";
import { RunOutput } from "@/components/run-output";
import { useRunner } from "@/components/use-runner";

type Q = {
  id: string;
  type: "MCQ_SINGLE" | "MCQ_MULTI" | "SHORT_ANSWER" | "CODING";
  topic: string;
  prompt: string;
  promptHtml: React.ReactNode;
  marks: number;
  options: { id: string; text: string }[];
  inputFormat: string | null;
  outputFormat: string | null;
  constraints: string | null;
  starterCode: Record<string, string>;
  allowedLanguages: string[];
  samples: { input: string; expectedOutput: string }[];
  hiddenCaseCount: number;
  timeLimitMs: number | null;
  memoryLimitKb: number | null;
};
type Answer = { selectedOptionIds: string[]; textAnswer: string; code: string; languageKey: string | null };
type SaveState = "saved" | "unsaved" | "saving" | "error" | "offline";

const BACKUP_KEY = (id: string) => `g2t-attempt-backup:${id}`;

function readBackup(id: string): Record<string, Answer> {
  try {
    return JSON.parse(localStorage.getItem(BACKUP_KEY(id)) ?? "{}");
  } catch {
    return {};
  }
}
function writeBackup(id: string, data: Record<string, Answer>) {
  try {
    if (Object.keys(data).length) localStorage.setItem(BACKUP_KEY(id), JSON.stringify(data));
    else localStorage.removeItem(BACKUP_KEY(id));
  } catch {
    // storage unavailable: server autosave still works
  }
}
const same = (a: Answer, b: Answer) =>
  a.textAnswer === b.textAnswer && a.code === b.code && a.languageKey === b.languageKey && a.selectedOptionIds.slice().sort().join() === b.selectedOptionIds.slice().sort().join();

export function TestRunner({
  attemptId,
  title,
  deadlineAt,
  serverNow,
  questions,
  initialAnswers,
  languageNames,
}: {
  attemptId: string;
  title: string;
  deadlineAt: string;
  serverNow: string;
  questions: Q[];
  initialAnswers: Record<string, Answer & { savedAt: string | null }>;
  languageNames: Record<string, { name: string; editor: string }>;
}) {
  const router = useRouter();
  const [offset, setOffset] = useState(() => new Date(serverNow).getTime() - Date.now());
  const [deadline, setDeadline] = useState(() => new Date(deadlineAt).getTime());
  const [now, setNow] = useState(() => Date.now());
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    const base: Record<string, Answer> = {};
    for (const q of questions) {
      const a = initialAnswers[q.id];
      base[q.id] = {
        selectedOptionIds: a?.selectedOptionIds ?? [],
        textAnswer: a?.textAnswer ?? "",
        code: a?.code || (q.type === "CODING" ? (q.starterCode[q.allowedLanguages[0]] ?? "") : ""),
        languageKey: a?.languageKey ?? (q.type === "CODING" ? (q.allowedLanguages[0] ?? null) : null),
      };
    }
    return base;
  });
  const [status, setStatus] = useState<Record<string, SaveState>>({});
  const [restored, setRestored] = useState(false);
  const [locked, setLocked] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const serverCopy = useRef<Record<string, Answer>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inFlight = useRef<Record<string, Promise<void> | undefined>>({});
  const latest = useRef(answers);
  latest.current = answers;

  // Remember what the server has acknowledged; restore any unsaved local backup once.
  useEffect(() => {
    for (const q of questions) {
      const a = initialAnswers[q.id];
      serverCopy.current[q.id] = { selectedOptionIds: a?.selectedOptionIds ?? [], textAnswer: a?.textAnswer ?? "", code: a?.code ?? "", languageKey: a?.languageKey ?? null };
    }
    const backup = readBackup(attemptId);
    const pending = Object.entries(backup).filter(([qid, a]) => serverCopy.current[qid] && !same(a, serverCopy.current[qid]));
    if (pending.length) {
      setAnswers((prev) => ({ ...prev, ...Object.fromEntries(pending) }));
      setStatus((s) => ({ ...s, ...Object.fromEntries(pending.map(([qid]) => [qid, "unsaved" as SaveState])) }));
      setRestored(true);
      for (const [qid] of pending) queueSave(qid, 300);
    } else writeBackup(attemptId, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = Math.max(0, deadline - (now + offset));

  const save = useCallback(
    async (qid: string) => {
      const snapshot = latest.current[qid];
      if (!snapshot || locked) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setStatus((s) => ({ ...s, [qid]: "offline" }));
        return;
      }
      setStatus((s) => ({ ...s, [qid]: "saving" }));
      try {
        const res = await fetch(`/api/attempts/${attemptId}/answers`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId: qid, ...snapshot, languageKey: snapshot.languageKey ?? undefined }),
        });
        if (res.status === 401) {
          setStatus((s) => ({ ...s, [qid]: "error" }));
          setLocked("Your session has ended. Your answers are kept on this device — sign in again in a new tab, then return here.");
          return;
        }
        if (res.status === 409) {
          setLocked("Time is up or this attempt was already submitted. Your saved answers have been submitted.");
          setTimeout(() => router.refresh(), 1500);
          return;
        }
        if (!res.ok) throw new Error();
        serverCopy.current[qid] = snapshot;
        const changedSince = !same(latest.current[qid], snapshot);
        setStatus((s) => ({ ...s, [qid]: changedSince ? "unsaved" : "saved" }));
        const backup = readBackup(attemptId);
        if (!changedSince) delete backup[qid];
        writeBackup(attemptId, backup);
      } catch {
        setStatus((s) => ({ ...s, [qid]: "error" }));
      }
    },
    [attemptId, locked, router],
  );

  const queueSave = useCallback(
    (qid: string, delay = 900) => {
      clearTimeout(timers.current[qid]);
      timers.current[qid] = setTimeout(() => {
        const run = async () => {
          await inFlight.current[qid];
          await save(qid);
          if (!same(latest.current[qid], serverCopy.current[qid]) && !locked) queueSave(qid, 400);
        };
        inFlight.current[qid] = run();
      }, delay);
    },
    [save, locked],
  );

  const update = (qid: string, patch: Partial<Answer>, immediate = false) => {
    if (locked || expired) return;
    setAnswers((prev) => {
      const next = { ...prev, [qid]: { ...prev[qid], ...patch } };
      const backup = readBackup(attemptId);
      backup[qid] = next[qid];
      writeBackup(attemptId, backup);
      return next;
    });
    setStatus((s) => ({ ...s, [qid]: "unsaved" }));
    queueSave(qid, immediate ? 50 : 900);
  };

  // Re-sync the clock and retry pending saves after reconnecting or returning to the tab.
  const resync = useCallback(async () => {
    try {
      const res = await fetch(`/api/attempts/${attemptId}/state`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { serverNow: string; status: string; deadlineAt: string };
      setOffset(new Date(data.serverNow).getTime() - Date.now());
      setDeadline(new Date(data.deadlineAt).getTime());
      if (data.status !== "IN_PROGRESS") {
        setLocked("This attempt has been submitted.");
        router.refresh();
        return;
      }
      for (const qid of Object.keys(latest.current)) {
        if (!same(latest.current[qid], serverCopy.current[qid])) queueSave(qid, 100);
      }
    } catch {}
  }, [attemptId, queueSave, router]);

  useEffect(() => {
    const onOnline = () => resync();
    const onVis = () => document.visibilityState === "visible" && resync();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVis);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.values(status).some((s) => s !== "saved")) e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [resync, status]);

  const flush = useCallback(async () => {
    const pending = Object.keys(latest.current).filter((qid) => !same(latest.current[qid], serverCopy.current[qid]));
    for (const qid of pending) {
      clearTimeout(timers.current[qid]);
      await inFlight.current[qid];
      await save(qid);
    }
  }, [save]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    await flush();
    try {
      const res = await fetch(`/api/attempts/${attemptId}/submit`, { method: "POST" });
      if (res.ok || res.status === 409) {
        writeBackup(attemptId, {});
        router.refresh();
        return;
      }
      setSubmitting(false);
      setConfirming(false);
      alertMessage("Submission failed. Check your connection and try again — your answers are saved.");
    } catch {
      setSubmitting(false);
      alertMessage("Could not reach the server. Your saved answers are safe; try submitting again.");
    }
  }, [attemptId, flush, router]);

  const [notice, setNotice] = useState<string | null>(null);
  function alertMessage(m: string) {
    setNotice(m);
  }

  // At the deadline: final best-effort save, then the server finalises the attempt.
  useEffect(() => {
    if (remaining > 0 || expired) return;
    setExpired(true);
    (async () => {
      await flush().catch(() => {});
      await fetch(`/api/attempts/${attemptId}/submit`, { method: "POST" }).catch(() => {});
      writeBackup(attemptId, {});
      setTimeout(() => router.refresh(), 800);
    })();
  }, [remaining, expired, flush, attemptId, router]);

  const q = questions[current];
  const a = answers[q.id];
  const unsavedCount = Object.values(status).filter((s) => s === "unsaved" || s === "saving" || s === "error" || s === "offline").length;
  const answeredCount = questions.filter((x) => {
    const v = answers[x.id];
    return v.selectedOptionIds.length > 0 || v.textAnswer.trim() || (x.type === "CODING" && v.code.trim() && v.code !== (x.starterCode[v.languageKey ?? ""] ?? ""));
  }).length;
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const timeText = `${mins >= 60 ? `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}` : mins}:${String(secs).padStart(2, "0")}`;
  const lowTime = remaining < 5 * 60_000;
  const overall: SaveState = Object.values(status).includes("offline")
    ? "offline"
    : Object.values(status).includes("error")
      ? "error"
      : Object.values(status).includes("saving")
        ? "saving"
        : unsavedCount
          ? "unsaved"
          : "saved";
  const SAVE_TEXT: Record<SaveState, string> = {
    saved: "All answers saved",
    saving: "Saving…",
    unsaved: "Unsaved changes",
    error: "Couldn't save — retrying",
    offline: "Offline — kept on this device",
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div
        className="card"
        style={{ position: "sticky", top: 68, zIndex: 30, padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}
      >
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: "block" }}>{title}</strong>
          <span className="small muted">
            {answeredCount} of {questions.length} answered
          </span>
        </div>
        <div className="row">
          <span className={`badge ${overall === "saved" ? "badge--ok" : overall === "saving" ? "badge--info" : overall === "unsaved" ? "badge--muted" : "badge--warn"}`} role="status" aria-live="polite">
            {SAVE_TEXT[overall]}
          </span>
          <span
            className="num"
            role="timer"
            aria-label={`Time remaining ${mins} minutes`}
            style={{ fontWeight: 800, fontSize: "1.2rem", padding: "4px 12px", borderRadius: 8, background: lowTime ? "var(--bad-bg)" : "var(--muted-bg)", color: lowTime ? "var(--bad-fg)" : "var(--navy)" }}
          >
            <Icon name="clock" /> {timeText}
          </span>
          <button className="btn btn--primary" onClick={() => setConfirming(true)} disabled={submitting || expired || !!locked}>
            Submit test
          </button>
        </div>
      </div>

      {restored && (
        <div className="alert alert--info">
          <Icon name="info" />
          <div>We restored changes from this device that hadn&apos;t reached the server yet, and are saving them now.</div>
        </div>
      )}
      {locked && (
        <div className="alert alert--warn" role="alert">
          <Icon name="alert" />
          <div>{locked}</div>
        </div>
      )}
      {expired && !locked && (
        <div className="alert alert--warn" role="alert">
          <Icon name="clock" />
          <div>Time is up. Your saved answers are being submitted…</div>
        </div>
      )}
      {notice && (
        <div className="alert alert--bad" role="alert">
          <Icon name="alert" />
          <div>{notice}</div>
        </div>
      )}
      {confirming && (
        <div className="card" style={{ padding: 18, borderColor: "var(--teal)" }} role="alertdialog" aria-labelledby="confirm-title">
          <h2 id="confirm-title" style={{ fontSize: "1.1rem" }}>
            Submit your test?
          </h2>
          <p style={{ marginTop: 6 }}>
            You answered {answeredCount} of {questions.length} questions.
            {unsavedCount > 0 && " Unsaved changes will be saved first."} You can&apos;t change answers after submitting.
          </p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn--primary" onClick={submit} disabled={submitting}>
              {submitting ? "Submitting…" : "Yes, submit"}
            </button>
            <button className="btn btn--secondary" onClick={() => setConfirming(false)} disabled={submitting}>
              Keep working
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
        <nav aria-label="Questions" className="row" style={{ gap: 6 }}>
          {questions.map((x, i) => {
            const st = status[x.id];
            const v = answers[x.id];
            const answered = v.selectedOptionIds.length > 0 || v.textAnswer.trim() || (x.type === "CODING" && v.code.trim());
            return (
              <button
                key={x.id}
                className="btn btn--sm"
                onClick={() => setCurrent(i)}
                aria-current={i === current ? "step" : undefined}
                aria-label={`Question ${i + 1}${answered ? ", answered" : ""}${st && st !== "saved" ? ", not saved yet" : ""}`}
                style={{
                  minWidth: 40,
                  borderColor: i === current ? "var(--navy)" : "var(--line-strong)",
                  background: answered ? "var(--teal-wash)" : "#fff",
                  fontWeight: i === current ? 800 : 600,
                }}
              >
                {i + 1}
                {st && st !== "saved" && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: "var(--warn-fg)", display: "inline-block" }} />}
              </button>
            );
          })}
        </nav>

        <section className="card" aria-labelledby={`q-title-${q.id}`}>
          <div className="card__head">
            <h2 id={`q-title-${q.id}`}>
              Question {current + 1} of {questions.length}
            </h2>
            <span className="small muted">
              {q.topic} · {q.marks} {q.marks === 1 ? "mark" : "marks"} · {q.type === "MCQ_SINGLE" ? "choose one" : q.type === "MCQ_MULTI" ? "choose all that apply" : q.type === "SHORT_ANSWER" ? "written answer" : "coding"}
            </span>
          </div>
          <div className="card__body stack">
            {q.promptHtml}

            {(q.type === "MCQ_SINGLE" || q.type === "MCQ_MULTI") && (
              <fieldset disabled={!!locked || expired}>
                <legend className="sr-only">Options</legend>
                <div className="stack stack--sm">
                  {q.options.map((o) => {
                    const checked = a.selectedOptionIds.includes(o.id);
                    return (
                      <label key={o.id} className="check" style={{ padding: "12px 14px", border: `1px solid ${checked ? "var(--teal-ink)" : "var(--line)"}`, borderRadius: 10, background: checked ? "var(--teal-wash)" : "#fff" }}>
                        <input
                          type={q.type === "MCQ_SINGLE" ? "radio" : "checkbox"}
                          name={`q-${q.id}`}
                          checked={checked}
                          onChange={() =>
                            update(
                              q.id,
                              {
                                selectedOptionIds: q.type === "MCQ_SINGLE" ? [o.id] : checked ? a.selectedOptionIds.filter((x) => x !== o.id) : [...a.selectedOptionIds, o.id],
                              },
                              true,
                            )
                          }
                        />
                        <span style={{ fontWeight: 500 }}>{o.text}</span>
                      </label>
                    );
                  })}
                  {q.type === "MCQ_SINGLE" && a.selectedOptionIds.length > 0 && (
                    <div>
                      <button type="button" className="link-button small" onClick={() => update(q.id, { selectedOptionIds: [] }, true)}>
                        Clear selection
                      </button>
                    </div>
                  )}
                </div>
              </fieldset>
            )}

            {q.type === "SHORT_ANSWER" && (
              <div className="field">
                <label htmlFor={`ans-${q.id}`}>Your answer</label>
                <textarea id={`ans-${q.id}`} rows={8} value={a.textAnswer} maxLength={10000} onChange={(e) => update(q.id, { textAnswer: e.target.value })} disabled={!!locked || expired} />
              </div>
            )}

            {q.type === "CODING" && <CodingArea q={q} a={a} attemptId={attemptId} disabled={!!locked || expired} languageNames={languageNames} onChange={(patch) => update(q.id, patch)} />}

            <div className="row row--between">
              <button className="btn btn--secondary" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}>
                <Icon name="arrowLeft" /> Previous
              </button>
              <span className="small muted">{status[q.id] && status[q.id] !== "saved" ? SAVE_TEXT[status[q.id]] : "Saved"}</span>
              <button className="btn btn--secondary" onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))} disabled={current === questions.length - 1}>
                Next <Icon name="arrowRight" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function CodingArea({
  q,
  a,
  attemptId,
  disabled,
  languageNames,
  onChange,
}: {
  q: Q;
  a: Answer;
  attemptId: string;
  disabled: boolean;
  languageNames: Record<string, { name: string; editor: string }>;
  onChange: (p: Partial<Answer>) => void;
}) {
  const runner = useRunner();
  const [stdin, setStdin] = useState(q.samples[0]?.input ?? "");
  const lang = a.languageKey ?? q.allowedLanguages[0] ?? "";
  const editorLang = languageNames[lang]?.editor ?? "plaintext";
  const meta = useMemo(() => [q.inputFormat && ["Input format", q.inputFormat], q.outputFormat && ["Output format", q.outputFormat], q.constraints && ["Constraints", q.constraints]].filter(Boolean) as [string, string][], [q]);

  return (
    <div className="stack">
      {meta.length > 0 && (
        <dl className="dl">
          {meta.map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt>{k}</dt>
              <dd style={{ whiteSpace: "pre-wrap" }}>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {q.samples.length > 0 && (
        <div className="grid grid--2" style={{ gap: 12 }}>
          {q.samples.map((s, i) => (
            <div key={i} className="card" style={{ padding: 12 }}>
              <div className="row row--between small">
                <strong>Sample {i + 1}</strong>
                <button type="button" className="link-button small" onClick={() => setStdin(s.input)}>
                  Use as input
                </button>
              </div>
              <span className="small muted">Input</span>
              <pre className="codeblock" style={{ padding: 8 }}>{s.input || " "}</pre>
              <span className="small muted">Expected output</span>
              <pre className="codeblock" style={{ padding: 8 }}>{s.expectedOutput || " "}</pre>
            </div>
          ))}
        </div>
      )}
      <p className="small muted">
        {q.hiddenCaseCount} hidden test {q.hiddenCaseCount === 1 ? "case is" : "cases are"} used for grading after you submit. Limits: {q.timeLimitMs ?? 2000} ms per case, {Math.round((q.memoryLimitKb ?? 256000) / 1024)} MB memory.
      </p>
      <div className="row">
        <label htmlFor={`lang-${q.id}`} className="small" style={{ fontWeight: 700 }}>
          Language
        </label>
        <select
          id={`lang-${q.id}`}
          value={lang}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.value;
            const switchingFromStarter = !a.code.trim() || a.code === (q.starterCode[lang] ?? "");
            onChange({ languageKey: next, ...(switchingFromStarter ? { code: q.starterCode[next] ?? "" } : {}) });
          }}
          style={{ minHeight: 36, borderRadius: 8, border: "1px solid var(--line-strong)", padding: "4px 8px" }}
        >
          {q.allowedLanguages.map((k) => (
            <option key={k} value={k}>
              {languageNames[k]?.name ?? `Language ${k}`}
            </option>
          ))}
        </select>
      </div>
      <CodeEditor value={a.code} onChange={(v) => !disabled && onChange({ code: v })} language={editorLang} height={380} readOnly={disabled} path={`attempt-${q.id}`} ariaLabel={`Code for question`} />
      <div className="grid grid--2" style={{ gap: 12, alignItems: "start" }}>
        <div className="field">
          <label htmlFor={`stdin-${q.id}`}>Custom input</label>
          <textarea id={`stdin-${q.id}`} data-code="" rows={4} value={stdin} onChange={(e) => setStdin(e.target.value)} spellCheck={false} />
          <div className="row">
            <button type="button" className="btn btn--dark btn--sm" disabled={runner.busy || disabled || !a.code.trim()} onClick={() => runner.start({ languageKey: lang, code: a.code, stdin, attemptId, questionId: q.id })}>
              <Icon name="play" /> {runner.busy ? "Running…" : "Run"}
            </button>
            {runner.busy && (
              <button type="button" className="btn btn--secondary btn--sm" onClick={runner.cancel}>
                <Icon name="stop" /> Stop
              </button>
            )}
          </div>
          <span className="field__hint">Running code does not submit it. Your code is saved automatically.</span>
        </div>
        <RunOutput run={runner.run} error={runner.error} busy={runner.busy} />
      </div>
    </div>
  );
}
