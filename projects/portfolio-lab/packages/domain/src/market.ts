import { z } from "zod";

/**
 * Fraîcheur d'une valorisation, telle qu'elle est affichée à l'utilisateur.
 *
 * Cette énumération est le garde-fou central du produit : aucune valeur ne
 * circule sans son niveau de fraîcheur, ce qui rend structurellement impossible
 * de présenter une NAV ou une clôture comme un cours temps réel.
 */
export const QUOTE_FRESHNESS = [
  "LIVE",
  "DELAYED",
  "EOD",
  "NAV",
  "MANUAL",
  "STALE",
  "UNAVAILABLE",
] as const;

export type QuoteFreshness = (typeof QUOTE_FRESHNESS)[number];

export const quoteFreshnessSchema = z.enum(QUOTE_FRESHNESS);

/** Libellés utilisateur, alignés sur `references/UX_UI.md`. */
export const QUOTE_FRESHNESS_LABEL: Readonly<Record<QuoteFreshness, string>> = {
  LIVE: "En direct",
  DELAYED: "Différé",
  EOD: "Dernière clôture",
  NAV: "Dernière NAV",
  MANUAL: "Manuel",
  STALE: "Donnée périmée",
  UNAVAILABLE: "Indisponible",
};

/** Nature du prix retenu pour valoriser une position. */
export const PRICE_TYPES = [
  "LAST_TRADE",
  "MID",
  "BID",
  "ASK",
  "PREVIOUS_CLOSE",
  "NAV",
  "MANUAL",
] as const;

export type PriceType = (typeof PRICE_TYPES)[number];

export const priceTypeSchema = z.enum(PRICE_TYPES);

export const PRICE_TYPE_LABEL: Readonly<Record<PriceType, string>> = {
  LAST_TRADE: "Dernier échange",
  MID: "Milieu bid/ask",
  BID: "Bid",
  ASK: "Ask",
  PREVIOUS_CLOSE: "Clôture précédente",
  NAV: "Valeur nette d'inventaire",
  MANUAL: "Saisie manuelle",
};

/** Classes d'actifs supportées en V1. */
export const ASSET_TYPES = ["STOCK", "ETF", "OPTION", "MUTUAL_FUND", "CASH", "OTHER"] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export const assetTypeSchema = z.enum(ASSET_TYPES);

export const ASSET_TYPE_LABEL: Readonly<Record<AssetType, string>> = {
  STOCK: "Action",
  ETF: "ETF",
  OPTION: "Option",
  MUTUAL_FUND: "Fonds de placement",
  CASH: "Liquidités",
  OTHER: "Autre",
};

export const MARKET_STATES = ["PRE", "OPEN", "AFTER", "CLOSED", "UNKNOWN"] as const;

export type MarketState = (typeof MARKET_STATES)[number];

export const marketStateSchema = z.enum(MARKET_STATES);

/**
 * `true` si la fraîcheur correspond à une donnée effectivement exploitable
 * pour une valorisation. `STALE` reste exploitable mais doit être signalée ;
 * `UNAVAILABLE` ne l'est pas.
 */
export function isValuable(freshness: QuoteFreshness): boolean {
  return freshness !== "UNAVAILABLE";
}
