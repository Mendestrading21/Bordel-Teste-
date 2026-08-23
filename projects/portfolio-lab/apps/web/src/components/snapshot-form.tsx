"use client";

import { useActionState } from "react";

import { recordSnapshotAction } from "@/lib/data/actions";
import type { ActionResult } from "@/lib/data/validation";

import { FormMessage, SubmitButton } from "./form-status";

const INITIAL: ActionResult = { status: "idle" };

/**
 * Enregistrement manuel d'un point d'historique.
 *
 * L'action est déclenchée par l'utilisateur, jamais par l'affichage de la page :
 * écrire en base à chaque consultation ferait grossir l'historique de points
 * identiques et transformerait une lecture en écriture.
 */
export function SnapshotForm(): React.JSX.Element {
  const [result, action] = useActionState(recordSnapshotAction, INITIAL);

  return (
    <form action={action}>
      <SubmitButton>Enregistrer un point d&apos;historique</SubmitButton>
      <FormMessage result={result} />
    </form>
  );
}
