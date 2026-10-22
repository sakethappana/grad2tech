import { describe, expect, it } from "vitest";
import { runAndWait } from "@/server/execution";
import { Judge0Provider } from "@/server/execution/judge0";

/**
 * Live integration test against the configured Judge0 service (workflows 7 and 8).
 * Skipped unless JUDGE0_URL is set. Uses a handful of executions from the provider quota.
 */
const configured = Boolean(process.env.JUDGE0_URL);

describe.skipIf(!configured)("Judge0 live execution", () => {
  const provider = new Judge0Provider();
  const limits = { cpuTimeLimitS: 2, wallTimeLimitS: 5, memoryLimitKb: 128000 };

  async function lang(family: string) {
    const langs = await provider.languages();
    const l = langs.find((x) => x.family === family);
    if (!l) throw new Error(`${family} is not offered by the provider`);
    return l.key;
  }

  it("runs Python, C and C++ in the isolated runner", async () => {
    const programs: [string, string][] = [
      ["python", "a, b = map(int, input().split())\nprint(a + b)\n"],
      ["c", '#include <stdio.h>\nint main(void){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b);return 0;}\n'],
      ["cpp", "#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b<<std::endl;return 0;}\n"],
    ];
    for (const [family, source] of programs) {
      const r = await runAndWait({ languageKey: await lang(family), source, stdin: "40 2\n", ...limits }, { timeoutMs: 90_000 });
      expect(r.outcome, `${family}: ${r.verdict} ${r.compileOutput} ${r.stderr}`).toBe("OK");
      expect(r.stdout.trim()).toBe("42");
    }
  }, 300_000);

  it("terminates an infinite loop with a time limit", async () => {
    const r = await runAndWait({ languageKey: await lang("python"), source: "while True:\n    pass\n", stdin: "", ...limits }, { timeoutMs: 90_000 });
    expect(r.outcome).toBe("TIME_LIMIT");
  }, 120_000);
});
