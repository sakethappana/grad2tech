"use client";

import type { WebContainer, WebContainerProcess } from "@webcontainer/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodeEditor } from "@/components/code-editor";
import { ActionForm, SubmitButton, TextArea } from "@/components/forms";
import { Icon } from "@/components/icons";
import { buildStaticPreview } from "@/lib/static-preview";
import { submitProjectAction } from "../actions";

type Props = {
  projectId: string;
  name: string;
  runtime: "static" | "node";
  install: string[] | null;
  start: string[] | null;
  initialFiles: Record<string, string>;
  clientId: string | null;
  briefTitle: string | null;
};

type SaveState = "saved" | "saving" | "unsaved" | "error";
const IDLE_MS = 30 * 60_000;
const MAX_LOG_LINES = 2000;

function editorLanguage(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  return ({ js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", ts: "typescript", tsx: "typescript", json: "json", html: "html", css: "css", md: "markdown", py: "python" } as Record<string, string>)[ext ?? ""] ?? "plaintext";
}

function toTree(files: Record<string, string>) {
  const tree: Record<string, unknown> = {};
  for (const [path, contents] of Object.entries(files)) {
    const parts = path.split("/");
    let node = tree;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) node[part] = { file: { contents } };
      else {
        node[part] ??= { directory: {} };
        node = (node[part] as { directory: Record<string, unknown> }).directory;
      }
    });
  }
  return tree;
}

/** Folders implied by the file paths, sorted. */
function folderList(paths: string[]) {
  const set = new Set<string>();
  for (const p of paths) {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) set.add(parts.slice(0, i).join("/"));
  }
  return [...set].sort();
}

// One WebContainer per page (the API allows a single instance at a time).
let containerPromise: Promise<WebContainer> | null = null;

export function Workspace(props: Props) {
  const [files, setFiles] = useState<Record<string, string>>(props.initialFiles);
  const visiblePaths = useMemo(() => Object.keys(files).filter((p) => !p.endsWith("/.gitkeep") && p !== ".gitkeep").sort(), [files]);
  const folders = useMemo(() => folderList(Object.keys(files)), [files]);
  const firstFile = visiblePaths.includes("index.html") ? "index.html" : visiblePaths.includes("server.js") ? "server.js" : visiblePaths[0];
  const [tabs, setTabs] = useState<string[]>(firstFile ? [firstFile] : []);
  const [active, setActive] = useState<string | null>(firstFile ?? null);
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "bad" | "info"; text: string } | null>(null);
  const [panel, setPanel] = useState<"preview" | "logs" | "submit">("preview");
  const [logs, setLogs] = useState<string[]>([]);
  const [previewDoc, setPreviewDoc] = useState(() => (props.runtime === "static" ? buildStaticPreview(props.initialFiles) : ""));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [runState, setRunState] = useState<"idle" | "booting" | "installing" | "running" | "stopped" | "unsupported" | "error">("idle");
  const [command, setCommand] = useState("");
  const [entryDraft, setEntryDraft] = useState<{ mode: "file" | "folder" | "rename"; value: string; from?: string } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const filesRef = useRef(files);
  filesRef.current = files;
  const container = useRef<WebContainer | null>(null);
  const proc = useRef<WebContainerProcess | null>(null);
  const lastActivity = useRef(Date.now());

  const log = useCallback((line: string) => {
    setLogs((prev) => {
      const next = [...prev, ...line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").split(/\r?\n/).filter((l) => l.length)];
      return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
    });
  }, []);

  // ── Persistence ─────────────────────────────────────────────
  const api = useCallback(
    async (method: string, body?: object, query = "") => {
      const res = await fetch(`/api/workspace/${props.projectId}/files${query}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
      return data;
    },
    [props.projectId],
  );

  const persist = useCallback(
    (path: string) => {
      clearTimeout(saveTimers.current[path]);
      saveTimers.current[path] = setTimeout(async () => {
        setSaveState((s) => ({ ...s, [path]: "saving" }));
        try {
          await api("PUT", { path, content: filesRef.current[path] ?? "" });
          setSaveState((s) => ({ ...s, [path]: "saved" }));
          if (container.current) await container.current.fs.writeFile(path, filesRef.current[path] ?? "");
          if (props.runtime === "static") setPreviewDoc(buildStaticPreview(filesRef.current));
        } catch (e) {
          setSaveState((s) => ({ ...s, [path]: "error" }));
          setMessage({ tone: "bad", text: e instanceof Error ? e.message : "Could not save." });
        }
      }, 700);
    },
    [api, props.runtime],
  );

  const onEdit = (path: string, content: string) => {
    lastActivity.current = Date.now();
    setFiles((f) => ({ ...f, [path]: content }));
    setSaveState((s) => ({ ...s, [path]: "unsaved" }));
    persist(path);
  };

  const unsaved = Object.values(saveState).some((s) => s === "unsaved" || s === "saving" || s === "error");
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (unsaved) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [unsaved]);

  // ── Explorer actions ────────────────────────────────────────
  async function commitEntry() {
    if (!entryDraft) return;
    const value = entryDraft.value.trim().replace(/^\/+/, "");
    if (!value) return setEntryDraft(null);
    try {
      if (entryDraft.mode === "rename" && entryDraft.from) {
        const from = entryDraft.from;
        await api("PATCH", { from, to: value });
        setFiles((f) => {
          const next: Record<string, string> = {};
          for (const [p, c] of Object.entries(f)) {
            if (p === from) next[value] = c;
            else if (p.startsWith(from + "/")) next[value + p.slice(from.length)] = c;
            else next[p] = c;
          }
          return next;
        });
        setTabs((t) => t.map((p) => (p === from ? value : p.startsWith(from + "/") ? value + p.slice(from.length) : p)));
        setActive((a) => (a === from ? value : a && a.startsWith(from + "/") ? value + a.slice(from.length) : a));
        if (container.current) await container.current.fs.rename(from, value).catch(() => {});
      } else {
        await api("POST", { path: value, kind: entryDraft.mode });
        const key = entryDraft.mode === "folder" ? `${value}/.gitkeep` : value;
        setFiles((f) => ({ ...f, [key]: "" }));
        if (entryDraft.mode === "file") {
          setTabs((t) => [...t, value]);
          setActive(value);
          if (container.current) {
            const dir = value.split("/").slice(0, -1).join("/");
            if (dir) await container.current.fs.mkdir(dir, { recursive: true }).catch(() => {});
            await container.current.fs.writeFile(value, "").catch(() => {});
          }
        }
      }
      setEntryDraft(null);
      setMessage(null);
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof Error ? e.message : "That didn't work." });
    }
  }

  async function remove(path: string) {
    try {
      await api("DELETE", undefined, `?path=${encodeURIComponent(path)}`);
      setFiles((f) => Object.fromEntries(Object.entries(f).filter(([p]) => p !== path && !p.startsWith(path + "/"))));
      setTabs((t) => t.filter((p) => p !== path && !p.startsWith(path + "/")));
      setActive((a) => (a === path || a?.startsWith(path + "/") ? null : a));
      if (container.current) await container.current.fs.rm(path, { recursive: true, force: true }).catch(() => {});
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof Error ? e.message : "Could not delete." });
    }
  }

  const open = (p: string) => {
    setTabs((t) => (t.includes(p) ? t : [...t, p]));
    setActive(p);
  };
  const closeTab = (p: string) => {
    setTabs((t) => {
      const next = t.filter((x) => x !== p);
      if (active === p) setActive(next[next.length - 1] ?? null);
      return next;
    });
  };

  // ── Static preview logs (validated messages from our own sandboxed frame only) ──
  useEffect(() => {
    if (props.runtime !== "static") return;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const d = e.data as { __g2tPreview?: boolean; level?: string; text?: string };
      if (!d || d.__g2tPreview !== true || typeof d.text !== "string") return;
      log(`[${d.level ?? "log"}] ${d.text.slice(0, 2000)}`);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [props.runtime, log]);

  // ── Node runtime (WebContainer in the student's browser) ──
  const pipe = useCallback(
    (p: WebContainerProcess) => {
      p.output.pipeTo(new WritableStream({ write: (chunk) => log(chunk) })).catch(() => {});
    },
    [log],
  );

  async function boot() {
    if (!window.crossOriginIsolated || typeof SharedArrayBuffer === "undefined") {
      setRunState("unsupported");
      return null;
    }
    setRunState("booting");
    log("Starting the in-browser runtime…");
    const mod = await import("@webcontainer/api");
    if (props.clientId) {
      try {
        mod.auth.init({ clientId: props.clientId, scope: "" });
      } catch {}
    }
    containerPromise ??= mod.WebContainer.boot({ coep: "require-corp", workdirName: "project" });
    const wc = await containerPromise;
    container.current = wc;
    wc.on("server-ready", (_port, url) => {
      setPreviewUrl(url);
      setPanel("preview");
      log(`Server ready at ${url}`);
    });
    wc.on("error", (err) => log(`Runtime error: ${err.message}`));
    await wc.mount(toTree(Object.fromEntries(Object.entries(filesRef.current))) as never);
    return wc;
  }

  async function startProject() {
    lastActivity.current = Date.now();
    setMessage(null);
    setPanel("logs");
    try {
      const wc = container.current ?? (await boot());
      if (!wc) return;
      if (props.install) {
        setRunState("installing");
        log(`$ ${props.install.join(" ")}`);
        const p = await wc.spawn(props.install[0], props.install.slice(1));
        proc.current = p;
        pipe(p);
        const code = await p.exit;
        if (code !== 0) {
          setRunState("error");
          log(`Install failed with exit code ${code}. Check package.json and try again.`);
          return;
        }
      }
      if (props.start) {
        log(`$ ${props.start.join(" ")}`);
        const p = await wc.spawn(props.start[0], props.start.slice(1));
        proc.current = p;
        setRunState("running");
        pipe(p);
        p.exit.then((code) => {
          if (proc.current === p) {
            setRunState("stopped");
            log(`Process exited with code ${code}.`);
          }
        });
      }
    } catch (e) {
      setRunState("error");
      log(`Could not start: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function stopProject() {
    proc.current?.kill();
    proc.current = null;
    setRunState("stopped");
    setPreviewUrl(null);
    log("Stopped.");
  }

  async function runCommand(e: React.FormEvent) {
    e.preventDefault();
    const parts = command.match(/"[^"]*"|'[^']*'|\S+/g)?.map((s) => s.replace(/^["']|["']$/g, "")) ?? [];
    if (!parts.length) return;
    lastActivity.current = Date.now();
    setPanel("logs");
    try {
      const wc = container.current ?? (await boot());
      if (!wc) return;
      log(`$ ${command}`);
      const p = await wc.spawn(parts[0], parts.slice(1));
      pipe(p);
      setCommand("");
      const code = await p.exit;
      log(`(exit ${code})`);
    } catch (err) {
      log(`Command failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Idle shutdown and cleanup.
  useEffect(() => {
    if (props.runtime !== "node") return;
    const bump = () => (lastActivity.current = Date.now());
    window.addEventListener("keydown", bump);
    window.addEventListener("pointerdown", bump);
    const t = setInterval(() => {
      if (container.current && Date.now() - lastActivity.current > IDLE_MS) {
        container.current.teardown();
        container.current = null;
        containerPromise = null;
        proc.current = null;
        setPreviewUrl(null);
        setRunState("stopped");
        setMessage({ tone: "info", text: "The runtime was stopped after 30 minutes without activity. Your files are saved; press Run to start again." });
      }
    }, 60_000);
    return () => {
      clearInterval(t);
      window.removeEventListener("keydown", bump);
      window.removeEventListener("pointerdown", bump);
    };
  }, [props.runtime]);

  useEffect(
    () => () => {
      container.current?.teardown();
      container.current = null;
      containerPromise = null;
    },
    [],
  );

  const status = active ? saveState[active] : undefined;
  return (
    <div className="ws">
      <div className="ws__bar">
        <div className="row" style={{ minWidth: 0 }}>
          <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{props.name}</strong>
          {props.briefTitle && <span className="badge badge--teal badge--plain">{props.briefTitle}</span>}
          <span className="small muted" role="status" aria-live="polite">
            {unsaved ? "Saving changes…" : "All files saved"}
          </span>
        </div>
        <div className="row">
          {props.runtime === "node" &&
            (runState === "running" || runState === "installing" ? (
              <button className="btn btn--secondary btn--sm" onClick={stopProject}>
                <Icon name="stop" /> Stop
              </button>
            ) : (
              <button className="btn btn--primary btn--sm" onClick={startProject} disabled={runState === "booting"}>
                <Icon name="play" /> {runState === "booting" ? "Starting…" : "Run project"}
              </button>
            ))}
          <a className="btn btn--secondary btn--sm" href={`/api/workspace/${props.projectId}/export`}>
            <Icon name="download" /> Export .zip
          </a>
          <button className="btn btn--dark btn--sm" onClick={() => setPanel("submit")}>
            <Icon name="send" /> Submit
          </button>
        </div>
      </div>

      {message && (
        <div className={`alert alert--${message.tone === "bad" ? "bad" : message.tone === "ok" ? "ok" : "info"}`} role="status" style={{ margin: "0 0 10px" }}>
          <Icon name={message.tone === "bad" ? "alert" : "info"} />
          <div>{message.text}</div>
        </div>
      )}

      <div className="ws__grid">
        {/* Explorer */}
        <aside className="ws__files" aria-label="Files">
          <div className="row row--between" style={{ padding: "8px 10px", borderBottom: "1px solid var(--line-dark)" }}>
            <span className="small" style={{ fontWeight: 800, color: "#fff" }}>
              Files
            </span>
            <span className="row" style={{ gap: 2 }}>
              <button className="ws__icon" onClick={() => setEntryDraft({ mode: "file", value: "" })} aria-label="New file" title="New file">
                <Icon name="filePlus" />
              </button>
              <button className="ws__icon" onClick={() => setEntryDraft({ mode: "folder", value: "" })} aria-label="New folder" title="New folder">
                <Icon name="folderPlus" />
              </button>
            </span>
          </div>
          {entryDraft && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                commitEntry();
              }}
              style={{ padding: 8 }}
            >
              <label className="sr-only" htmlFor="entry-name">
                {entryDraft.mode === "rename" ? "New name" : entryDraft.mode === "folder" ? "Folder path" : "File path"}
              </label>
              <input
                id="entry-name"
                autoFocus
                value={entryDraft.value}
                onChange={(e) => setEntryDraft({ ...entryDraft, value: e.target.value })}
                onKeyDown={(e) => e.key === "Escape" && setEntryDraft(null)}
                placeholder={entryDraft.mode === "folder" ? "src/components" : "src/utils.js"}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--teal)", background: "#0E1628", color: "#fff", fontFamily: "var(--mono)", fontSize: 12 }}
              />
              <span style={{ fontSize: 11, color: "var(--slate-light)" }}>Enter to save · Esc to cancel</span>
            </form>
          )}
          <ul className="ws__tree">
            {folders.map((f) => (
              <li key={`d:${f}`} className="ws__row" style={{ paddingLeft: 10 + (f.split("/").length - 1) * 12 }}>
                <span className="ws__name">
                  <Icon name="folder" /> {f.split("/").pop()}
                </span>
                <span className="ws__actions">
                  <button className="ws__icon" onClick={() => setEntryDraft({ mode: "rename", value: f, from: f })} aria-label={`Rename folder ${f}`}>
                    <Icon name="edit" />
                  </button>
                  <button className="ws__icon" onClick={() => remove(f)} aria-label={`Delete folder ${f}`}>
                    <Icon name="trash" />
                  </button>
                </span>
              </li>
            ))}
            {visiblePaths.map((p) => (
              <li key={p} className={`ws__row${p === active ? " is-active" : ""}`} style={{ paddingLeft: 10 + (p.split("/").length - 1) * 12 }}>
                <button className="ws__name" onClick={() => open(p)} title={p}>
                  <Icon name="fileCode" /> {p.split("/").pop()}
                  {saveState[p] === "unsaved" || saveState[p] === "saving" ? <span aria-label="unsaved"> •</span> : null}
                </button>
                <span className="ws__actions">
                  <button className="ws__icon" onClick={() => setEntryDraft({ mode: "rename", value: p, from: p })} aria-label={`Rename ${p}`}>
                    <Icon name="edit" />
                  </button>
                  <button className="ws__icon" onClick={() => remove(p)} aria-label={`Delete ${p}`}>
                    <Icon name="trash" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </aside>

        {/* Editor */}
        <section className="ws__editor" aria-label="Editor">
          <div className="ws__tabs" role="tablist">
            {tabs.map((t) => (
              <div key={t} className={`ws__tab${t === active ? " is-active" : ""}`} role="tab" aria-selected={t === active}>
                <button onClick={() => setActive(t)}>
                  {t.split("/").pop()}
                  {saveState[t] === "unsaved" || saveState[t] === "saving" ? " •" : ""}
                </button>
                <button onClick={() => closeTab(t)} aria-label={`Close ${t}`}>
                  <Icon name="x" />
                </button>
              </div>
            ))}
          </div>
          {active && files[active] !== undefined ? (
            <>
              <CodeEditor value={files[active]} onChange={(v) => onEdit(active, v)} language={editorLanguage(active)} height="100%" path={`ws/${props.projectId}/${active}`} ariaLabel={`Editing ${active}`} />
              <div className="ws__status">
                {active} · {status === "error" ? "not saved — check your connection" : status === "saving" || status === "unsaved" ? "saving…" : "saved"}
              </div>
            </>
          ) : (
            <div className="empty" style={{ color: "var(--slate-light)" }}>
              <strong style={{ color: "#fff" }}>No file open</strong>
              <p>Choose a file on the left.</p>
            </div>
          )}
        </section>

        {/* Runtime */}
        <section className="ws__run" aria-label="Preview and logs">
          <div className="ws__tabs" role="tablist">
            {(["preview", "logs", "submit"] as const).map((k) => (
              <div key={k} className={`ws__tab${panel === k ? " is-active" : ""}`} role="tab" aria-selected={panel === k}>
                <button onClick={() => setPanel(k)}>{k === "preview" ? "Preview" : k === "logs" ? `Logs${logs.length ? ` (${logs.length})` : ""}` : "Submit"}</button>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0, display: panel === "preview" ? "flex" : "none", flexDirection: "column" }}>
            {props.runtime === "static" ? (
              <iframe ref={iframeRef} title="Page preview" sandbox="allow-scripts allow-forms allow-modals" srcDoc={previewDoc} style={{ flex: 1, border: 0, background: "#fff" }} />
            ) : runState === "unsupported" ? (
              <div className="alert alert--warn" style={{ margin: 12 }}>
                <Icon name="alert" />
                <div>This browser can&apos;t run Node.js projects here (it needs cross-origin isolation and SharedArrayBuffer). Use a recent Chrome, Edge or Firefox on a laptop or desktop. Your files are still saved and can be exported.</div>
              </div>
            ) : previewUrl ? (
              <iframe title="Running app" src={previewUrl} sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups" allow="cross-origin-isolated" style={{ flex: 1, border: 0, background: "#fff" }} />
            ) : (
              <div className="empty" style={{ color: "var(--slate-light)" }}>
                <Icon name="play" />
                <strong style={{ color: "#fff" }}>{runState === "installing" ? "Installing dependencies…" : runState === "booting" ? "Starting runtime…" : "Not running"}</strong>
                <p>Press Run project. Dependencies install inside your browser, then the app opens here.</p>
              </div>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0, display: panel === "logs" ? "flex" : "none", flexDirection: "column" }}>
            <pre className="ws__logs" aria-live="polite">{logs.length ? logs.join("\n") : "Runtime and console output appears here."}</pre>
            <div className="row" style={{ padding: 8, borderTop: "1px solid var(--line-dark)" }}>
              {props.runtime === "node" ? (
                <form onSubmit={runCommand} className="row" style={{ flex: 1, flexWrap: "nowrap" }}>
                  <label htmlFor="ws-cmd" className="sr-only">
                    Command
                  </label>
                  <input id="ws-cmd" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Run a command, e.g. node server.js" style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--line-dark)", background: "#0E1628", color: "#fff", fontFamily: "var(--mono)", fontSize: 12 }} />
                  <button className="btn btn--secondary btn--sm">Run</button>
                </form>
              ) : (
                <span className="small" style={{ color: "var(--slate-light)" }}>Console output from the preview.</span>
              )}
              <button className="btn btn--ghost btn--sm" style={{ color: "#fff" }} onClick={() => setLogs([])}>
                Clear
              </button>
            </div>
          </div>
          <div style={{ display: panel === "submit" ? "block" : "none", padding: 14, background: "#fff", overflowY: "auto" }}>
            <h3 style={{ fontSize: "1rem" }}>Submit for review</h3>
            <p className="small muted" style={{ margin: "6px 0 12px" }}>
              A fixed copy of all {visiblePaths.length} files is submitted. Later edits won&apos;t change it.
              {unsaved && " Wait until all files show as saved."}
            </p>
            <ActionForm action={submitProjectAction} resetOnSuccess>
              <input type="hidden" name="projectId" value={props.projectId} />
              <TextArea name="note" label="Note for your trainer (optional)" rows={4} />
              <SubmitButton pendingText="Submitting…">Submit this version</SubmitButton>
            </ActionForm>
          </div>
        </section>
      </div>
    </div>
  );
}
