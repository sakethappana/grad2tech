"use client";

import Editor, { loader } from "@monaco-editor/react";
import { useEffect, useState } from "react";

// Monaco is served from our own origin (copied to /public/monaco by scripts/copy-monaco.mjs).
loader.config({ paths: { vs: "/monaco/vs" } });

export function CodeEditor({
  value,
  onChange,
  language,
  height = 360,
  readOnly = false,
  ariaLabel = "Code editor",
  path,
}: {
  value: string;
  onChange?: (v: string) => void;
  language: string;
  height?: number | string;
  readOnly?: boolean;
  ariaLabel?: string;
  path?: string;
}) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  return (
    <div style={{ border: "1px solid var(--line-strong)", borderRadius: 10, overflow: "hidden", height }}>
      <Editor
        height="100%"
        language={language}
        path={path}
        value={value}
        onChange={(v) => onChange?.(v ?? "")}
        theme="vs-dark"
        loading={<div style={{ padding: 16, color: "#A3B1C6", background: "#1e1e1e", height: "100%", fontSize: 13 }}>Loading editor…</div>}
        options={{
          readOnly,
          ariaLabel,
          fontSize: 14,
          fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          tabSize: 4,
          automaticLayout: true,
          wordWrap: "on",
          smoothScrolling: !reduced,
          cursorSmoothCaretAnimation: reduced ? "off" : "on",
          accessibilitySupport: "auto",
          renderLineHighlight: "line",
        }}
      />
    </div>
  );
}
