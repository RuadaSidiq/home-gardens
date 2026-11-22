"use client";
import { createContext, useActionState, useContext, useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClass, type ButtonVariant } from "./button";
import type { ActionResult } from "@/server/errors";

type Action = (prev: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>;

/**
 * Form bound to a server action. Shows the returned error/success message,
 * highlights field errors, optionally resets or refreshes on success.
 */
export function ActionForm({
  action, children, className, resetOnSuccess, onSuccess, successMessage, refresh = true, showMessage = true, ...rest
}: {
  action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean; onSuccess?: (r: ActionResult<unknown>) => void; successMessage?: string; refresh?: boolean; showMessage?: boolean;
} & Omit<ComponentProps<"form">, "action" | "onSubmit">) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
      if (refresh) router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form ref={ref} action={formAction} className={className} noValidate={false} {...rest}>
      {showMessage && state && !state.ok && (
        <p role="alert" className="mb-4 rounded-md border border-clay-500/30 bg-clay-50 px-3 py-2 text-sm text-clay-700">{state.error}</p>
      )}
      {showMessage && state?.ok && (state.message || successMessage) && (
        <p role="status" className="mb-4 rounded-md border border-forest-200 bg-forest-50 px-3 py-2 text-sm text-forest-800">{state.message ?? successMessage}</p>
      )}
      <ErrorScope errors={state && !state.ok ? state.fieldErrors ?? {} : {}}>{children}</ErrorScope>
    </form>
  );
}

const ErrCtx = createContext<Record<string, string>>({});
function ErrorScope({ errors, children }: { errors: Record<string, string>; children: ReactNode }) {
  return <ErrCtx.Provider value={errors}>{children}</ErrCtx.Provider>;
}
export function useFieldError(name?: string) {
  const errs = useContext(ErrCtx);
  return name ? errs[name.replace(/\[\]$/, "")] : undefined;
}

export function SubmitButton({ children, variant = "primary", size = "md", className, pendingLabel, ...rest }: { children: ReactNode; variant?: ButtonVariant; size?: "sm" | "md" | "lg"; className?: string; pendingLabel?: string } & Omit<ComponentProps<"button">, "type">) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || rest.disabled} aria-busy={pending} className={buttonClass({ variant, size, className })} {...rest}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

const inputBase =
  "block w-full rounded-md border border-sand-300 bg-white px-3 text-[15px] text-ink placeholder:text-sand-500 shadow-[inset_0_1px_1px_rgba(0,0,0,.03)] transition-colors focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500/20 disabled:bg-sand-100 disabled:text-ink-muted aria-[invalid=true]:border-clay-500 aria-[invalid=true]:ring-clay-500/20";

export function Field({ label, name, hint, required, children, className, error: errorProp }: { label?: ReactNode; name?: string; hint?: ReactNode; required?: boolean; children: (p: { id: string; invalid: boolean; describedBy?: string }) => ReactNode; className?: string; error?: string }) {
  const id = useId();
  const error = useFieldError(name) ?? errorProp;
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label} {required && <span className="text-clay-600" aria-hidden>*</span>}
        </label>
      )}
      {children({ id, invalid: !!error, describedBy })}
      {error ? <p id={`${id}-err`} className="text-[13px] text-clay-600">{error}</p> : hint ? <p id={`${id}-hint`} className="text-[13px] text-ink-muted">{hint}</p> : null}
    </div>
  );
}

type InputProps = { label?: ReactNode; hint?: ReactNode; wrapClassName?: string; prefix?: ReactNode } & ComponentProps<"input">;
export function Input({ label, hint, wrapClassName, className, prefix, ...p }: InputProps) {
  return (
    <Field label={label} name={p.name} hint={hint} required={p.required} className={wrapClassName}>
      {({ id, invalid, describedBy }) =>
        prefix ? (
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-ink-muted">{prefix}</span>
            <input id={id} aria-invalid={invalid} aria-describedby={describedBy} className={cn(inputBase, "h-10 pl-12", className)} {...p} />
          </div>
        ) : (
          <input id={id} aria-invalid={invalid} aria-describedby={describedBy} className={cn(inputBase, p.type === "file" ? "py-2 file:mr-3 file:rounded file:border-0 file:bg-forest-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-forest-700" : "h-10", className)} {...p} />
        )
      }
    </Field>
  );
}

export function Textarea({ label, hint, wrapClassName, className, ...p }: { label?: ReactNode; hint?: ReactNode; wrapClassName?: string } & ComponentProps<"textarea">) {
  return (
    <Field label={label} name={p.name} hint={hint} required={p.required} className={wrapClassName}>
      {({ id, invalid, describedBy }) => <textarea id={id} aria-invalid={invalid} aria-describedby={describedBy} rows={4} className={cn(inputBase, "py-2", className)} {...p} />}
    </Field>
  );
}

export function Select({ label, hint, wrapClassName, className, options, placeholder, ...p }: { label?: ReactNode; hint?: ReactNode; wrapClassName?: string; options: { value: string | number; label: string; disabled?: boolean }[]; placeholder?: string } & ComponentProps<"select">) {
  return (
    <Field label={label} name={p.name} hint={hint} required={p.required} className={wrapClassName}>
      {({ id, invalid, describedBy }) => (
        <select id={id} aria-invalid={invalid} aria-describedby={describedBy} className={cn(inputBase, "h-10 pr-8", className)} {...p}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Checkbox({ label, description, className, ...p }: { label: ReactNode; description?: ReactNode } & ComponentProps<"input">) {
  const id = useId();
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border-sand-400 text-forest-600 accent-forest-600" {...p} />
      <label htmlFor={id} className="text-sm leading-snug">
        <span className="font-medium">{label}</span>
        {description && <span className="block text-ink-muted">{description}</span>}
      </label>
    </div>
  );
}

/** Button that submits a single server action with hidden fields; optional confirmation. */
export function ActionButton({ action, fields, children, variant = "outline", size = "sm", confirm, className, refresh = true }: { action: Action; fields?: Record<string, string>; children: ReactNode; variant?: ButtonVariant; size?: "sm" | "md" | "lg"; confirm?: string; className?: string; refresh?: boolean }) {
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && refresh) router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={formAction} onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }} className={cn("inline-flex flex-col items-start", className)}>
      {fields && Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton variant={variant} size={size}>{children}</SubmitButton>
      {state && !state.ok && <span role="alert" className="mt-1 text-xs text-clay-600">{state.error}</span>}
    </form>
  );
}

/** Native <dialog> modal. */
export function Modal({ trigger, title, children, triggerVariant = "outline", triggerSize = "sm", wide }: { trigger: ReactNode; title: string; children: (close: () => void) => ReactNode; triggerVariant?: ButtonVariant; triggerSize?: "sm" | "md" | "lg"; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => { ref.current?.close(); setOpen(false); };
  return (
    <>
      <button type="button" className={buttonClass({ variant: triggerVariant, size: triggerSize })} onClick={() => { ref.current?.showModal(); setOpen(true); }}>
        {trigger}
      </button>
      <dialog ref={ref} onClose={() => setOpen(false)} className={cn("w-[calc(100%-2rem)] rounded-lg border border-sand-200 p-0 shadow-pop backdrop:bg-ink/40", wide ? "max-w-2xl" : "max-w-lg")}>
        <div className="flex items-center justify-between border-b border-sand-200 px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={close} className="rounded p-1 text-ink-muted hover:bg-sand-100" aria-label="Close">✕</button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{open && children(close)}</div>
      </dialog>
    </>
  );
}
