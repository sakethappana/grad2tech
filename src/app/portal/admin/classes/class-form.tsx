import { ActionForm, Select, SubmitButton, TextArea, TextField } from "@/components/forms";
import type { ClassSession } from "@/generated/prisma/client";
import { toLocalInput } from "@/lib/display";
import { saveClassAction } from "./actions";

export function ClassForm({
  session,
  batches,
  instructors,
  defaultBatch,
  defaultInstructor,
}: {
  session?: ClassSession | null;
  batches: { value: string; label: string }[];
  instructors: { value: string; label: string }[];
  defaultBatch?: string;
  defaultInstructor?: string;
}) {
  return (
    <ActionForm action={saveClassAction} resetOnSuccess={!session}>
      {session && <input type="hidden" name="id" value={session.id} />}
      <TextField name="topic" label="Topic" defaultValue={session?.topic} placeholder="e.g. Express routing and middleware" required />
      <div className="form__row">
        <Select name="batchId" label="Batch" options={batches} defaultValue={session?.batchId ?? defaultBatch} placeholder="Choose a batch" />
        <Select name="instructorId" label="Instructor" options={instructors} defaultValue={session?.instructorId ?? defaultInstructor} placeholder="Choose a trainer" />
      </div>
      <div className="form__row">
        <TextField name="startsAt" label="Starts" type="datetime-local" defaultValue={toLocalInput(session?.startsAt ?? new Date(Date.now() + 86_400_000))} required />
        <TextField name="durationMinutes" label="Duration (minutes)" type="number" min={15} max={480} defaultValue={session?.durationMinutes ?? 90} />
      </div>
      <TextField name="meetingUrl" label="Meeting link" type="url" defaultValue={session?.meetingUrl} placeholder="https://…" hint="Students see a Join Class button. Opening it does not record attendance." required />
      <TextArea name="resources" label="Supporting resources" rows={4} defaultValue={session?.resources} hint="Markdown: links to slides, reading, starter code." />
      <SubmitButton>{session ? "Save class" : "Schedule class"}</SubmitButton>
    </ActionForm>
  );
}
