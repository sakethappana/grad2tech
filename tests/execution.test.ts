import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeOutput, refineOutcome, setExecutionProvider } from "@/server/execution";
import { Judge0Provider, mapStatus, selectLanguages } from "@/server/execution/judge0";
import { gradeMcq, scoreCoding } from "@/server/assessments/grading";
import { cancelRun, refreshRun, startRun } from "@/server/playground";
import { FakeProvider, makeUser, prisma, resetDb, sumJudge } from "./helpers";

describe("Judge0 adapter", () => {
  it("discovers the newest supported version of each language family", () => {
    const langs = selectLanguages(
      [
        { id: 70, name: "Python (2.7.17)" },
        { id: 71, name: "Python (3.8.1)" },
        { id: 92, name: "Python (3.11.2)" },
        { id: 50, name: "C (GCC 9.2.0)" },
        { id: 103, name: "C (GCC 14.1.0)" },
        { id: 54, name: "C++ (GCC 9.2.0)" },
        { id: 62, name: "Java (OpenJDK 13.0.1)" },
        { id: 63, name: "JavaScript (Node.js 12.14.0)" },
        { id: 74, name: "TypeScript (3.7.4)" },
        { id: 43, name: "Plain Text" },
      ],
      "",
    );
    expect(langs.map((l) => `${l.family}:${l.key}`)).toEqual(["python:92", "c:103", "cpp:54", "java:62", "javascript:63", "typescript:74"]);
    // Explicit configuration restricts the list.
    expect(selectLanguages([{ id: 71, name: "Python (3.8.1)" }, { id: 54, name: "C++ (GCC 9.2.0)" }], "54").map((l) => l.key)).toEqual(["54"]);
  });

  it("maps statuses without treating service failures as wrong answers", () => {
    expect(mapStatus(1)).toBe("PENDING");
    expect(mapStatus(3)).toBe("OK");
    expect(mapStatus(4)).toBe("OK");
    expect(mapStatus(5)).toBe("TIME_LIMIT");
    expect(mapStatus(6)).toBe("COMPILE_ERROR");
    expect(mapStatus(11)).toBe("RUNTIME_ERROR");
    expect(mapStatus(13)).toBe("SERVICE_ERROR");
    const r = refineOutcome({ outcome: "RUNTIME_ERROR", verdict: "Runtime Error (SIGKILL)", stdout: "", stderr: "", compileOutput: "", exitCode: 137, timeMs: 10, memoryKb: 64000 }, 64000);
    expect(r.outcome).toBe("MEMORY_LIMIT");
  });

  it("sends credentials only as headers, never sends expected output, and reports outages clearly", async () => {
    const cfg = () => ({
      JUDGE0_URL: "https://judge0-ce.p.rapidapi.com",
      JUDGE0_RAPIDAPI_KEY: "secret-key",
      JUDGE0_RAPIDAPI_HOST: "judge0-ce.p.rapidapi.com",
      JUDGE0_AUTH_TOKEN: "",
      JUDGE0_LANGUAGE_IDS: "",
      RUN_MAX_OUTPUT_BYTES: 100,
    });
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/submissions/tok")) {
        return new Response(JSON.stringify({ status: { id: 3, description: "Accepted" }, stdout: Buffer.from("x".repeat(500)).toString("base64"), time: "0.012", memory: 900 }), { status: 200 });
      }
      return new Response(JSON.stringify({ token: "tok" }), { status: 201 });
    });
    const p = new Judge0Provider(ok as unknown as typeof fetch, cfg);
    const token = await p.submit({ languageKey: "71", source: "print(1)", stdin: "", cpuTimeLimitS: 2, wallTimeLimitS: 5, memoryLimitKb: 128000 });
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.expected_output).toBeUndefined();
    expect(body.enable_network).toBe(false);
    expect(body.memory_limit).toBe(128000);
    expect((calls[0].init.headers as Record<string, string>)["X-RapidAPI-Key"]).toBe("secret-key");
    expect(calls[0].url).not.toContain("secret-key");
    const polled = await p.poll(token);
    expect(polled.done && polled.result.stdout.endsWith("output truncated")).toBe(true);
    expect(polled.done && polled.result.timeMs).toBe(12);

    const down = new Judge0Provider((async () => new Response("boom", { status: 502 })) as unknown as typeof fetch, cfg);
    await expect(down.submit({ languageKey: "71", source: "x", stdin: "", cpuTimeLimitS: 1, wallTimeLimitS: 2, memoryLimitKb: 1000 })).rejects.toThrow(/HTTP 502/);
    const offline = new Judge0Provider((async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch, cfg);
    await expect(offline.languages()).rejects.toThrow(/unavailable/);
    const unconfigured = new Judge0Provider(fetch, () => ({ ...cfg(), JUDGE0_URL: "" }));
    expect(unconfigured.configured()).toBe(false);
  });

  it("grading helpers", () => {
    expect(gradeMcq(["b"], ["b"], 2)).toBe(2);
    expect(gradeMcq(["a", "b"], ["b"], 2)).toBe(0);
    expect(gradeMcq(["c", "b"], ["b", "c"], 2)).toBe(2);
    expect(scoreCoding("PROPORTIONAL", 6, [{ weight: 1, passed: true }, { weight: 2, passed: false }])).toBe(2);
    expect(scoreCoding("ALL_OR_NOTHING", 6, [{ weight: 1, passed: true }, { weight: 2, passed: false }])).toBe(0);
    expect(normalizeOutput("3  \r\n4\n\n")).toBe("3\n4");
  });
});

describe("playground runs", () => {
  let provider: FakeProvider;
  beforeEach(async () => {
    await resetDb();
    provider = new FakeProvider(sumJudge);
    setExecutionProvider(provider);
  });
  afterEach(() => setExecutionProvider(null));

  it("runs through the provider, never locally, and stores the result for the owner only", async () => {
    const s = await makeUser("STUDENT");
    const other = await makeUser("STUDENT", "Other");
    const run = await startRun(s.id, { languageKey: "71", code: "print-sum", stdin: "2 40", attemptId: null, questionId: null });
    expect(provider.submissions[0].source).toBe("print-sum");
    const done = await refreshRun(s.id, run.id);
    expect(done.status).toBe("COMPLETED");
    expect(done.stdout).toBe("42\n");
    await expect(refreshRun(other.id, run.id)).rejects.toMatchObject({ status: 404 });
  });

  it("infinite loops end with a time-limit verdict (fake runner)", async () => {
    const s = await makeUser("STUDENT");
    const run = await startRun(s.id, { languageKey: "71", code: "while True: pass", stdin: "", attemptId: null, questionId: null });
    const done = await refreshRun(s.id, run.id);
    expect(done.verdict).toBe("Time Limit Exceeded");
  });

  it("enforces per-user concurrency and rate limits", async () => {
    const s = await makeUser("STUDENT");
    // Two runs in flight (not yet polled) reach the concurrency limit (2 by default).
    await startRun(s.id, { languageKey: "71", code: "x", stdin: "", attemptId: null, questionId: null });
    await startRun(s.id, { languageKey: "71", code: "x", stdin: "", attemptId: null, questionId: null });
    await expect(startRun(s.id, { languageKey: "71", code: "x", stdin: "", attemptId: null, questionId: null })).rejects.toMatchObject({ status: 429 });
  });

  it("reports runner outages as a service error, not a program error", async () => {
    const s = await makeUser("STUDENT");
    provider.down = true;
    await expect(startRun(s.id, { languageKey: "71", code: "x", stdin: "", attemptId: null, questionId: null })).rejects.toMatchObject({ status: 503 });
    expect(await prisma.codeRun.count()).toBe(0);
  });

  it("stop marks a run cancelled", async () => {
    const s = await makeUser("STUDENT");
    const run = await startRun(s.id, { languageKey: "71", code: "x", stdin: "", attemptId: null, questionId: null });
    await cancelRun(s.id, run.id);
    expect((await prisma.codeRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("CANCELLED");
  });
});
