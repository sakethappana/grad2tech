// Copies Monaco's standalone build into public/monaco so the editor loads from our own origin
// (required by the cross-origin-isolated workspace page, and avoids a third-party CDN).
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const src = path.resolve("node_modules/monaco-editor/min/vs");
const dest = path.resolve("public/monaco/vs");

if (!existsSync(src)) {
  console.warn("[copy-monaco] monaco-editor not installed; skipping");
  process.exit(0);
}
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log("[copy-monaco] copied editor files to public/monaco/vs");
