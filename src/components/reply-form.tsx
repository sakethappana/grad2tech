import { ActionForm, FileField, SubmitButton, TextArea, TextField } from "./forms";
import { replyDoubtAction } from "@/app/portal/doubt-actions";

export function ReplyForm({ threadId, label = "Reply" }: { threadId: string; label?: string }) {
  return (
    <ActionForm action={replyDoubtAction} resetOnSuccess>
      <input type="hidden" name="threadId" value={threadId} />
      <TextArea name="body" label={label} rows={5} hint="Markdown supported: **bold**, lists, `code` and ```code blocks```." />
      <details>
        <summary className="link-button" style={{ cursor: "pointer" }}>
          Add a code snippet or screenshot
        </summary>
        <div className="stack stack--sm" style={{ marginTop: 12 }}>
          <TextField name="codeLanguage" label="Language" placeholder="e.g. JavaScript" />
          <TextArea name="codeSnippet" label="Code" rows={6} code />
          <FileField name="screenshots" label="Screenshots" accept="image/png,image/jpeg,image/webp" hint="PNG, JPG or WebP, up to 10 MB each." />
        </div>
      </details>
      <SubmitButton pendingText="Posting…">Post reply</SubmitButton>
    </ActionForm>
  );
}
