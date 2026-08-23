import { decimal, toDecimalString, type DecimalString } from "@portfolio-lab/domain";

import type { OptionType } from "./osi.js";

/**
 * Chaîne d'options : sélection guidée d'un contrat.
 *
 * `UX_UI.md` impose un parcours en cinq étapes — sous-jacent, call/put,
 * échéance, strike, vérification du contrat — plutôt qu'une saisie libre de
 * symbole. La raison est simple : un symbole OSI mal tapé désigne un **autre**
 * contrat existant, pas une erreur, et la position serait durablement fausse.
 */

export type ChainContract = {
  readonly providerSymbol: string;
  readonly osiSymbol: string | null;
  readonly optionType: OptionType;
  readonly expiration: string;
  readonly strike: DecimalString;
  /** Lu chez le fournisseur, jamais supposé. */
  readonly multiplier: DecimalString;
  readonly currency: string;
  readonly bid?: DecimalString;
  readonly ask?: DecimalString;
  readonly last?: DecimalString;
  /** Intérêt ouvert, quand le fournisseur le publie. Aide à juger la liquidité. */
  readonly openInterest?: number;
};

export type OptionChain = {
  readonly underlyingSymbol: string;
  readonly contracts: readonly ChainContract[];
  readonly asOf: string;
};

/**
 * Échéances disponibles, triées par ordre chronologique.
 *
 * Le tri est lexicographique parce que les dates sont en ISO `AAAA-MM-JJ` : il
 * coïncide alors avec l'ordre chronologique, sans conversion.
 */
export function expirationsOf(chain: OptionChain): readonly string[] {
  return [...new Set(chain.contracts.map((contract) => contract.expiration))].sort();
}

/**
 * Strikes disponibles pour une échéance et un type donnés.
 *
 * Triés numériquement et non lexicographiquement : `"100"` précède `"20"` en
 * tri de chaînes, ce qui rendrait la liste illisible.
 */
export function strikesOf(
  chain: OptionChain,
  expiration: string,
  optionType: OptionType,
): readonly DecimalString[] {
  const strikes = chain.contracts
    .filter((contract) => contract.expiration === expiration && contract.optionType === optionType)
    .map((contract) => contract.strike);

  return [...new Set(strikes)].sort((a, b) => decimal(a).comparedTo(decimal(b)));
}

/**
 * Retrouve un contrat exact.
 *
 * La correspondance de strike est **décimale** : « 200 » et « 200.000 »
 * désignent le même contrat, mais une comparaison de chaînes les distinguerait.
 */
export function findContract(
  chain: OptionChain,
  criteria: {
    readonly optionType: OptionType;
    readonly expiration: string;
    readonly strike: DecimalString;
  },
): ChainContract | null {
  const target = decimal(criteria.strike);
  return (
    chain.contracts.find(
      (contract) =>
        contract.optionType === criteria.optionType &&
        contract.expiration === criteria.expiration &&
        decimal(contract.strike).equals(target),
    ) ?? null
  );
}

/** Écart entre le strike et le cours du sous-jacent, en fraction du cours. */
export function moneyness(
  strike: DecimalString,
  underlyingPrice: DecimalString,
): DecimalString | null {
  const price = decimal(underlyingPrice);
  if (price.lessThanOrEqualTo(0)) {
    return null;
  }
  return decimal(strike).minus(price).div(price).toFixed(6) as DecimalString;
}

/**
 * Anomalies détectables sur un contrat, avant de l'enregistrer.
 *
 * Elles n'empêchent pas l'enregistrement — l'utilisateur peut avoir une raison —
 * mais doivent être montrées. Un multiplicateur inhabituel accepté en silence
 * fausserait la valorisation d'un facteur entier.
 */
export type ContractWarning =
  | { readonly kind: "UNUSUAL_MULTIPLIER"; readonly multiplier: DecimalString }
  | { readonly kind: "EXPIRED"; readonly expiration: string }
  | { readonly kind: "EXPIRING_SOON"; readonly daysRemaining: number }
  | { readonly kind: "NO_QUOTES" }
  | { readonly kind: "WIDE_SPREAD"; readonly relativeSpread: DecimalString }
  | { readonly kind: "MISSING_OSI" };

/** Multiplicateur usuel des options sur actions américaines. */
export const STANDARD_MULTIPLIER: DecimalString = toDecimalString("100");

export function inspectContract(
  contract: ChainContract,
  daysRemaining: number,
): readonly ContractWarning[] {
  const warnings: ContractWarning[] = [];

  if (!decimal(contract.multiplier).equals(decimal(STANDARD_MULTIPLIER))) {
    /*
     * Un multiplicateur différent de 100 est parfaitement légitime — contrat
     * ajusté après un split, option sur indice — mais il doit être vu. C'est
     * l'erreur la plus coûteuse du domaine : elle fausse la valeur d'un facteur
     * entier sans rien casser.
     */
    warnings.push({ kind: "UNUSUAL_MULTIPLIER", multiplier: contract.multiplier });
  }

  if (daysRemaining < 0) {
    warnings.push({ kind: "EXPIRED", expiration: contract.expiration });
  } else if (daysRemaining <= 7) {
    warnings.push({ kind: "EXPIRING_SOON", daysRemaining });
  }

  if (contract.bid === undefined && contract.ask === undefined && contract.last === undefined) {
    warnings.push({ kind: "NO_QUOTES" });
  } else if (contract.bid !== undefined && contract.ask !== undefined) {
    const bid = decimal(contract.bid);
    const ask = decimal(contract.ask);
    const mid = bid.plus(ask).div(2);
    if (mid.greaterThan(0)) {
      const relative = ask.minus(bid).div(mid);
      if (relative.greaterThan(0.5)) {
        warnings.push({
          kind: "WIDE_SPREAD",
          relativeSpread: relative.toFixed(4) as DecimalString,
        });
      }
    }
  }

  if (contract.osiSymbol === null) {
    // Sans symbole canonique, le rapprochement avec un autre fournisseur
    // reposera sur les seuls attributs — moins sûr.
    warnings.push({ kind: "MISSING_OSI" });
  }

  return warnings;
}

export const CONTRACT_WARNING_LABEL: Readonly<Record<ContractWarning["kind"], string>> = {
  UNUSUAL_MULTIPLIER:
    "Multiplicateur inhabituel : vérifiez qu'il s'agit bien du contrat voulu. " +
    "Un contrat ajusté après un split ne vaut pas 100.",
  EXPIRED: "Ce contrat est arrivé à échéance.",
  EXPIRING_SOON: "Ce contrat arrive à échéance dans moins d'une semaine.",
  NO_QUOTES: "Aucune cotation publiée pour ce contrat.",
  WIDE_SPREAD:
    "Fourchette bid/ask très large : la valorisation par le milieu serait peu significative.",
  MISSING_OSI: "Aucun symbole canonique publié par le fournisseur pour ce contrat.",
};
