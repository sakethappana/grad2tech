"use client";

import { useMemo, useState } from "react";
import { buildStaticPreview } from "@/lib/static-preview";
import { Icon } from "./icons";

/** Read-only file browser for a frozen project snapshot, with a sandboxed preview for static projects. */
export function SnapshotViewer({ files, staticPreview }: { files: Record<string, string>; staticPreview: boolean }) {
  const paths = useMemo(() => Object.keys(files).filter((p) => !p.endsWith(".gitkeep")).sort(), [files]);
  const [current, setCurrent] = useState(paths.includes("index.html") ? "index.html" : paths[0]);
  const [preview, setPreview] = useState(false);
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="row row--between" style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
        <strong className="small">{paths.length} files</strong>
        {staticPreview && (
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setPreview((p) => !p)}>
            <Icon name={preview ? "code" : "eye"} /> {preview ? "Show code" : "Preview page"}
          </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 220px) minmax(0, 1fr)", minHeight: 420 }}>
        <ul className="list" style={{ borderRight: "1px solid var(--line)", maxHeight: 560, overflowY: "auto" }}>
          {paths.map((p) => (
            <li key={p} style={{ padding: 0 }}>
              <button
                type="button"
                onClick={() => {
                  setCurrent(p);
                  setPreview(false);
                }}
                aria-current={p === current ? "true" : undefined}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  border: 0,
                  background: p === current ? "var(--teal-wash)" : "transparent",
                  fontFamily: "var(--mono)",
                  fontSize: 12.5,
                  fontWeight: p === current ? 700 : 500,
                }}
              >
                {p}
              </button>
            </li>
          ))}
        </ul>
        {preview ? (
          <iframe title="Project preview" sandbox="allow-scripts allow-forms allow-modals" srcDoc={buildStaticPreview(files)} style={{ width: "100%", height: 560, border: 0, background: "#fff" }} />
        ) : (
          <pre className="codeblock" style={{ borderRadius: 0, margin: 0, maxHeight: 560, overflow: "auto" }}>
            {current ? files[current] : ""}
          </pre>
        )}
      </div>
    </div>
  );
}
