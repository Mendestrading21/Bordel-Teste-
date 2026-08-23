import type { CurrencyCode } from "@portfolio-lab/domain";

import type { InstrumentCandidate } from "./contract.js";

/**
 * Identification d'une classe de parts de fonds.
 *
 * Le risque propre aux fonds est unique dans le produit : deux classes de parts
 * du **même** fonds portent un nom presque identique, une devise parfois
 * différente et des frais très différents. « Pictet - Water P EUR » et
 * « Pictet - Water I EUR » ne diffèrent que par une lettre, et leurs NAV
 * s'écartent de plusieurs pourcents.
 *
 * Confondre les deux ne produit pas une erreur visible : cela produit un
 * portefeuille dont la valeur est plausible mais fausse, durablement. D'où la
 * règle : **l'ISIN fait foi**, et toute ambiguïté remonte à l'utilisateur.
 */

/** Classe de parts, telle qu'on peut la déduire d'un nom ou d'un champ dédié. */
export type ShareClassInfo = {
  /** Étiquette brute du fournisseur, jamais réécrite. */
  readonly label: string | null;
  readonly currency: CurrencyCode | null;
  /** `true` si la classe capitalise ses revenus plutôt que de les distribuer. */
  readonly accumulating: boolean | null;
};

/** Résultat d'une résolution de fonds. */
export type FundResolution =
  | { readonly kind: "RESOLVED"; readonly candidate: InstrumentCandidate }
  /**
   * Plusieurs candidats plausibles.
   *
   * Jamais résolu automatiquement : `MARKET_DATA.md` interdit de sélectionner
   * une classe de parts proche à la place de l'utilisateur.
   */
  | { readonly kind: "AMBIGUOUS"; readonly candidates: readonly InstrumentCandidate[] }
  | { readonly kind: "NOT_FOUND" }
  /** Trouvé, mais un attribut vérifiable contredit la demande. */
  | {
      readonly kind: "MISMATCH";
      readonly candidate: InstrumentCandidate;
      readonly reason: "CURRENCY" | "ISIN";
    };

const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

/**
 * Valide un ISIN : format **et** clé de contrôle Luhn.
 *
 * Même algorithme que la contrainte PostgreSQL, réimplémenté ici pour valider
 * avant d'appeler un fournisseur — envoyer un ISIN fauté peut résoudre un
 * **autre** instrument, ce qui est pire qu'une absence de résultat.
 */
export function isValidIsin(candidate: string): boolean {
  if (!ISIN_PATTERN.test(candidate)) {
    return false;
  }

  let expanded = "";
  for (const character of candidate) {
    expanded += /\d/.test(character) ? character : String(character.charCodeAt(0) - 55);
  }

  let total = 0;
  // Luhn : on double un chiffre sur deux en partant de l'avant-dernier ; le
  // chiffre de contrôle lui-même n'est jamais doublé.
  let double = false;
  for (let index = expanded.length - 1; index >= 0; index -= 1) {
    let digit = Number(expanded[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    total += digit;
    double = !double;
  }

  return total % 10 === 0;
}

/** Pays d'émission d'un ISIN, utile pour distinguer deux cotations. */
export function isinCountry(isin: string): string | null {
  return isValidIsin(isin) ? isin.slice(0, 2) : null;
}

/**
 * Extrait ce qu'on peut déduire de la classe de parts depuis un nom.
 *
 * Le résultat est **indicatif** : il sert à afficher et à alerter, jamais à
 * choisir. Les conventions de nommage varient d'un émetteur à l'autre, et une
 * heuristique qui trancherait à la place de l'utilisateur finirait par se
 * tromper sur un fonds au nom inhabituel.
 */
export function parseShareClass(name: string, currency: CurrencyCode | null): ShareClassInfo {
  // Classes usuelles en fin de nom : « P », « I », « R », « Z », « P dy »…
  const classMatch = /\b([A-Z])(?:\s+(?:acc|dy|dist))?\b(?=\s+[A-Z]{3}\b|\s*$)/.exec(name);

  const accumulating = /\bacc\b|\bcapitalisation\b/i.test(name)
    ? true
    : /\bdist\b|\bdy\b|\bdistribution\b/i.test(name)
      ? false
      : null;

  return {
    label: classMatch?.[1] ?? null,
    currency,
    accumulating,
  };
}

/**
 * Choisit parmi des candidats retournés par un fournisseur.
 *
 * La règle est stricte et volontairement peu « intelligente » :
 *
 * 1. si un ISIN est demandé, seul un candidat portant **exactement** cet ISIN
 *    est accepté ;
 * 2. plusieurs correspondances exactes restent ambiguës — c'est le cas d'un
 *    fonds coté sur plusieurs places ;
 * 3. sans ISIN, on ne devine jamais : deux candidats ou plus sont ambigus.
 */
export function resolveFundCandidate(
  candidates: readonly InstrumentCandidate[],
  requested: { readonly isin?: string; readonly currency?: CurrencyCode },
): FundResolution {
  if (candidates.length === 0) {
    return { kind: "NOT_FOUND" };
  }

  if (requested.isin !== undefined) {
    const exact = candidates.filter((candidate) => candidate.isin === requested.isin);

    if (exact.length === 0) {
      // Des candidats existent mais aucun ne porte l'ISIN demandé : renvoyer le
      // « plus proche » risquerait de valoriser une autre classe de parts.
      return { kind: "NOT_FOUND" };
    }
    if (exact.length > 1) {
      return { kind: "AMBIGUOUS", candidates: exact };
    }

    const candidate = exact[0] as InstrumentCandidate;
    if (requested.currency !== undefined && candidate.currency !== requested.currency) {
      // ISIN juste, devise différente : c'est une anomalie de données, pas un
      // choix à faire silencieusement.
      return { kind: "MISMATCH", candidate, reason: "CURRENCY" };
    }
    return { kind: "RESOLVED", candidate };
  }

  const filtered =
    requested.currency === undefined
      ? candidates
      : candidates.filter((candidate) => candidate.currency === requested.currency);

  if (filtered.length === 0) {
    return { kind: "NOT_FOUND" };
  }
  if (filtered.length > 1) {
    return { kind: "AMBIGUOUS", candidates: filtered };
  }
  return { kind: "RESOLVED", candidate: filtered[0] as InstrumentCandidate };
}
