"use client";

import { useState } from "react";
import { ActionForm, CopyField, Select, SubmitButton, TextField } from "@/components/forms";
import { inviteAction } from "../people-actions";

export function InviteForm({ batches, defaultBatch }: { batches: { value: string; label: string }[]; defaultBatch?: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [role, setRole] = useState("STUDENT");
  return (
    <div className="stack stack--sm">
      <ActionForm
        action={inviteAction}
        resetOnSuccess
        onSuccess={(r) => setLink(((r.data as { link?: string; emailed?: boolean } | undefined)?.link) ?? null)}
      >
        <TextField name="name" label="Full name" required autoComplete="off" />
        <TextField name="email" label="Email" type="email" required autoComplete="off" />
        <div className="field">
          <label htmlFor="invite-role">Account type</label>
          <select id="invite-role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="STUDENT">Student (admitted after selection)</option>
            <option value="ADMIN">Admin / trainer</option>
          </select>
          <span className="field__hint">Roles are set here by admins only. There is no public sign-up.</span>
        </div>
        {role === "STUDENT" && (
          <>
            <Select name="batchId" label="Batch" options={batches} defaultValue={defaultBatch} placeholder="Choose a batch" required />
            <TextField name="startDate" label="Enrolment date" type="date" hint="Defaults to today." />
          </>
        )}
        <SubmitButton pendingText="Creating invitation…">Create invitation</SubmitButton>
      </ActionForm>
      {link && (
        <div className="alert alert--info">
          <div style={{ width: "100%" }}>
            <CopyField label="One-time invitation link (valid 7 days)" value={link} />
            <p className="small" style={{ marginTop: 6 }}>
              Share it privately with the student. It is shown only once.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
