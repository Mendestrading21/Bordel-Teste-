"use client";

import { useActionState } from "react";

import { archiveAccountAction, createAccountAction } from "@/lib/data/actions";
import type { ActionResult } from "@/lib/data/validation";

import { FieldError, FormMessage, SubmitButton } from "./form-status";

const INITIAL: ActionResult = { status: "idle" };

const FIELD_CLASS =
  "mt-1 block min-h-[var(--pl-touch-target)] w-full rounded-token-md border border-subtle bg-elevated px-3 text-sm text-primary";

/**
 * Création d'un compte.
 *
 * Le formulaire ne demande **aucun identifiant bancaire** : il n'existe aucun
 * champ, aucun schéma et aucune colonne capables d'en recevoir. Un compte est
 * une étiquette d'organisation, rien de plus.
 */
export function CreateAccountForm(): React.JSX.Element {
  const [result, action] = useActionState(createAccountAction, INITIAL);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="name" className="text-sm font-medium text-primary">
          Nom du compte
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={80}
          placeholder="Swissquote Actions"
          className={FIELD_CLASS}
        />
        <FieldError result={result} field="name" />
      </div>

      <div>
        <label htmlFor="institutionLabel" className="text-sm font-medium text-primary">
          Établissement <span className="text-secondary">(optionnel)</span>
        </label>
        <input
          id="institutionLabel"
          name="institutionLabel"
          type="text"
          maxLength={80}
          placeholder="Swissquote"
          aria-describedby="institution-hint"
          className={FIELD_CLASS}
        />
        <p id="institution-hint" className="mt-1 text-xs text-secondary">
          Simple étiquette. PortfolioLab ne se connecte à aucun établissement et ne demande jamais
          d&apos;identifiant bancaire.
        </p>
        <FieldError result={result} field="institutionLabel" />
      </div>

      <SubmitButton>Créer le compte</SubmitButton>
      <FormMessage result={result} />
    </form>
  );
}

/** Archivage d'un compte — les positions sont préservées. */
export function ArchiveAccountForm({
  accountId,
  name,
}: Readonly<{ accountId: string; name: string }>): React.JSX.Element {
  const [result, action] = useActionState(archiveAccountAction, INITIAL);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={accountId} />
      <button
        type="submit"
        className="min-h-[var(--pl-touch-target)] px-2 text-xs text-secondary hover:text-negative"
      >
        Archiver<span className="sr-only"> le compte {name}</span>
      </button>
      <FormMessage result={result} />
    </form>
  );
}
