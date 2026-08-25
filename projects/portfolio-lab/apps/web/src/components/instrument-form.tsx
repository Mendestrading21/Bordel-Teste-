"use client";

import { useActionState, useState } from "react";

import { ASSET_TYPE_LABEL, ASSET_TYPES, SUPPORTED_CURRENCIES } from "@portfolio-lab/domain";

import { createInstrumentAction } from "@/lib/data/actions";
import { IDENTIFIER_KINDS } from "@/lib/data/validation";

import { FieldError, FormMessage } from "./form-status";
import { Button, Card } from "./ui";

const FIELD =
  "mt-1 min-h-[var(--pl-touch-target)] w-full rounded-token-md border border-subtle bg-surface px-3 text-base text-primary placeholder:text-tertiary";

const IDENTIFIER_LABEL: Readonly<Record<(typeof IDENTIFIER_KINDS)[number], string>> = {
  TICKER: "Ticker (ex. AAPL, NESN)",
  ISIN: "ISIN (ex. US0378331005)",
  PROVIDER_SYMBOL: "Symbole d'un fournisseur (ex. AAPL.US)",
};

/**
 * Création d'un instrument.
 *
 * Le sélecteur du formulaire d'ajout lit la table locale, vide sur toute base
 * neuve : sans cet écran, aucune position ne pouvait être saisie, et rien ne
 * l'expliquait — la liste était simplement vide.
 *
 * L'identifiant est **facultatif mais mis en avant** : c'est lui, et lui seul,
 * qui permet de chercher un cours. Un instrument sans identifiant reste
 * parfaitement utilisable, à la valeur que vous saisissez ; l'écran le dit
 * plutôt que de laisser la découverte pour plus tard.
 */
export function InstrumentForm(): React.JSX.Element {
  const [result, action, pending] = useActionState(createInstrumentAction, { status: "idle" });
  const [identifierType, setIdentifierType] = useState<string>("");

  return (
    <Card padding="lg">
      <h2 className="text-sm font-medium text-primary">Nouvel instrument</h2>
      <p className="mt-1 text-xs leading-relaxed text-tertiary">
        Une action, un ETF, un fonds, une ligne de liquidités — tout ce que vous
        détenez et qui n&apos;est pas encore dans la liste.
      </p>

      <form action={action} className="mt-4 space-y-4">
        <div>
          <label htmlFor="name" className="text-sm font-medium text-primary">
            Nom
          </label>
          <input id="name" name="name" required maxLength={120} className={FIELD} />
          <FieldError result={result} field="name" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="assetType" className="text-sm font-medium text-primary">
              Classe
            </label>
            <select id="assetType" name="assetType" required className={FIELD}>
              {ASSET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ASSET_TYPE_LABEL[type]}
                </option>
              ))}
            </select>
            <FieldError result={result} field="assetType" />
          </div>

          <div>
            <label htmlFor="currency" className="text-sm font-medium text-primary">
              Devise
            </label>
            <select id="currency" name="currency" required className={FIELD}>
              {SUPPORTED_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            <FieldError result={result} field="currency" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="shortName" className="text-sm font-medium text-primary">
              Symbole court
              <span className="ml-1 font-normal text-tertiary">(facultatif)</span>
            </label>
            <input id="shortName" name="shortName" maxLength={12} className={FIELD} />
            <FieldError result={result} field="shortName" />
          </div>

          <div>
            <label htmlFor="exchangeMic" className="text-sm font-medium text-primary">
              Place
              <span className="ml-1 font-normal text-tertiary">(facultatif)</span>
            </label>
            <input
              id="exchangeMic"
              name="exchangeMic"
              maxLength={4}
              placeholder="XSWX"
              className={FIELD}
            />
            <FieldError result={result} field="exchangeMic" />
          </div>
        </div>

        <fieldset className="rounded-token-md border border-subtle p-3">
          <legend className="px-1 text-sm font-medium text-primary">
            Identifiant pour les cours
          </legend>
          <p className="text-xs leading-relaxed text-tertiary">
            Sans identifiant, le cours reste celui que vous saisissez. Avec, il
            est cherché automatiquement. Le nom seul ne suffit pas : chercher
            « AAPL » renvoie aussi AAPU, AAPB et AAPD, qui ne sont pas Apple.
          </p>

          <div className="mt-3">
            <label htmlFor="identifierType" className="text-sm font-medium text-primary">
              Type
            </label>
            <select
              id="identifierType"
              name="identifierType"
              className={FIELD}
              value={identifierType}
              onChange={(event) => setIdentifierType(event.target.value)}
            >
              <option value="">Aucun — cours saisi à la main</option>
              {IDENTIFIER_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {IDENTIFIER_LABEL[kind]}
                </option>
              ))}
            </select>
            <FieldError result={result} field="identifierType" />
          </div>

          {identifierType === "" ? null : (
            <>
              <div className="mt-3">
                <label htmlFor="identifierValue" className="text-sm font-medium text-primary">
                  Valeur
                </label>
                <input id="identifierValue" name="identifierValue" className={FIELD} />
                <FieldError result={result} field="identifierValue" />
              </div>

              {identifierType !== "PROVIDER_SYMBOL" ? null : (
                <div className="mt-3">
                  <label htmlFor="identifierProvider" className="text-sm font-medium text-primary">
                    Fournisseur
                  </label>
                  <input
                    id="identifierProvider"
                    name="identifierProvider"
                    placeholder="eodhd"
                    className={FIELD}
                  />
                  {/* Un symbole propriétaire n'existe que dans le référentiel
                      de celui qui l'a émis : sans son nom, il ne désigne rien. */}
                  <FieldError result={result} field="identifierProvider" />
                </div>
              )}
            </>
          )}
        </fieldset>

        <FormMessage result={result} />

        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Créer l'instrument"}
        </Button>
      </form>
    </Card>
  );
}
