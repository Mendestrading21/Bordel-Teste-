"use client";

import { useActionState } from "react";

import { SUPPORTED_CURRENCIES, type CurrencyCode, type DecimalString } from "@portfolio-lab/domain";
import { formatQuantity } from "@portfolio-lab/ui";

import { updatePositionAction } from "@/lib/data/actions";
import type { ActionResult } from "@/lib/data/validation";

import { FieldError, FormMessage, SubmitButton } from "./form-status";

const INITIAL: ActionResult = { status: "idle" };

const FIELD_CLASS =
  "mt-1 block min-h-[var(--pl-touch-target)] w-full rounded-token-md border border-subtle bg-elevated px-3 text-sm text-primary";

/**
 * Modification d'une position.
 *
 * Ni l'instrument ni le compte ne sont modifiables, et c'est délibéré : changer
 * l'instrument d'une position réécrirait son passé, puisque les points
 * d'historique déjà enregistrés ont été calculés sur le titre d'origine.
 * Corriger une erreur d'instrument passe par une suppression et une
 * ressaisie — ce qui laisse une trace cohérente au lieu d'une ligne dont le
 * passé ne correspond à rien.
 *
 * Les montants sont des champs `text` avec `inputMode="decimal"`, jamais
 * `type="number"` : celui-ci accepte la notation exponentielle et normalise la
 * valeur selon la locale du navigateur.
 */
export function EditPositionForm({
  positionId,
  quantity,
  averageCost,
  costCurrency,
  notes,
}: Readonly<{
  positionId: string;
  quantity: DecimalString;
  averageCost: DecimalString;
  costCurrency: CurrencyCode;
  notes: string | null;
}>): React.JSX.Element {
  const [result, action] = useActionState(updatePositionAction, INITIAL);

  return (
    <section className="mt-6 rounded-token-lg border border-subtle bg-surface px-5 py-4">
      <h2 className="text-xs tracking-wide text-secondary uppercase">Modifier</h2>
      <p className="mt-1 mb-3 text-sm text-secondary">
        L&apos;instrument et le compte ne sont pas modifiables : les changer réécrirait le passé de
        cette position. Pour corriger un instrument, supprimez la position et ressaisissez-la.
      </p>

      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={positionId} />

        <div>
          <label htmlFor="quantity" className="text-sm font-medium text-primary">
            Quantité
          </label>
          <input
            id="quantity"
            name="quantity"
            type="text"
            inputMode="decimal"
            required
            defaultValue={formatQuantity(quantity, "en-US")}
            className={FIELD_CLASS}
          />
          <FieldError result={result} field="quantity" />
        </div>

        <div>
          <label htmlFor="averageCost" className="text-sm font-medium text-primary">
            Coût moyen
          </label>
          <input
            id="averageCost"
            name="averageCost"
            type="text"
            inputMode="decimal"
            required
            /*
             * `en-US` sans séparateur de milliers : le champ doit être relu par
             * le même analyseur décimal que la saisie initiale, pas mis en forme
             * à la suisse. Une apostrophe de milliers serait refusée à l'envoi.
             */
            defaultValue={formatQuantity(averageCost, "en-US").replace(/,/g, "")}
            className={FIELD_CLASS}
          />
          <FieldError result={result} field="averageCost" />
        </div>

        <div>
          <label htmlFor="costCurrency" className="text-sm font-medium text-primary">
            Devise d&apos;achat
          </label>
          <select
            id="costCurrency"
            name="costCurrency"
            required
            defaultValue={costCurrency}
            className={FIELD_CLASS}
          >
            {SUPPORTED_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
          <FieldError result={result} field="costCurrency" />
        </div>

        <div>
          <label htmlFor="notes" className="text-sm font-medium text-primary">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={notes ?? ""}
            className={`${FIELD_CLASS} py-2`}
          />
          <FieldError result={result} field="notes" />
        </div>

        <SubmitButton>Enregistrer les modifications</SubmitButton>
        <FormMessage result={result} />
      </form>
    </section>
  );
}
