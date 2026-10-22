"use client";

import { useRouter } from "next/navigation";
import { createContext, useActionState, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Icon } from "./icons";

export type ActionResult<T = unknown> =
  | { ok: true; message?: string; data?: T & { redirect?: string } }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

const ErrorsContext = createContext<Record<string, string>>({});

/** Wraps a Server Action form: pending state, field errors, success message and optional redirect. */
export function ActionForm({
  action,
  children,
  className = "form",
  resetOnSuccess = false,
  id,
  onSuccess,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  id?: string;
  onSuccess?: (r: Extract<ActionResult, { ok: true }>) => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<ActionResult | null>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
      const target = (state.data as { redirect?: string } | undefined)?.redirect;
      if (target) router.push(target);
      else router.refresh();
    } else {
      // Move focus to the first invalid field, or the error summary.
      const first = state.fieldErrors ? Object.keys(state.fieldErrors)[0] : null;
      const el = first ? formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`) : null;
      (el ?? formRef.current?.querySelector<HTMLElement>("[data-form-error]"))?.focus();
    }
  }, [state, resetOnSuccess, router, onSuccess]);

  return (
    <ErrorsContext.Provider value={state && !state.ok ? (state.fieldErrors ?? {}) : {}}>
      <form ref={formRef} action={formAction} className={className} id={id} noValidate>
        {state && !state.ok && (
          <div className="alert alert--bad" role="alert" tabIndex={-1} data-form-error>
            <Icon name="alert" />
            <div>{state.error}</div>
          </div>
        )}
        {state && state.ok && state.message && (
          <div className="alert alert--ok" role="status">
            <Icon name="check" />
            <div>{state.message}</div>
          </div>
        )}
        {children}
      </form>
    </ErrorsContext.Provider>
  );
}

export function useFieldError(name: string) {
  return useContext(ErrorsContext)[name];
}

type FieldProps = {
  name: string;
  label: string;
  hint?: ReactNode;
  required?: boolean;
};

function FieldShell({ name, label, hint, children, id }: FieldProps & { children: ReactNode; id: string }) {
  const error = useFieldError(name);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && (
        <span className="field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field__error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}

function useFieldA11y(name: string, hint?: ReactNode) {
  const id = useId();
  const error = useFieldError(name);
  return {
    id,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  };
}

export function TextField({
  type = "text",
  defaultValue,
  placeholder,
  autoComplete,
  min,
  max,
  step,
  ...p
}: FieldProps & {
  type?: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  autoComplete?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
}) {
  const a = useFieldA11y(p.name, p.hint);
  return (
    <FieldShell {...p} id={a.id}>
      <input
        {...a}
        name={p.name}
        type={type}
        defaultValue={defaultValue ?? undefined}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={p.required}
        min={min}
        max={max}
        step={step}
      />
    </FieldShell>
  );
}

export function TextArea({
  defaultValue,
  rows = 5,
  code = false,
  placeholder,
  maxLength,
  ...p
}: FieldProps & { defaultValue?: string | null; rows?: number; code?: boolean; placeholder?: string; maxLength?: number }) {
  const a = useFieldA11y(p.name, p.hint);
  return (
    <FieldShell {...p} id={a.id}>
      <textarea
        {...a}
        name={p.name}
        rows={rows}
        defaultValue={defaultValue ?? undefined}
        required={p.required}
        placeholder={placeholder}
        maxLength={maxLength}
        data-code={code ? "" : undefined}
        spellCheck={code ? false : undefined}
      />
    </FieldShell>
  );
}

export function Select({
  options,
  defaultValue,
  placeholder,
  ...p
}: FieldProps & { options: { value: string; label: string }[]; defaultValue?: string | null; placeholder?: string }) {
  const a = useFieldA11y(p.name, p.hint);
  return (
    <FieldShell {...p} id={a.id}>
      <select {...a} name={p.name} defaultValue={defaultValue ?? ""} required={p.required}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function Checkbox({ name, label, defaultChecked, value = "on" }: { name: string; label: ReactNode; defaultChecked?: boolean; value?: string }) {
  return (
    <label className="check">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} />
      <span>{label}</span>
    </label>
  );
}

/** Multi-select as a scrollable checkbox list (keyboard and screen-reader friendly). */
export function CheckList({
  name,
  legend,
  options,
  defaultValues = [],
  hint,
}: {
  name: string;
  legend: string;
  options: { value: string; label: string }[];
  defaultValues?: string[];
  hint?: string;
}) {
  const error = useFieldError(name);
  const [filter, setFilter] = useState("");
  const visible = filter ? options.filter((o) => o.label.toLowerCase().includes(filter.toLowerCase())) : options;
  return (
    <fieldset className="field">
      <legend>{legend}</legend>
      {options.length > 8 && (
        <input type="search" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={`Filter ${legend}`} />
      )}
      <div className="multi">
        {options.length === 0 && <span className="muted small">None available</span>}
        {options.map((o) => (
          <label className="check" key={o.value} hidden={!visible.includes(o)}>
            <input type="checkbox" name={name} value={o.value} defaultChecked={defaultValues.includes(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {hint && !error && <span className="field__hint">{hint}</span>}
      {error && <span className="field__error">{error}</span>}
    </fieldset>
  );
}

export function FileField({ name, label, hint, multiple = true, accept }: { name: string; label: string; hint?: string; multiple?: boolean; accept?: string }) {
  const a = useFieldA11y(name, hint);
  return (
    <FieldShell name={name} label={label} hint={hint} id={a.id}>
      <input {...a} type="file" name={name} multiple={multiple} accept={accept} />
    </FieldShell>
  );
}

export function SubmitButton({ children, variant = "primary", pendingText, name, value, className = "" }: { children: ReactNode; variant?: "primary" | "secondary" | "dark" | "danger"; pendingText?: string; name?: string; value?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`btn btn--${variant} ${className}`.trim()} disabled={pending} aria-busy={pending} name={name} value={value}>
      {pending ? (pendingText ?? "Saving…") : children}
    </button>
  );
}

/** A small form with a two-step confirmation (no browser dialogs). */
export function ConfirmAction({
  action,
  fields,
  label,
  confirmLabel = "Confirm",
  variant = "secondary",
  description,
}: {
  action: Action;
  fields: Record<string, string>;
  label: string;
  confirmLabel?: string;
  variant?: "secondary" | "danger" | "primary" | "dark";
  description?: string;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <ActionForm action={action} className="row" onSuccess={() => setArmed(false)}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {!armed ? (
        <button type="button" className={`btn btn--${variant} btn--sm`} onClick={() => setArmed(true)}>
          {label}
        </button>
      ) : (
        <>
          {description && <span className="small muted">{description}</span>}
          <SubmitButton variant={variant === "secondary" ? "dark" : variant}>{confirmLabel}</SubmitButton>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setArmed(false)}>
            Cancel
          </button>
        </>
      )}
    </ActionForm>
  );
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input ref={ref} readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label={label} style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn--secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              ref.current?.select();
            }
          }}
        >
          <Icon name={copied ? "check" : "copy"} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
