"use client";

import { useActionState } from "react";

import { SUPPORTED_CURRENCIES, type AssetType, ASSET_TYPE_LABEL } from "@portfolio-lab/domain";

import { createPositionAction } from "@/lib/data/actions";
import type { ActionResult } from "@/lib/data/validation";

import { FieldError, FormMessage, SubmitButton } from "./form-status";

const INITIAL: ActionResult = { status: "idle" };

export type AccountOption = { readonly id: string; readonly name: string };
export type InstrumentOption = {
  readonly id: string;
  readonly name: string;
  readonly assetType: AssetType;
  readonly currency: string;
};

const FIELD_CLASS =
  "mt-1 block min-h-[var(--pl-touch-target)] w-full rounded-token-md border border-subtle bg-elevated px-3 text-sm text-primary";

/**
 * Formulaire d'ajout d'une position.
 *
 * Les montants sont des champs `text` avec `inputMode="decimal"` et non
 * `type="number"` : ce dernier déclenche des molettes, accepte la notation
 * exponentielle et normalise la valeur selon la locale du navigateur — trois
 * comportements indésirables pour une saisie financière contrôlée.
 */
export function AddPositionForm({
  accounts,
  instruments,
}: Readonly<{
  accounts: readonly AccountOption[];
  instruments: readonly InstrumentOption[];
}>): React.JSX.Element {
  const [result, action] = useActionState(createPositionAction, INITIAL);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="accountId" className="text-sm font-medium text-primary">
          Compte
        </label>
        <select id="accountId" name="accountId" required className={FIELD_CLASS} defaultValue="">
          <option value="" disabled>
            Choisir un compte
          </option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <FieldError result={result} field="accountId" />
      </div>

      <div>
        <label htmlFor="instrumentId" className="text-sm font-medium text-primary">
          Instrument
        </label>
        <select
          id="instrumentId"
          name="instrumentId"
          required
          className={FIELD_CLASS}
          defaultValue=""
        >
          <option value="" disabled>
            Choisir un instrument
          </option>
          {instruments.map((instrument) => (
            <option key={instrument.id} value={instrument.id}>
              {instrument.name} · {ASSET_TYPE_LABEL[instrument.assetType]} · {instrument.currency}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-secondary">
          La recherche par nom, ticker ou ISIN chez un fournisseur de données arrive au Lot 04.
          Seuls les instruments déjà enregistrés sont proposés.
        </p>
        <FieldError result={result} field="instrumentId" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            placeholder="25"
            aria-describedby="quantity-hint"
            className={`${FIELD_CLASS} pl-numeric`}
          />
          <p id="quantity-hint" className="mt-1 text-xs text-secondary">
            Négative pour une position vendeuse. Pour une option, le nombre de contrats.
          </p>
          <FieldError result={result} field="quantity" />
        </div>

        <div>
          <label htmlFor="averageCost" className="text-sm font-medium text-primary">
            Coût moyen unitaire
          </label>
          <input
            id="averageCost"
            name="averageCost"
            type="text"
            inputMode="decimal"
            required
            placeholder="142.50"
            className={`${FIELD_CLASS} pl-numeric`}
          />
          <FieldError result={result} field="averageCost" />
        </div>
      </div>

      <div>
        <label htmlFor="costCurrency" className="text-sm font-medium text-primary">
          Devise du coût
        </label>
        <select
          id="costCurrency"
          name="costCurrency"
          required
          className={FIELD_CLASS}
          defaultValue="CHF"
        >
          {SUPPORTED_CURRENCIES.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-secondary">
          Peut différer de la devise de cotation ; le taux appliqué est conservé et affiché.
        </p>
        <FieldError result={result} field="costCurrency" />
      </div>

      <div>
        <label htmlFor="notes" className="text-sm font-medium text-primary">
          Notes <span className="text-secondary">(optionnel)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          className="mt-1 block w-full rounded-token-md border border-subtle bg-elevated px-3 py-2 text-sm text-primary"
        />
        <FieldError result={result} field="notes" />
      </div>

      <SubmitButton>Enregistrer la position</SubmitButton>
      <FormMessage result={result} />
    </form>
  );
}
