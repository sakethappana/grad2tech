"use client";

import { useState } from "react";
import { ActionForm, CopyField, SubmitButton } from "@/components/forms";
import { resetLinkAction } from "../../people-actions";

export function ResetLinkButton({ userId }: { userId: string }) {
  const [link, setLink] = useState<string | null>(null);
  return (
    <div className="stack stack--sm">
      <ActionForm action={resetLinkAction} onSuccess={(r) => setLink((r.data as { link?: string } | undefined)?.link ?? null)}>
        <input type="hidden" name="userId" value={userId} />
        <SubmitButton variant="secondary" pendingText="Creating link…">
          Create password reset link
        </SubmitButton>
      </ActionForm>
      {link && <CopyField label="Reset link (one use, valid 1 hour)" value={link} />}
    </div>
  );
}
