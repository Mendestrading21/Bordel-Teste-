import { isValidIsin } from "./fund-identity.js";
import { parseFuturesSymbol } from "./massive-normalisation.js";
import { parseOsiSymbol } from "./osi.js";

/**
 * Classification d'une saisie libre de recherche.
 *
 * L'utilisateur tape « Apple », « AAPL », « US0378331005 », « BTC »,
 * « ESZ26 » ou un CUSIP dans le même champ. Interroger tous les fournisseurs
 * avec la même chaîne gaspille des requêtes et, plus grave, produit des
 * rapprochements faux : un CUSIP envoyé comme texte libre à un moteur de
 * recherche par nom rend le premier titre dont le nom contient ces neuf
 * caractères.
 *
 * Reconnaître **ce qu'est** la saisie permet d'aller directement au bon
 * fournisseur, avec la bonne référence.
 */
export type QueryKind = "ISIN" | "CUSIP" | "FIGI" | "OPTION_OSI" | "FUTURES" | "TICKER" | "NAME";

export type ClassifiedQuery = {
  readonly kind: QueryKind;
  /** Saisie nettoyée : espaces retirés, casse normalisée quand elle compte. */
  readonly normalized: string;
  /**
   * Pourquoi cette classification.
   *
   * Affichable : « on a reconnu un ISIN valide » aide l'utilisateur à
   * comprendre pourquoi la recherche n'a pas fait ce qu'il attendait.
   */
  readonly reason: string;
};

const CUSIP_PATTERN = /^[0-9A-Z]{8}[0-9]$/;
const FIGI_PATTERN = /^BBG[0-9A-Z]{9}$/;

/**
 * Valeur d'un caractère CUSIP.
 *
 * Les lettres valent leur rang alphabétique plus neuf : `A` vaut 10. `*`, `@`
 * et `#` existent dans la norme pour des usages internes.
 */
function cusipCharValue(char: string): number | null {
  if (char >= "0" && char <= "9") return char.charCodeAt(0) - 48;
  if (char >= "A" && char <= "Z") return char.charCodeAt(0) - 55;
  if (char === "*") return 36;
  if (char === "@") return 37;
  if (char === "#") return 38;
  return null;
}

/**
 * Valide un CUSIP : format **et** clé de contrôle.
 *
 * Sans la clé, un ticker de neuf caractères serait pris pour un CUSIP et
 * envoyé comme identifiant, ce qui résoudrait un autre titre ou rien.
 */
export function isValidCusip(candidate: string): boolean {
  const value = candidate.trim().toUpperCase();
  if (!CUSIP_PATTERN.test(value)) return false;

  let total = 0;
  for (let index = 0; index < 8; index += 1) {
    const char = value[index];
    if (char === undefined) return false;
    const raw = cusipCharValue(char);
    if (raw === null) return false;
    const doubled = index % 2 === 1 ? raw * 2 : raw;
    /*
     * **Somme des chiffres**, et non « retrancher 9 » comme le fait Luhn sur
     * des cartes bancaires. La différence ne se voit que sur les lettres : `R`
     * vaut 27, et 27 doublé fait 54. Retrancher 9 donnerait 45 au lieu de 9,
     * et le CUSIP serait déclaré invalide.
     *
     * Le raccourci « retrancher 9 » n'est correct que pour des valeurs d'au
     * plus 18, ce qui est toujours vrai pour des chiffres et jamais garanti
     * pour des lettres. Le CUSIP de Tesla — 88160R101 — l'a mis en évidence.
     */
    total += Math.floor(doubled / 10) + (doubled % 10);
  }

  const check = (10 - (total % 10)) % 10;
  return check === Number.parseInt(value[8] ?? "", 10);
}

/**
 * Reconnaît la nature d'une saisie.
 *
 * L'ordre des essais suit la **spécificité décroissante**. Un ISIN valide est
 * un ISIN, jamais un nom ; un symbole OSI est un contrat d'option précis,
 * jamais un ticker. Tester le ticker d'abord classerait `ESZ26` comme une
 * action et perdrait l'échéance du future.
 */
export function classifyQuery(input: string): ClassifiedQuery {
  const trimmed = input.trim();
  const compact = trimmed.replace(/\s+/g, "");
  const upper = compact.toUpperCase();

  if (trimmed === "") {
    return { kind: "NAME", normalized: "", reason: "saisie vide" };
  }

  if (isValidIsin(upper)) {
    return { kind: "ISIN", normalized: upper, reason: "ISIN valide, clé de contrôle vérifiée" };
  }

  if (FIGI_PATTERN.test(upper)) {
    return { kind: "FIGI", normalized: upper, reason: "identifiant FIGI" };
  }

  /*
   * Le symbole OSI est testé sur la saisie d'origine : sa forme canonique
   * contient des espaces de cadrage significatifs, que la compaction
   * supprimerait.
   */
  if (parseOsiSymbol(trimmed.toUpperCase()) !== null) {
    return {
      kind: "OPTION_OSI",
      normalized: trimmed.toUpperCase(),
      reason: "symbole d'option OSI",
    };
  }

  if (isValidCusip(upper)) {
    return { kind: "CUSIP", normalized: upper, reason: "CUSIP valide, clé de contrôle vérifiée" };
  }

  /*
   * L'année du contrat n'importe pas pour la classification ; seule la forme
   * compte. On passe l'année courante pour satisfaire la signature.
   */
  if (parseFuturesSymbol(upper, 2000) !== null) {
    return { kind: "FUTURES", normalized: upper, reason: "symbole de future, racine et échéance" };
  }

  /*
   * Un ticker ne contient pas d'espace et reste court. Au-delà, ou dès qu'un
   * espace apparaît, c'est un nom — « Pictet Water » n'est pas un ticker.
   */
  if (!/\s/.test(trimmed) && /^[A-Z0-9][A-Z0-9.\-/]{0,11}$/.test(upper)) {
    return { kind: "TICKER", normalized: upper, reason: "forme de ticker" };
  }

  return { kind: "NAME", normalized: trimmed, reason: "texte libre" };
}

/**
 * Traduit une saisie classée en référence d'instrument, quand c'en est une.
 *
 * Renvoie `null` pour un ticker ou un nom : ceux-là passent par la recherche,
 * qui peut rendre plusieurs candidats. Un identifiant, lui, désigne un seul
 * titre — c'est tout l'intérêt d'en reconnaître un.
 */
export function referenceFromQuery(
  classified: ClassifiedQuery,
):
  | { readonly kind: "ISIN"; readonly isin: string }
  | { readonly kind: "FIGI"; readonly figi: string }
  | null {
  if (classified.kind === "ISIN") return { kind: "ISIN", isin: classified.normalized };
  if (classified.kind === "FIGI") return { kind: "FIGI", figi: classified.normalized };
  return null;
}
