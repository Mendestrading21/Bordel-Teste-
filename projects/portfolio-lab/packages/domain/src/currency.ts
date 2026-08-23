import { z } from "zod";

/**
 * Devises ISO 4217 supportées en V1.
 *
 * La liste est volontairement fermée : accepter n'importe quel code à trois
 * lettres laisserait entrer des saisies fantaisistes qu'aucun taux FX ne peut
 * ensuite convertir. Ajouter une devise est un changement explicite, doublé
 * d'une source de taux.
 */
export const SUPPORTED_CURRENCIES = [
  "CHF",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "SEK",
  "NOK",
  "DKK",
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

/** Devise de consolidation du produit. */
export const BASE_CURRENCY: CurrencyCode = "CHF";

export const currencyCodeSchema = z.enum(SUPPORTED_CURRENCIES);

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return currencyCodeSchema.safeParse(value).success;
}

/**
 * Nombre de décimales affichées par devise.
 *
 * Purement présentationnel : la valeur métier garde toute sa précision, seul
 * le rendu est arrondi.
 */
const DISPLAY_FRACTION_DIGITS: Readonly<Partial<Record<CurrencyCode, number>>> = {
  JPY: 0,
};

export function displayFractionDigits(currency: CurrencyCode): number {
  return DISPLAY_FRACTION_DIGITS[currency] ?? 2;
}
