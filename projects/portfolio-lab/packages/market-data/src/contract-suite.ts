import { expect } from "vitest";

import { isCurrencyCode, isDecimalString } from "@portfolio-lab/domain";

import {
  ProviderError,
  type InstrumentCandidate,
  type MarketDataProvider,
  type NormalizedQuote,
  type PriceBar,
  type ResolvedInstrument,
} from "./contract.js";

/**
 * Assertions de conformité au contrat fournisseur.
 *
 * Regroupées ici plutôt que dupliquées dans chaque suite d'adaptateur : tous
 * les adaptateurs doivent passer **exactement** les mêmes vérifications, sinon
 * « remplaçable par configuration » ne veut rien dire.
 *
 * Le module exporte des assertions et non une suite complète : chaque
 * adaptateur a ses propres fixtures et ses propres cas d'erreur, mais les
 * invariants ci-dessous ne se négocient pas.
 */

/** Un horodatage doit être une date ISO 8601 valide, en UTC. */
export function assertIsoTimestamp(value: string, context: string): void {
  expect(value, `${context} : horodatage vide`).toBeTruthy();
  const parsed = Date.parse(value);
  expect(Number.isNaN(parsed), `${context} : horodatage illisible « ${value} »`).toBe(false);
  // Le contrat impose l'UTC : un horodatage sans fuseau serait interprété
  // différemment selon la machine.
  expect(value, `${context} : horodatage sans fuseau`).toMatch(/(Z|[+-]\d{2}:\d{2})$/);
}

/**
 * Vérifie qu'une quote respecte tous les invariants du contrat.
 *
 * C'est l'assertion centrale : une quote mal formée qui atteindrait le moteur
 * de valorisation produirait un total faux sans le signaler.
 */
export function assertValidQuote(quote: NormalizedQuote, context: string): void {
  expect(isDecimalString(quote.price), `${context} : prix non décimal « ${quote.price} »`).toBe(
    true,
  );
  // Zéro ne doit jamais signifier « pas de donnée ».
  expect(Number(quote.price), `${context} : prix nul ou négatif`).toBeGreaterThan(0);
  expect(isCurrencyCode(quote.currency), `${context} : devise inconnue`).toBe(true);
  expect(quote.provider, `${context} : fournisseur manquant`).toBeTruthy();
  expect(quote.providerSymbol, `${context} : symbole fournisseur manquant`).toBeTruthy();

  assertIsoTimestamp(quote.asOf, `${context} asOf`);
  assertIsoTimestamp(quote.receivedAt, `${context} receivedAt`);

  if (quote.bid !== undefined) {
    expect(isDecimalString(quote.bid), `${context} : bid non décimal`).toBe(true);
    expect(Number(quote.bid), `${context} : bid nul ou négatif`).toBeGreaterThan(0);
  }
  if (quote.ask !== undefined) {
    expect(isDecimalString(quote.ask), `${context} : ask non décimal`).toBe(true);
    expect(Number(quote.ask), `${context} : ask nul ou négatif`).toBeGreaterThan(0);
  }
  if (quote.bid !== undefined && quote.ask !== undefined) {
    // Un spread inversé signale une donnée corrompue ; la laisser passer
    // produirait un midpoint absurde.
    expect(Number(quote.bid), `${context} : spread inversé`).toBeLessThanOrEqual(Number(quote.ask));
  }
  if (quote.previousClose !== undefined) {
    expect(isDecimalString(quote.previousClose), `${context} : clôture non décimale`).toBe(true);
  }
}

/**
 * Vérifie qu'un fournisseur n'annonce jamais une fraîcheur meilleure que celle
 * qu'il déclare pouvoir servir.
 *
 * C'est le garde-fou anti-mensonge : un fournisseur en plan différé ne doit pas
 * pouvoir émettre une quote marquée `LIVE`.
 */
export function assertFreshnessWithinCapabilities(
  provider: MarketDataProvider,
  quote: NormalizedQuote,
  context: string,
): void {
  const rank = { LIVE: 0, DELAYED: 1, EOD: 2, NAV: 3, MANUAL: 4, STALE: 5, UNAVAILABLE: 6 };
  const best = provider.capabilities().bestFreshness;

  /*
   * `NAV` est légitime pour un fonds même si le fournisseur annonce mieux :
   * une NAV n'est pas une dégradation, c'est la nature de l'instrument. On
   * vérifie donc uniquement qu'aucune quote ne prétend être *plus fraîche* que
   * ce qui est déclaré.
   */
  if (quote.freshness === "NAV") {
    return;
  }
  expect(
    rank[quote.freshness],
    `${context} : quote annoncée ${quote.freshness} alors que le fournisseur ne peut servir que ${best}`,
  ).toBeGreaterThanOrEqual(rank[best]);
}

export function assertValidCandidate(candidate: InstrumentCandidate, context: string): void {
  expect(candidate.name, `${context} : nom manquant`).toBeTruthy();
  expect(candidate.providerSymbol, `${context} : symbole manquant`).toBeTruthy();
  expect(isCurrencyCode(candidate.currency), `${context} : devise inconnue`).toBe(true);
  expect(candidate.confidence, `${context} : confiance hors plage`).toBeGreaterThanOrEqual(0);
  expect(candidate.confidence, `${context} : confiance hors plage`).toBeLessThanOrEqual(1);
  if (candidate.exchangeMic !== null) {
    expect(candidate.exchangeMic, `${context} : MIC mal formé`).toMatch(/^[A-Z0-9]{4}$/);
  }
}

export function assertValidResolution(instrument: ResolvedInstrument, context: string): void {
  expect(instrument.providerSymbol, `${context} : symbole manquant`).toBeTruthy();
  expect(isCurrencyCode(instrument.currency), `${context} : devise inconnue`).toBe(true);

  if (instrument.assetType === "OPTION") {
    const contract = instrument.optionContract;
    expect(contract, `${context} : option sans contrat canonique`).not.toBeNull();
    if (contract !== null) {
      expect(isDecimalString(contract.multiplier), `${context} : multiplicateur non décimal`).toBe(
        true,
      );
      // Un multiplicateur supposé fausserait toute la valorisation du contrat.
      expect(Number(contract.multiplier), `${context} : multiplicateur nul`).toBeGreaterThan(0);
      expect(isDecimalString(contract.strike), `${context} : strike non décimal`).toBe(true);
      expect(Number(contract.strike), `${context} : strike nul`).toBeGreaterThan(0);
      expect(contract.expiration, `${context} : échéance mal formée`).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      );
    }
  } else {
    expect(
      instrument.optionContract,
      `${context} : contrat d'option sur un instrument non optionnel`,
    ).toBeNull();
  }
}

export function assertValidHistory(bars: readonly PriceBar[], context: string): void {
  for (const bar of bars) {
    expect(bar.date, `${context} : date mal formée`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(isDecimalString(bar.close), `${context} : clôture non décimale`).toBe(true);
    expect(Number(bar.close), `${context} : clôture nulle`).toBeGreaterThan(0);
    if (bar.high !== null && bar.low !== null) {
      expect(Number(bar.high), `${context} : haut inférieur au bas`).toBeGreaterThanOrEqual(
        Number(bar.low),
      );
    }
  }
  // Ordre chronologique strict : un historique désordonné fausserait tout
  // graphique et tout calcul de performance.
  const dates = bars.map((bar) => bar.date);
  expect(dates, `${context} : historique non trié`).toEqual([...dates].sort());
  expect(new Set(dates).size, `${context} : dates en double`).toBe(dates.length);
}

/** Vérifie qu'une erreur respecte la taxonomie normalisée. */
export function assertProviderError(
  error: unknown,
  expectedKind: ProviderError["kind"],
  context: string,
): void {
  expect(error, `${context} : erreur non normalisée`).toBeInstanceOf(ProviderError);
  expect((error as ProviderError).kind, `${context} : mauvais type d'erreur`).toBe(expectedKind);
  expect((error as ProviderError).provider, `${context} : fournisseur manquant`).toBeTruthy();
}
