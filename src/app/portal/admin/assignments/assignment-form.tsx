import { ActionForm, Checkbox, CheckList, FileField, Select, SubmitButton, TextArea, TextField } from "@/components/forms";
import type { Assignment } from "@/generated/prisma/client";
import { toLocalInput } from "@/lib/display";
import { ALLOWED_EXTENSIONS } from "@/server/storage";
import { saveAssignmentAction } from "./actions";

export function AssignmentForm({
  assignment,
  targets,
  options,
}: {
  assignment?: Assignment | null;
  targets?: { batchIds: string[]; studentIds: string[] };
  options: { batches: { value: string; label: string }[]; students: { value: string; label: string }[] };
}) {
  const types = assignment?.responseTypes ?? ["TEXT", "CODE"];
  return (
    <ActionForm action={saveAssignmentAction}>
      {assignment && <input type="hidden" name="id" value={assignment.id} />}
      <TextField name="title" label="Title" defaultValue={assignment?.title} required />
      <div className="form__row--3 form__row">
        <TextField name="topic" label="Topic" defaultValue={assignment?.topic} placeholder="e.g. JavaScript arrays" required />
        <Select
          name="difficulty"
          label="Difficulty"
          options={[
            { value: "EASY", label: "Easy" },
            { value: "MEDIUM", label: "Medium" },
            { value: "HARD", label: "Hard" },
          ]}
          defaultValue={assignment?.difficulty ?? "MEDIUM"}
        />
        <TextField name="maxMarks" label="Maximum marks" type="number" min={1} max={1000} defaultValue={assignment?.maxMarks ?? 10} />
      </div>
      <TextArea
        name="instructions"
        label="Instructions"
        rows={10}
        defaultValue={assignment?.instructions}
        hint="Markdown supported: headings, lists, links, tables and ```code blocks```."
        required
      />
      <div className="form__row">
        <TextField name="dueAt" label="Due date and time" type="datetime-local" defaultValue={toLocalInput(assignment?.dueAt)} required />
        <div className="field">
          <span className="label">Late submissions</span>
          <Checkbox name="allowLate" label="Accept submissions after the due date (marked late)" defaultChecked={assignment?.allowLate ?? false} />
        </div>
      </div>
      <fieldset className="field">
        <legend>Accepted response formats</legend>
        <div className="checks">
          <Checkbox name="responseTypes" value="TEXT" label="Written response" defaultChecked={types.includes("TEXT")} />
          <Checkbox name="responseTypes" value="CODE" label="Code" defaultChecked={types.includes("CODE")} />
          <Checkbox name="responseTypes" value="LINK" label="Project link" defaultChecked={types.includes("LINK")} />
          <Checkbox name="responseTypes" value="FILE" label="File attachments" defaultChecked={types.includes("FILE")} />
        </div>
      </fieldset>
      <div className="form__row">
        <CheckList name="batchIds" legend="Assign to batches" options={options.batches} defaultValues={targets?.batchIds} />
        <CheckList name="studentIds" legend="…or to selected students" options={options.students} defaultValues={targets?.studentIds} hint="Students in the chosen batches are included automatically." />
      </div>
      <FileField name="resources" label="Attach resources (optional)" hint={`Up to 5 files, 10 MB each. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.`} />
      <div className="form__actions">
        <SubmitButton>{assignment ? "Save changes" : "Save as draft"}</SubmitButton>
        <span className="small muted">You can publish or schedule it on the next screen.</span>
      </div>
    </ActionForm>
  );
}
