"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, useFieldError } from "@/components/forms";
import { Icon } from "@/components/icons";
import { saveQuestionAction } from "./actions";

type QType = "MCQ_SINGLE" | "MCQ_MULTI" | "SHORT_ANSWER" | "CODING";
type Option = { id: string; text: string };
type Case = { isSample: boolean; input: string; expectedOutput: string; weight: number };
export type QuestionDraft = {
  type: QType;
  topic: string;
  prompt: string;
  marks: number;
  options: Option[];
  correctOptionIds: string[];
  solution: string | null;
  inputFormat: string | null;
  outputFormat: string | null;
  constraints: string | null;
  starterCode: Record<string, string>;
  allowedLanguages: string[];
  timeLimitMs: number | null;
  memoryLimitKb: number | null;
  scoring: "ALL_OR_NOTHING" | "PROPORTIONAL" | null;
  cases: Case[];
};

const rid = () => Math.random().toString(16).slice(2, 10);

export const EMPTY_QUESTION: QuestionDraft = {
  type: "MCQ_SINGLE",
  topic: "",
  prompt: "",
  marks: 1,
  options: [
    { id: "a1", text: "" },
    { id: "b2", text: "" },
  ],
  correctOptionIds: [],
  solution: null,
  inputFormat: null,
  outputFormat: null,
  constraints: null,
  starterCode: {},
  allowedLanguages: [],
  timeLimitMs: 2000,
  memoryLimitKb: 256000,
  scoring: "PROPORTIONAL",
  cases: [],
};

function ErrorFor({ name }: { name: string }) {
  const e = useFieldError(name);
  return e ? <span className="field__error">{e}</span> : null;
}

export function QuestionEditor({
  assessmentId,
  questionId,
  initial,
  languages,
  languageError,
}: {
  assessmentId: string;
  questionId: string | null;
  initial: QuestionDraft;
  languages: { key: string; name: string; family: string }[];
  languageError?: string;
}) {
  const [q, setQ] = useState<QuestionDraft>(initial);
  const set = <K extends keyof QuestionDraft>(k: K, v: QuestionDraft[K]) => setQ((p) => ({ ...p, [k]: v }));
  const mcq = q.type === "MCQ_SINGLE" || q.type === "MCQ_MULTI";

  const toggleCorrect = (id: string) => {
    if (q.type === "MCQ_SINGLE") set("correctOptionIds", [id]);
    else set("correctOptionIds", q.correctOptionIds.includes(id) ? q.correctOptionIds.filter((x) => x !== id) : [...q.correctOptionIds, id]);
  };
  const langName = (key: string) => languages.find((l) => l.key === key)?.name ?? `Language id ${key}`;

  return (
    <ActionForm action={saveQuestionAction}>
      <input type="hidden" name="assessmentId" value={assessmentId} />
      {questionId && <input type="hidden" name="questionId" value={questionId} />}
      <input type="hidden" name="payload" value={JSON.stringify(q)} />

      <div className="form__row form__row--3">
        <div className="field">
          <label htmlFor="q-type">Question type</label>
          <select
            id="q-type"
            value={q.type}
            onChange={(e) => {
              const type = e.target.value as QType;
              setQ((p) => ({ ...p, type, correctOptionIds: type === "MCQ_SINGLE" ? p.correctOptionIds.slice(0, 1) : p.correctOptionIds }));
            }}
          >
            <option value="MCQ_SINGLE">Multiple choice — one answer</option>
            <option value="MCQ_MULTI">Multiple choice — several answers</option>
            <option value="SHORT_ANSWER">Short written answer</option>
            <option value="CODING">Coding</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="q-topic">Topic</label>
          <input id="q-topic" name="topic" value={q.topic} onChange={(e) => set("topic", e.target.value)} placeholder="e.g. Arrays" />
          <ErrorFor name="topic" />
        </div>
        <div className="field">
          <label htmlFor="q-marks">Marks</label>
          <input id="q-marks" name="marks" type="number" min={0.5} step={0.5} value={q.marks} onChange={(e) => set("marks", Number(e.target.value))} />
          <ErrorFor name="marks" />
        </div>
      </div>

      <div className="field">
        <label htmlFor="q-prompt">{q.type === "CODING" ? "Problem statement" : "Question"}</label>
        <textarea id="q-prompt" name="prompt" rows={q.type === "CODING" ? 8 : 4} value={q.prompt} onChange={(e) => set("prompt", e.target.value)} />
        <span className="field__hint">Markdown supported, including ```code blocks```.</span>
        <ErrorFor name="prompt" />
      </div>

      {mcq && (
        <fieldset className="field">
          <legend>Options — tick the correct {q.type === "MCQ_SINGLE" ? "answer" : "answers"}</legend>
          <div className="stack stack--sm">
            {q.options.map((o, i) => (
              <div key={o.id} className="row" style={{ flexWrap: "nowrap" }}>
                <input
                  type={q.type === "MCQ_SINGLE" ? "radio" : "checkbox"}
                  name="correct-picker"
                  checked={q.correctOptionIds.includes(o.id)}
                  onChange={() => toggleCorrect(o.id)}
                  aria-label={`Option ${i + 1} is correct`}
                  style={{ width: 18, height: 18, accentColor: "var(--teal-ink)" }}
                />
                <input
                  value={o.text}
                  onChange={(e) => set("options", q.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)))}
                  placeholder={`Option ${i + 1}`}
                  aria-label={`Option ${i + 1} text`}
                  style={{ flex: 1, minHeight: 40, padding: "8px 12px", border: "1px solid var(--line-strong)", borderRadius: 9 }}
                />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={q.options.length <= 2}
                  onClick={() => setQ((p) => ({ ...p, options: p.options.filter((x) => x.id !== o.id), correctOptionIds: p.correctOptionIds.filter((x) => x !== o.id) }))}
                  aria-label={`Remove option ${i + 1}`}
                >
                  <Icon name="trash" />
                </button>
              </div>
            ))}
            <div>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => set("options", [...q.options, { id: rid(), text: "" }])} disabled={q.options.length >= 10}>
                <Icon name="plus" /> Add option
              </button>
            </div>
          </div>
          <ErrorFor name="options" />
          <ErrorFor name="correctOptionIds" />
        </fieldset>
      )}

      {q.type === "CODING" && (
        <>
          <div className="form__row form__row--3">
            <div className="field">
              <label htmlFor="q-in">Input format</label>
              <textarea id="q-in" rows={3} value={q.inputFormat ?? ""} onChange={(e) => set("inputFormat", e.target.value || null)} />
            </div>
            <div className="field">
              <label htmlFor="q-out">Output format</label>
              <textarea id="q-out" rows={3} value={q.outputFormat ?? ""} onChange={(e) => set("outputFormat", e.target.value || null)} />
            </div>
            <div className="field">
              <label htmlFor="q-con">Constraints</label>
              <textarea id="q-con" rows={3} value={q.constraints ?? ""} onChange={(e) => set("constraints", e.target.value || null)} />
            </div>
          </div>

          <fieldset className="field">
            <legend>Allowed languages</legend>
            {languages.length > 0 ? (
              <div className="checks">
                {languages.map((l) => (
                  <label className="check" key={l.key}>
                    <input
                      type="checkbox"
                      checked={q.allowedLanguages.includes(l.key)}
                      onChange={() => set("allowedLanguages", q.allowedLanguages.includes(l.key) ? q.allowedLanguages.filter((x) => x !== l.key) : [...q.allowedLanguages, l.key])}
                    />
                    <span>{l.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="alert alert--warn">
                <Icon name="alert" />
                <div>
                  {languageError ?? "The code runner is not connected, so its languages can't be listed."} You can save this question as a draft; choose languages once the runner is
                  configured.
                  {q.allowedLanguages.length > 0 && <> Currently allowed ids: {q.allowedLanguages.join(", ")}.</>}
                </div>
              </div>
            )}
            <ErrorFor name="allowedLanguages" />
          </fieldset>

          {q.allowedLanguages.map((key) => (
            <div className="field" key={key}>
              <label htmlFor={`starter-${key}`}>Starter code — {langName(key)}</label>
              <textarea
                id={`starter-${key}`}
                data-code=""
                spellCheck={false}
                rows={6}
                value={q.starterCode[key] ?? ""}
                onChange={(e) => set("starterCode", { ...q.starterCode, [key]: e.target.value })}
              />
            </div>
          ))}

          <div className="form__row form__row--3">
            <div className="field">
              <label htmlFor="q-time">Time limit per case (ms)</label>
              <input id="q-time" type="number" min={100} max={15000} step={100} value={q.timeLimitMs ?? 2000} onChange={(e) => set("timeLimitMs", Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="q-mem">Memory limit (KB)</label>
              <input id="q-mem" type="number" min={16000} max={512000} step={1000} value={q.memoryLimitKb ?? 256000} onChange={(e) => set("memoryLimitKb", Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="q-scoring">Scoring</label>
              <select id="q-scoring" value={q.scoring ?? "PROPORTIONAL"} onChange={(e) => set("scoring", e.target.value as QuestionDraft["scoring"])}>
                <option value="PROPORTIONAL">Proportional to passed case weights</option>
                <option value="ALL_OR_NOTHING">Full marks only if every case passes</option>
              </select>
            </div>
          </div>

          <fieldset className="field">
            <legend>Test cases</legend>
            <p className="field__hint">
              Sample cases are shown to students. Hidden cases are used for grading and never leave the server. Output is compared after trimming trailing spaces and blank lines.
            </p>
            <div className="stack stack--sm">
              {q.cases.map((c, i) => (
                <div key={i} className="card" style={{ padding: 14 }}>
                  <div className="row row--between" style={{ marginBottom: 8 }}>
                    <strong className="small">Case {i + 1}</strong>
                    <div className="row">
                      <label className="check">
                        <input type="checkbox" checked={c.isSample} onChange={(e) => set("cases", q.cases.map((x, j) => (j === i ? { ...x, isSample: e.target.checked } : x)))} />
                        <span>Sample (visible)</span>
                      </label>
                      <label className="small">
                        Weight{" "}
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={c.weight}
                          onChange={(e) => set("cases", q.cases.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))}
                          style={{ width: 64, minHeight: 32, padding: "4px 8px", border: "1px solid var(--line-strong)", borderRadius: 8 }}
                        />
                      </label>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => set("cases", q.cases.filter((_, j) => j !== i))} aria-label={`Remove case ${i + 1}`}>
                        <Icon name="trash" />
                      </button>
                    </div>
                  </div>
                  <div className="form__row">
                    <div className="field">
                      <label htmlFor={`case-in-${i}`}>Input</label>
                      <textarea id={`case-in-${i}`} data-code="" rows={3} spellCheck={false} value={c.input} onChange={(e) => set("cases", q.cases.map((x, j) => (j === i ? { ...x, input: e.target.value } : x)))} />
                    </div>
                    <div className="field">
                      <label htmlFor={`case-out-${i}`}>Expected output</label>
                      <textarea id={`case-out-${i}`} data-code="" rows={3} spellCheck={false} value={c.expectedOutput} onChange={(e) => set("cases", q.cases.map((x, j) => (j === i ? { ...x, expectedOutput: e.target.value } : x)))} />
                    </div>
                  </div>
                </div>
              ))}
              <div className="row">
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => set("cases", [...q.cases, { isSample: true, input: "", expectedOutput: "", weight: 0 }])}>
                  <Icon name="plus" /> Add sample case
                </button>
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => set("cases", [...q.cases, { isSample: false, input: "", expectedOutput: "", weight: 1 }])}>
                  <Icon name="plus" /> Add hidden case
                </button>
              </div>
            </div>
            <ErrorFor name="cases" />
          </fieldset>
        </>
      )}

      <div className="field">
        <label htmlFor="q-solution">{q.type === "CODING" ? "Reference solution / notes (admin only)" : q.type === "SHORT_ANSWER" ? "Model answer / marking guide" : "Explanation (optional)"}</label>
        <textarea id="q-solution" rows={4} data-code={q.type === "CODING" ? "" : undefined} value={q.solution ?? ""} onChange={(e) => set("solution", e.target.value || null)} />
        <span className="field__hint">Never shown to students unless the test's solution policy releases it after the test closes.</span>
      </div>

      <SubmitButton>{questionId ? "Save question" : "Add question"}</SubmitButton>
    </ActionForm>
  );
}
