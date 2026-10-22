"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CodeEditor } from "@/components/code-editor";
import { Icon } from "@/components/icons";
import { RunOutput } from "@/components/run-output";
import { useRunner } from "@/components/use-runner";

type Lang = { key: string; name: string; family: string; editor: string; starter: string };

export function Playground() {
  const router = useRouter();
  const [langs, setLangs] = useState<Lang[] | null>(null);
  const [langError, setLangError] = useState<string | null>(null);
  const [lang, setLang] = useState<string>("");
  const [code, setCode] = useState("");
  const [stdin, setStdin] = useState("");
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const runner = useRunner();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/playground/languages", { cache: "no-store" });
        const data = (await res.json()) as { configured: boolean; languages: Lang[]; error?: string };
        setLangs(data.languages);
        if (!data.languages.length) setLangError(data.error ?? "No languages are available from the code runner.");
        let preferred = data.languages[0]?.key ?? "";
        try {
          const saved = localStorage.getItem("g2t-playground-lang");
          if (saved && data.languages.some((l) => l.key === saved)) preferred = saved;
        } catch {}
        setLang(preferred);
      } catch {
        setLangs([]);
        setLangError("Could not load languages. Check your connection.");
      }
    })();
  }, []);

  // Load the saved draft (or starter) whenever the language changes.
  useEffect(() => {
    if (!lang || !langs) return;
    loaded.current = false;
    try {
      localStorage.setItem("g2t-playground-lang", lang);
    } catch {}
    (async () => {
      const l = langs.find((x) => x.key === lang);
      try {
        const res = await fetch(`/api/playground/draft?languageKey=${encodeURIComponent(lang)}`, { cache: "no-store" });
        const data = (await res.json()) as { draft: { code: string; stdin: string } | null };
        setCode(data.draft?.code ?? l?.starter ?? "");
        setStdin(data.draft?.stdin ?? (l?.starter ? "Grad2Tech" : ""));
      } catch {
        setCode(l?.starter ?? "");
      }
      setDraftState("idle");
      loaded.current = true;
    })();
  }, [lang, langs]);

  const scheduleSave = useCallback(
    (nextCode: string, nextStdin: string) => {
      if (!loaded.current || !lang) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setDraftState("saving");
      saveTimer.current = setTimeout(async () => {
        try {
          const res = await fetch("/api/playground/draft", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ languageKey: lang, code: nextCode, stdin: nextStdin }),
          });
          setDraftState(res.ok ? "saved" : "error");
        } catch {
          setDraftState("error");
        }
      }, 1200);
    },
    [lang],
  );

  const prevBusy = useRef(false);
  useEffect(() => {
    if (prevBusy.current && !runner.busy) router.refresh(); // update run history
    prevBusy.current = runner.busy;
  }, [runner.busy, router]);

  const current = langs?.find((l) => l.key === lang);
  return (
    <div className="stack" style={{ gap: 16 }}>
      {langError && (
        <div className="alert alert--warn" role="alert">
          <Icon name="alert" />
          <div>{langError} You can still write code here; running is unavailable until the runner is connected.</div>
        </div>
      )}
      <div className="row row--between">
        <div className="row">
          <label htmlFor="pg-lang" className="small" style={{ fontWeight: 700 }}>
            Language
          </label>
          <select id="pg-lang" value={lang} onChange={(e) => setLang(e.target.value)} disabled={!langs?.length} style={{ minHeight: 38, borderRadius: 9, border: "1px solid var(--line-strong)", padding: "4px 10px" }}>
            {langs === null && <option>Loading…</option>}
            {langs?.map((l) => (
              <option key={l.key} value={l.key}>
                {l.name}
              </option>
            ))}
          </select>
          {current?.starter && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setCode(current.starter); scheduleSave(current.starter, stdin); }}>
              <Icon name="refresh" /> Reset to template
            </button>
          )}
        </div>
        <div className="row">
          <span className="small muted" role="status" aria-live="polite">
            {draftState === "saving" ? "Saving draft…" : draftState === "saved" ? "Draft saved" : draftState === "error" ? "Draft not saved — check your connection" : ""}
          </span>
          <button type="button" className="btn btn--primary" disabled={runner.busy || !lang || !code.trim() || !langs?.length} onClick={() => runner.start({ languageKey: lang, code, stdin })}>
            <Icon name="play" /> {runner.busy ? "Running…" : "Run"}
          </button>
          <button type="button" className="btn btn--secondary" disabled={!runner.busy} onClick={runner.cancel}>
            <Icon name="stop" /> Stop
          </button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(280px, 2fr)", gap: 16, alignItems: "start" }} className="pg-grid">
        <CodeEditor
          value={code}
          onChange={(v) => {
            setCode(v);
            scheduleSave(v, stdin);
          }}
          language={current?.editor ?? "plaintext"}
          height="calc(100vh - 260px)"
          path={`playground-${lang}`}
          ariaLabel="Playground code editor"
        />
        <div className="stack" style={{ gap: 12 }}>
          <div className="field">
            <label htmlFor="pg-stdin">Standard input</label>
            <textarea
              id="pg-stdin"
              data-code=""
              rows={5}
              spellCheck={false}
              value={stdin}
              onChange={(e) => {
                setStdin(e.target.value);
                scheduleSave(code, e.target.value);
              }}
            />
          </div>
          <div className="card" style={{ padding: 14, minHeight: 200 }}>
            <RunOutput run={runner.run} error={runner.error} busy={runner.busy} />
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 1000px) { .pg-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
