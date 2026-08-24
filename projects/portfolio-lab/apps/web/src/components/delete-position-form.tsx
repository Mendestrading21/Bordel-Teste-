"use client";

import { useActionState } from "react";

import { deletePositionAction } from "@/lib/data/actions";
import type { ActionResult } from "@/lib/data/validation";

import { FormMessage, SubmitButton } from "./form-status";

const INITIAL: ActionResult = { status: "idle" };

/**
 * Suppression d'une position.
 *
 * Le nom de l'instrument figure dans le libellé du bouton : une suppression est
 * irréversible, l'utilisateur doit voir ce qu'il supprime au moment de cliquer.
 */
export function DeletePositionForm({
  positionId,
  name,
}: Readonly<{ positionId: string; name: string }>): React.JSX.Element {
  const [result, action] = useActionState(deletePositionAction, INITIAL);

  return (
    <form action={action} className="mt-6">
      <input type="hidden" name="id" value={positionId} />
      <div className="rounded-token-lg border border-negative/30 bg-surface px-5 py-4">
        <h2 className="text-xs tracking-wide text-negative uppercase">Supprimer</h2>
        <p className="mt-1 mb-3 text-sm text-secondary">
          La position est retirée définitivement du portefeuille. Cette action ne peut pas être
          annulée.
        </p>
        <SubmitButton variant="danger" pendingLabel="Suppression…">
          Supprimer « {name} »
        </SubmitButton>
        <FormMessage result={result} />
      </div>
    </form>
  );
}
