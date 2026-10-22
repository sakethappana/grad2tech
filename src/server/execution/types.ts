/** Provider-neutral execution types. */

export type LanguageFamily = "python" | "c" | "cpp" | "javascript" | "typescript" | "java";

export const SUPPORTED_FAMILIES: LanguageFamily[] = ["python", "c", "cpp", "java", "javascript", "typescript"];

export type ExecLanguage = {
  /** Provider language id, stored as a string. */
  key: string;
  /** Provider's name including version, e.g. "Python (3.11.2)". */
  name: string;
  family: LanguageFamily;
  /** Monaco editor language id. */
  editor: string;
};

export type ExecRequest = {
  languageKey: string;
  source: string;
  stdin: string;
  cpuTimeLimitS: number;
  wallTimeLimitS: number;
  memoryLimitKb: number;
};

export type ExecOutcome =
  | "OK"
  | "COMPILE_ERROR"
  | "RUNTIME_ERROR"
  | "TIME_LIMIT"
  | "MEMORY_LIMIT"
  /** The provider failed internally. Not the student's fault. */
  | "SERVICE_ERROR";

export type ExecResult = {
  outcome: ExecOutcome;
  /** Provider's verdict text, e.g. "Time Limit Exceeded". */
  verdict: string;
  stdout: string;
  stderr: string;
  compileOutput: string;
  exitCode: number | null;
  timeMs: number | null;
  memoryKb: number | null;
};

export type PollResult = { done: false } | { done: true; result: ExecResult };

export interface ExecutionProvider {
  readonly name: string;
  configured(): boolean;
  /** Supported languages discovered from the provider. */
  languages(): Promise<ExecLanguage[]>;
  /** Starts an execution; returns a provider token. */
  submit(req: ExecRequest): Promise<string>;
  poll(token: string): Promise<PollResult>;
}

/** Thrown when the execution service cannot be reached or is not configured. */
export class ExecutionUnavailableError extends Error {
  constructor(message = "The code runner is unavailable right now. Your code is saved — please try again shortly.") {
    super(message);
    this.name = "ExecutionUnavailableError";
  }
}
