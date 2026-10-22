import { Judge0Provider } from "./judge0";
import { ExecutionUnavailableError, type ExecRequest, type ExecResult, type ExecutionProvider } from "./types";

export * from "./types";

let provider: ExecutionProvider | null = null;

/** The configured execution provider. Tests may replace it with setExecutionProvider. */
export function executionProvider(): ExecutionProvider {
  provider ??= new Judge0Provider();
  return provider;
}

export function setExecutionProvider(p: ExecutionProvider | null) {
  provider = p;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Submits and waits for a result (used by the grading worker). */
export async function runAndWait(req: ExecRequest, opts: { timeoutMs?: number; pollMs?: number } = {}): Promise<ExecResult> {
  const p = executionProvider();
  const token = await p.submit(req);
  const deadline = Date.now() + (opts.timeoutMs ?? 60_000);
  let delay = opts.pollMs ?? 500;
  while (Date.now() < deadline) {
    await sleep(delay);
    const r = await p.poll(token);
    if (r.done) return r.result;
    delay = Math.min(delay * 1.5, 3000);
  }
  throw new ExecutionUnavailableError("The code runner did not return a result in time.");
}

/** Sandboxes report memory-limit kills as runtime errors; reclassify using the run's own limit. */
export function refineOutcome(result: ExecResult, memoryLimitKb: number): ExecResult {
  if (result.outcome === "RUNTIME_ERROR" && result.memoryKb !== null && result.memoryKb >= memoryLimitKb * 0.95) {
    return { ...result, outcome: "MEMORY_LIMIT" };
  }
  return result;
}

/** Normalises program output for comparison: trims trailing spaces on each line and trailing blank lines. */
export function normalizeOutput(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

export const STARTER_TEMPLATES: Record<string, string> = {
  python: 'name = input().strip()\nprint(f"Hello, {name}!")\n',
  c: '#include <stdio.h>\n\nint main(void) {\n    char name[100];\n    if (scanf("%99s", name) == 1) {\n        printf("Hello, %s!\\n", name);\n    }\n    return 0;\n}\n',
  cpp: '#include <iostream>\n#include <string>\n\nint main() {\n    std::string name;\n    std::cin >> name;\n    std::cout << "Hello, " << name << "!" << std::endl;\n    return 0;\n}\n',
  java: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        String name = sc.next();\n        System.out.println("Hello, " + name + "!");\n    }\n}\n',
  javascript: "const lines = require('fs').readFileSync(0, 'utf8').trim().split('\\n');\nconst name = lines[0];\nconsole.log(`Hello, ${name}!`);\n",
  typescript: "declare const require: any;\nconst input: string = require('fs').readFileSync(0, 'utf8').trim();\nconsole.log(`Hello, ${input}!`);\n",
};
