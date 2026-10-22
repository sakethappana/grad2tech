import { ActionForm, CheckList, Select, SubmitButton, TextArea, TextField } from "@/components/forms";
import type { ProjectBrief } from "@/generated/prisma/client";
import { toLocalInput } from "@/lib/display";
import { TEMPLATE_LIST } from "@/server/workspace/templates";
import { saveBriefAction } from "./actions";

export function BriefForm({
  brief,
  targets,
  options,
}: {
  brief?: ProjectBrief | null;
  targets?: { batchIds: string[]; studentIds: string[] };
  options: { batches: { value: string; label: string }[]; students: { value: string; label: string }[] };
}) {
  return (
    <ActionForm action={saveBriefAction}>
      {brief && <input type="hidden" name="id" value={brief.id} />}
      <TextField name="title" label="Project title" defaultValue={brief?.title} required />
      <TextArea name="description" label="Brief" rows={10} defaultValue={brief?.description} hint="Requirements, acceptance criteria and marking notes. Markdown supported." required />
      <div className="form__row form__row--3">
        <Select name="starterTemplate" label="Starter project" options={TEMPLATE_LIST.map((t) => ({ value: t.key, label: t.name }))} defaultValue={brief?.starterTemplate ?? "fullstack"} />
        <TextField name="dueAt" label="Due (optional)" type="datetime-local" defaultValue={toLocalInput(brief?.dueAt)} />
        <TextField name="maxMarks" label="Maximum marks" type="number" min={1} max={1000} defaultValue={brief?.maxMarks ?? 100} />
      </div>
      <div className="form__row">
        <CheckList name="batchIds" legend="Assign to batches" options={options.batches} defaultValues={targets?.batchIds} />
        <CheckList name="studentIds" legend="…or to selected students" options={options.students} defaultValues={targets?.studentIds} />
      </div>
      <SubmitButton>{brief ? "Save project" : "Create draft"}</SubmitButton>
    </ActionForm>
  );
}
