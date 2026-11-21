"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/actions/auth";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function SubmitButton({
  children,
  pending: pendingText,
  className = "btn btn-primary",
}: {
  children: React.ReactNode;
  pending?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? (pendingText ?? "Un instant…") : children}
    </button>
  );
}

/** Formulaire branché sur une Server Action, avec message d'erreur / de succès. */
export function ActionForm({
  action,
  children,
  className = "space-y-4",
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {} as FormState);
  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && (
        <p role="alert" className="alert alert-error">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="alert alert-ok">
          {state.message}
        </p>
      )}
    </form>
  );
}
