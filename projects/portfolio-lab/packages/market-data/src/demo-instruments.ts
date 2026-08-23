import { toDecimalString } from "@portfolio-lab/domain";

import type { MockInstrument } from "./mock-provider.js";

/**
 * Instruments connus du fournisseur simulé.
 *
 * **Tous fictifs.** Les noms portent « Démo » ou « fictif » et les ISIN
 * utilisent le code pays `XX`, jamais attribué à un émetteur réel. Ils
 * correspondent exactement au jeu de `supabase/seed.sql`, pour que la passerelle
 * puisse servir des cours aux positions de démonstration.
 *
 * Exporté depuis le package plutôt que dupliqué dans la passerelle : deux
 * listes divergentes produiraient des positions sans cours, symptôme difficile
 * à diagnostiquer.
 */
export const DEMO_INSTRUMENTS: readonly MockInstrument[] = [
  {
    symbol: "DEMOI",
    name: "Démo Industrie SA",
    assetType: "STOCK",
    currency: "CHF",
    exchangeMic: "XSWX",
    isin: "XX000000DEM0",
  },
  {
    symbol: "DEMOT",
    name: "Démo Technologies Inc (fictif)",
    assetType: "STOCK",
    currency: "USD",
    exchangeMic: "XNAS",
    isin: null,
  },
  {
    symbol: "DEMOW",
    name: "Démo Monde ETF (fictif)",
    assetType: "ETF",
    currency: "USD",
    exchangeMic: "XNYS",
    isin: "XX000000DE27",
  },
  {
    symbol: "DEMOF",
    name: "Démo Fonds Équilibré P CHF (fictif)",
    assetType: "MUTUAL_FUND",
    currency: "CHF",
    exchangeMic: null,
    isin: "XX000000DE35",
  },
  {
    symbol: "DEMOCASH",
    name: "Liquidités CHF",
    assetType: "CASH",
    currency: "CHF",
    exchangeMic: null,
    isin: null,
  },
  {
    symbol: "DEMOT270115C00100000",
    name: "Démo Technologies CALL 100 (fictif)",
    assetType: "OPTION",
    currency: "USD",
    exchangeMic: "XCBO",
    isin: null,
    optionContract: {
      underlyingSymbol: "DEMOT",
      optionType: "CALL",
      expiration: "2027-01-15",
      strike: toDecimalString("100"),
      // Lu explicitement, jamais supposé.
      multiplier: toDecimalString("100"),
      osiSymbol: "DEMOT270115C00100000",
      exerciseStyle: "AMERICAN",
      settlementType: "PHYSICAL",
    },
  },
];

/** Taux de change fictifs correspondants. */
export const DEMO_FX_RATES: ReadonlyMap<string, ReturnType<typeof toDecimalString>> = new Map([
  ["USD/CHF", toDecimalString("0.8900")],
  ["EUR/CHF", toDecimalString("0.9400")],
]);
