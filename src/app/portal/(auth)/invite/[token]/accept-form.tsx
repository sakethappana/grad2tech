"use client";

import { ActionForm, SubmitButton, TextField } from "@/components/forms";
import { acceptInviteAction } from "./actions";

export function AcceptInviteForm({ token }: { token: string }) {
  return (
    <ActionForm action={acceptInviteAction}>
      <input type="hidden" name="token" value={token} />
      <TextField name="password" label="Password" type="password" autoComplete="new-password" hint="At least 10 characters." required />
      <TextField name="confirm" label="Confirm password" type="password" autoComplete="new-password" required />
      <SubmitButton pendingText="Activating…">Activate account</SubmitButton>
    </ActionForm>
  );
}
