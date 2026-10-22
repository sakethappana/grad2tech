import { ActionForm, Checkbox, CheckList, Select, SubmitButton, TextArea, TextField } from "@/components/forms";
import type { Assessment } from "@/generated/prisma/client";
import { toLocalInput } from "@/lib/display";
import { saveTestSettingsAction } from "./actions";

export function TestSettingsForm({
  test,
  targets,
  options,
}: {
  test?: Assessment | null;
  targets?: { batchIds: string[]; studentIds: string[] };
  options: { batches: { value: string; label: string }[]; students: { value: string; label: string }[] };
}) {
  const now = new Date();
  return (
    <ActionForm action={saveTestSettingsAction}>
      {test && <input type="hidden" name="id" value={test.id} />}
      <div className="form__row">
        <TextField name="title" label="Title" defaultValue={test?.title} required />
        <Select
          name="kind"
          label="Type"
          options={[
            { value: "PRACTICE", label: "Daily practice test" },
            { value: "WEEKLY", label: "Weekly examination" },
          ]}
          defaultValue={test?.kind ?? "PRACTICE"}
        />
      </div>
      <TextArea name="instructions" label="Instructions" rows={4} defaultValue={test?.instructions} hint="Shown before students start. Markdown supported." />
      <div className="form__row form__row--3">
        <TextField name="opensAt" label="Opens" type="datetime-local" defaultValue={toLocalInput(test?.opensAt ?? new Date(now.getTime() + 3600_000))} required />
        <TextField name="closesAt" label="Closes" type="datetime-local" defaultValue={toLocalInput(test?.closesAt ?? new Date(now.getTime() + 26 * 3600_000))} required />
        <TextField name="durationMinutes" label="Attempt duration (minutes)" type="number" min={1} max={600} defaultValue={test?.durationMinutes ?? 30} required />
      </div>
      <p className="small muted" style={{ marginTop: -6 }}>
        Each attempt ends at the earlier of the closing time and start time + duration. The server enforces it even if the browser closes.
      </p>
      <div className="form__row form__row--3">
        <TextField name="maxAttempts" label="Allowed attempts" type="number" min={1} max={20} defaultValue={test?.maxAttempts ?? 1} />
        <TextField name="passPercent" label="Pass mark (%)" type="number" min={0} max={100} defaultValue={test?.passPercent ?? ""} hint="Optional." />
        <div className="field">
          <span className="label">Question order</span>
          <Checkbox name="randomizeQuestions" label="Shuffle per student" defaultChecked={test?.randomizeQuestions ?? false} />
        </div>
      </div>
      <div className="form__row form__row--3">
        <Select
          name="resultPolicy"
          label="Result release"
          options={[
            { value: "MANUAL", label: "When an admin releases them" },
            { value: "AFTER_CLOSE", label: "Automatically after the test closes" },
            { value: "WHEN_GRADED", label: "As soon as each attempt is graded" },
          ]}
          defaultValue={test?.resultPolicy ?? "MANUAL"}
        />
        <Select
          name="solutionPolicy"
          label="Solutions"
          options={[
            { value: "NEVER", label: "Never show" },
            { value: "WITH_RESULTS", label: "Show with results, after close" },
          ]}
          defaultValue={test?.solutionPolicy ?? "NEVER"}
        />
        <Select
          name="helpPolicy"
          label="Doubts while open"
          options={[
            { value: "NO_HELP_WHILE_OPEN", label: "Not allowed until it closes" },
            { value: "PRIVATE_CLARIFICATION", label: "Private clarification only" },
            { value: "ALLOWED", label: "Allowed (always private while open)" },
          ]}
          defaultValue={test?.helpPolicy ?? "NO_HELP_WHILE_OPEN"}
        />
      </div>
      <div className="form__row">
        <CheckList name="batchIds" legend="Assign to batches" options={options.batches} defaultValues={targets?.batchIds} />
        <CheckList name="studentIds" legend="…or to selected students" options={options.students} defaultValues={targets?.studentIds} />
      </div>
      <SubmitButton>{test ? "Save settings" : "Create test"}</SubmitButton>
    </ActionForm>
  );
}
