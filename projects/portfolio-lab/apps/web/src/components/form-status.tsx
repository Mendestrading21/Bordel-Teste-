"use client";

import { useFormStatus } from "react-dom";

import type { ActionResult } from "@/lib/data/validation";

/**
 * Bouton de soumission désactivé pendant l'envoi.
 *
 * Un double envoi créerait une position en double ; `useFormStatus` est le
 * moyen natif de l'empêcher sans état local.
 */
export function SubmitButton({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[var(--pl-touch-target)] w-full items-center justify-center rounded-token-md border border-copper px-5 text-sm font-medium text-copper transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
      style={{ transitionDuration: "var(--pl-transition-fast)" }}
    >
      {pending ? "Enregistrement…" : children}
    </button>
  );
}

/** Retour d'une action, annoncé aux lecteurs d'écran. */
export function FormMessage({
  result,
}: Readonly<{ result: ActionResult }>): React.JSX.Element | null {
  if (result.status === "idle") {
    return null;
  }
  const isError = result.status === "error";
  return (
    <p
      role={isError ? "alert" : "status"}
      className={`mt-3 rounded-token-sm border px-3 py-2 text-sm ${
        isError ? "border-negative/40 text-negative" : "border-positive/40 text-positive"
      }`}
    >
      {result.message}
    </p>
  );
}

/** Message d'erreur associé à un champ précis. */
export function FieldError({
  result,
  field,
}: Readonly<{ result: ActionResult; field: string }>): React.JSX.Element | null {
  if (result.status !== "error" || result.fieldErrors?.[field] === undefined) {
    return null;
  }
  return (
    <p id={`${field}-error`} className="mt-1 text-xs text-negative">
      {result.fieldErrors[field]}
    </p>
  );
}
