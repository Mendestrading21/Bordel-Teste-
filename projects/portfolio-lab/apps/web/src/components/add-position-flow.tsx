"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { SUPPORTED_CURRENCIES, type AssetType } from "@portfolio-lab/domain";

import { createPositionAction } from "@/lib/data/actions";
import type { ActionResult } from "@/lib/data/validation";

import { ASSET_ICON } from "./asset-icon";
import { FieldError, FormMessage, SubmitButton } from "./form-status";
import { Card, Chip, cx } from "./ui";

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
 * Choix proposés au premier écran.
 *
 * `OTHER` n'est pas une classe d'actifs mais un fourre-tout : il rassemble
 * obligations, crypto, futures et le reste, qui existent dans le domaine mais
 * n'ont pas encore d'écran dédié. Le nommer « Autre » plutôt que de lister
 * douze cartes garde le premier écran lisible d'un coup d'œil.
 */
const CHOICES = [
  { key: "STOCK", label: "Action" },
  { key: "ETF", label: "ETF" },
  { key: "MUTUAL_FUND", label: "Fonds" },
  { key: "OPTION", label: "Option" },
  { key: "CASH", label: "Cash" },
  { key: "OTHER", label: "Autre" },
] as const satisfies readonly { key: AssetType; label: string }[];

type ChoiceKey = (typeof CHOICES)[number]["key"];

/** Classes qui ont leur propre carte ; toutes les autres tombent dans « Autre ». */
const NAMED = new Set<AssetType>(
  CHOICES.map((choice) => choice.key).filter((key) => key !== "OTHER"),
);

function matchesChoice(assetType: AssetType, choice: ChoiceKey): boolean {
  return choice === "OTHER" ? !NAMED.has(assetType) : assetType === choice;
}

/**
 * Parcours d'ajout d'une position, en deux temps.
 *
 * Le formulaire complet posait six questions d'un bloc, dont deux listes
 * déroulantes et trois paragraphes d'explication : sur un écran de 390 px on
 * atteignait à peine le champ « Quantité ». La première question — « qu'est-ce
 * que j'ajoute ? » — suffit pourtant à écarter la quasi-totalité des choix
 * suivants.
 *
 * Le formulaire reste **un seul `<form>` et une seule soumission** : les
 * champs masqués ne sont pas encore montés, jamais rendus cachés. Un champ
 * caché mais présent serait envoyé au serveur, et l'étape n'aurait plus rien
 * d'une étape.
 */
export function AddPositionFlow({
  accounts,
  instruments,
}: Readonly<{
  accounts: readonly AccountOption[];
  instruments: readonly InstrumentOption[];
}>): React.JSX.Element {
  const [choice, setChoice] = useState<ChoiceKey | null>(null);
  const [result, action] = useActionState(createPositionAction, INITIAL);

  /** Nombre d'instruments enregistrés derrière chaque carte. */
  const counts = useMemo(() => {
    const map = new Map<ChoiceKey, number>();
    for (const entry of CHOICES) {
      map.set(entry.key, instruments.filter((i) => matchesChoice(i.assetType, entry.key)).length);
    }
    return map;
  }, [instruments]);

  if (choice === null) {
    return (
      <section aria-labelledby="quoi">
        <h2 id="quoi" className="text-base font-medium text-primary">
          Qu&apos;ajoutez-vous ?
        </h2>

        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CHOICES.map((entry) => {
            const available = (counts.get(entry.key) ?? 0) > 0;

            /*
             * Une option ne se saisit pas comme le reste : le contrat se
             * choisit par étapes — sous-jacent, sens, échéance, strike. Un
             * symbole mal tapé désigne un autre contrat existant, pas une
             * erreur, et rien ne le signalerait.
             */
            if (entry.key === "OPTION") {
              return (
                <li key={entry.key}>
                  <Link
                    href="/ajouter/option"
                    className="flex min-h-[88px] flex-col justify-center gap-1 rounded-token-md border border-subtle bg-surface px-3 py-3 text-left transition-colors hover:bg-elevated"
                    style={{ transitionDuration: "var(--pl-transition-fast)" }}
                  >
                    <span aria-hidden="true" className="text-xl">
                      {ASSET_ICON.OPTION}
                    </span>
                    <span className="text-sm font-medium text-primary">{entry.label}</span>
                    <span className="text-xs text-tertiary">Sélection guidée</span>
                  </Link>
                </li>
              );
            }

            return (
              <li key={entry.key}>
                <button
                  type="button"
                  disabled={!available}
                  onClick={() => setChoice(entry.key)}
                  className={cx(
                    "flex min-h-[88px] w-full flex-col justify-center gap-1 rounded-token-md border px-3 py-3 text-left transition-colors",
                    available
                      ? "border-subtle bg-surface hover:bg-elevated"
                      : "border-subtle/50 bg-surface opacity-50",
                  )}
                  style={{ transitionDuration: "var(--pl-transition-fast)" }}
                >
                  <span aria-hidden="true" className="text-xl">
                    {ASSET_ICON[entry.key]}
                  </span>
                  <span className="text-sm font-medium text-primary">{entry.label}</span>
                  {/*
                   * Une carte inerte doit dire pourquoi. « Aucun instrument
                   * enregistré » est une explication ; une carte grisée
                   * muette laisse croire à une panne.
                   */}
                  <span className="text-xs text-tertiary">
                    {available
                      ? `${counts.get(entry.key)} enregistré${(counts.get(entry.key) ?? 0) > 1 ? "s" : ""}`
                      : "Aucun enregistré"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-3 text-xs text-tertiary">
          Seuls les instruments déjà enregistrés sont proposés. La recherche par nom, ticker ou ISIN
          attend un fournisseur de données réel : en suggérer un que rien n&apos;a résolu donnerait
          une fausse assurance sur l&apos;identité du titre.
        </p>
      </section>
    );
  }

  const chosen = CHOICES.find((entry) => entry.key === choice);
  const visible = instruments.filter((instrument) => matchesChoice(instrument.assetType, choice));

  return (
    <section aria-labelledby="saisie">
      <div className="flex items-center justify-between gap-3">
        <h2 id="saisie" className="flex items-center gap-2 text-base font-medium text-primary">
          <span aria-hidden="true">{ASSET_ICON[choice]}</span>
          {chosen?.label}
        </h2>
        <button
          type="button"
          onClick={() => setChoice(null)}
          className="min-h-[var(--pl-touch-target)] px-2 text-sm text-accent hover:underline"
        >
          Changer
        </button>
      </div>

      <form action={action} className="mt-3 space-y-4">
        <div>
          <label htmlFor="instrumentId" className="text-sm font-medium text-primary">
            Instrument
          </label>
          <select
            id="instrumentId"
            name="instrumentId"
            required
            className={FIELD_CLASS}
            defaultValue={visible.length === 1 ? visible[0]?.id : ""}
          >
            <option value="" disabled>
              Choisir un instrument
            </option>
            {visible.map((instrument) => (
              <option key={instrument.id} value={instrument.id}>
                {instrument.name} · {instrument.currency}
              </option>
            ))}
          </select>
          <FieldError result={result} field="instrumentId" />
        </div>

        <div>
          <label htmlFor="accountId" className="text-sm font-medium text-primary">
            Compte
          </label>
          <select
            id="accountId"
            name="accountId"
            required
            className={FIELD_CLASS}
            defaultValue={accounts.length === 1 ? accounts[0]?.id : ""}
          >
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

        {/*
         * Deux colonnes dès le mobile : quantité et coût sont deux nombres
         * courts, et les empiler coûtait quatre-vingts pixels qui repoussaient
         * le bouton d'enregistrement hors de portée du pouce.
         */}
        <div className="grid grid-cols-2 gap-3">
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
            <p id="quantity-hint" className="mt-1 text-xs text-tertiary">
              Négative si vendeuse.
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
          <p className="mt-1 text-xs text-tertiary">
            Peut différer de la devise de cotation ; le taux appliqué reste consultable sur la
            fiche.
          </p>
          <FieldError result={result} field="costCurrency" />
        </div>

        {/*
         * Les notes sont repliées : optionnelles, elles occupaient quatre
         * lignes entre le dernier champ obligatoire et le bouton, repoussant
         * celui-ci hors de portée du pouce.
         */}
        <details>
          <summary className="flex min-h-[var(--pl-touch-target)] cursor-pointer list-none items-center text-sm text-secondary">
            Ajouter une note (optionnel)
          </summary>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className="mt-1 block w-full rounded-token-md border border-subtle bg-elevated px-3 py-2 text-sm text-primary"
          />
          <FieldError result={result} field="notes" />
        </details>

        <SubmitButton>Enregistrer la position</SubmitButton>
        <FormMessage result={result} />
      </form>
    </section>
  );
}

/** Rappel d'organisation, affiché sous le parcours. */
export function AccountsHint(): React.JSX.Element {
  return (
    <Card padding="md" className="mt-4">
      <Chip tone="neutral">Comptes</Chip>
      <p className="mt-2 text-xs leading-relaxed text-tertiary">
        Un compte est une simple étiquette d&apos;organisation — Swissquote, IBKR, BCGE, UBS ou tout
        autre libellé. Aucun identifiant bancaire n&apos;est demandé et aucune connexion n&apos;est
        établie.
      </p>
    </Card>
  );
}
