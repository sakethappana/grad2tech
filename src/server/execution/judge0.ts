import { env } from "@/lib/env";
import {
  ExecutionUnavailableError,
  SUPPORTED_FAMILIES,
  type ExecLanguage,
  type ExecRequest,
  type ExecResult,
  type ExecutionProvider,
  type LanguageFamily,
  type PollResult,
} from "./types";

/**
 * Judge0 adapter (Judge0 CE via RapidAPI, or a self-hosted Judge0 on a separate isolated host).
 * Judge0 runs each submission in an `isolate` sandbox with CPU/wall/memory/process/file limits
 * and networking disabled. Credentials stay on the server.
 */

const FAMILY_PATTERNS: [LanguageFamily, RegExp, string][] = [
  ["python", /^Python \(3\./i, "python"],
  ["c", /^C \((GCC|Clang)/i, "c"],
  ["cpp", /^C\+\+ \((GCC|Clang)/i, "cpp"],
  ["java", /^Java \(/i, "java"],
  ["javascript", /^JavaScript \(Node/i, "javascript"],
  ["typescript", /^TypeScript \(/i, "typescript"],
];

function versionOf(name: string): number[] {
  const m = /\(([^)]*)\)/.exec(name);
  const nums = (m?.[1] ?? "").match(/\d+/g) ?? [];
  return nums.map(Number);
}

function compareVersions(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Picks the newest version of each supported family, or the explicitly configured ids. */
export function selectLanguages(all: { id: number; name: string }[], configuredIds: string): ExecLanguage[] {
  const classify = (l: { id: number; name: string }): ExecLanguage | null => {
    for (const [family, re, editor] of FAMILY_PATTERNS) {
      if (re.test(l.name)) return { key: String(l.id), name: l.name, family, editor };
    }
    return null;
  };
  const wanted = configuredIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (wanted.length) {
    return all
      .filter((l) => wanted.includes(String(l.id)))
      .map(classify)
      .filter((l): l is ExecLanguage => l !== null);
  }
  const best = new Map<LanguageFamily, ExecLanguage>();
  for (const l of all) {
    const c = classify(l);
    if (!c) continue;
    const cur = best.get(c.family);
    if (!cur || compareVersions(versionOf(c.name), versionOf(cur.name)) > 0) best.set(c.family, c);
  }
  return SUPPORTED_FAMILIES.map((f) => best.get(f)).filter((l): l is ExecLanguage => Boolean(l));
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s: string | null | undefined) => (s ? Buffer.from(s, "base64").toString("utf8") : "");

function truncate(s: string, max: number) {
  if (Buffer.byteLength(s, "utf8") <= max) return s;
  return Buffer.from(s, "utf8").subarray(0, max).toString("utf8") + "\n… output truncated";
}

/** Maps Judge0 status ids (https://ce.judge0.com/statuses) to provider-neutral outcomes. */
export function mapStatus(id: number): ExecResult["outcome"] | "PENDING" {
  if (id === 1 || id === 2) return "PENDING";
  if (id === 3 || id === 4) return "OK"; // We compare output ourselves; expected output is never sent.
  if (id === 5) return "TIME_LIMIT";
  if (id === 6) return "COMPILE_ERROR";
  if (id >= 7 && id <= 12) return "RUNTIME_ERROR";
  return "SERVICE_ERROR"; // 13 Internal Error, 14 Exec Format Error, unknown
}

export type Judge0Config = {
  JUDGE0_URL: string;
  JUDGE0_RAPIDAPI_KEY: string;
  JUDGE0_RAPIDAPI_HOST: string;
  JUDGE0_AUTH_TOKEN: string;
  JUDGE0_LANGUAGE_IDS: string;
  RUN_MAX_OUTPUT_BYTES: number;
};

export class Judge0Provider implements ExecutionProvider {
  readonly name = "Judge0";
  private langCache: { at: number; langs: ExecLanguage[] } | null = null;

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly cfg: () => Judge0Config = env,
  ) {}

  configured() {
    return Boolean(this.cfg().JUDGE0_URL);
  }

  private headers(): Record<string, string> {
    const e = this.cfg();
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (e.JUDGE0_RAPIDAPI_KEY) {
      h["X-RapidAPI-Key"] = e.JUDGE0_RAPIDAPI_KEY;
      h["X-RapidAPI-Host"] = e.JUDGE0_RAPIDAPI_HOST || new URL(e.JUDGE0_URL).host;
    }
    if (e.JUDGE0_AUTH_TOKEN) h["X-Auth-Token"] = e.JUDGE0_AUTH_TOKEN;
    return h;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.configured()) throw new ExecutionUnavailableError("Code execution is not configured yet. Ask an admin to connect the Judge0 runner.");
    const url = this.cfg().JUDGE0_URL.replace(/\/$/, "") + path;
    let res: Response;
    try {
      res = await this.fetchImpl(url, { ...init, headers: { ...this.headers(), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(15000) });
    } catch {
      throw new ExecutionUnavailableError();
    }
    if (res.status === 429) throw new ExecutionUnavailableError("The code runner's usage limit has been reached. Please try again later.");
    if (!res.ok) {
      // Do not include response bodies: they may echo source or input.
      throw new ExecutionUnavailableError(`The code runner returned an error (HTTP ${res.status}). Please try again shortly.`);
    }
    return (await res.json()) as T;
  }

  async languages(): Promise<ExecLanguage[]> {
    if (this.langCache && Date.now() - this.langCache.at < 10 * 60_000) return this.langCache.langs;
    const all = await this.request<{ id: number; name: string; is_archived?: boolean }[]>("/languages");
    const langs = selectLanguages(all.filter((l) => !l.is_archived), this.cfg().JUDGE0_LANGUAGE_IDS);
    this.langCache = { at: Date.now(), langs };
    return langs;
  }

  async submit(req: ExecRequest): Promise<string> {
    const body = {
      language_id: Number(req.languageKey),
      source_code: b64(req.source),
      stdin: b64(req.stdin),
      cpu_time_limit: req.cpuTimeLimitS,
      cpu_extra_time: 0.5,
      wall_time_limit: req.wallTimeLimitS,
      memory_limit: req.memoryLimitKb,
      max_processes_and_or_threads: 60,
      max_file_size: 1024,
      enable_network: false,
      redirect_stderr_to_stdout: false,
    };
    const res = await this.request<{ token?: string }>("/submissions?base64_encoded=true&wait=false", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.token) throw new ExecutionUnavailableError();
    return res.token;
  }

  async poll(token: string): Promise<PollResult> {
    const fields = "status,stdout,stderr,compile_output,time,memory,exit_code";
    const r = await this.request<{
      status?: { id: number; description: string };
      stdout?: string | null;
      stderr?: string | null;
      compile_output?: string | null;
      time?: string | null;
      memory?: number | null;
      exit_code?: number | null;
    }>(`/submissions/${encodeURIComponent(token)}?base64_encoded=true&fields=${fields}`);
    const statusId = r.status?.id ?? 13;
    const mapped = mapStatus(statusId);
    if (mapped === "PENDING") return { done: false };
    const max = this.cfg().RUN_MAX_OUTPUT_BYTES;
    const memoryKb = r.memory ?? null;
    return {
      done: true,
      result: {
        outcome: mapped,
        verdict: r.status?.description ?? "Unknown",
        stdout: truncate(unb64(r.stdout), max),
        stderr: truncate(unb64(r.stderr), max),
        compileOutput: truncate(unb64(r.compile_output), max),
        exitCode: r.exit_code ?? null,
        timeMs: r.time ? Math.round(parseFloat(r.time) * 1000) : null,
        memoryKb,
      },
    };
  }
}
