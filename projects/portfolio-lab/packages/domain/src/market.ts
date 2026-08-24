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

export const QUOTE_FRESHNESS_LABEL: Readonly<Record<QuoteFreshness, string>> = {
  LIVE: "En direct",
  DELAYED: "Différé",
  EOD: "Dernière clôture",
  NAV: "Dernière NAV",
  MANUAL: "Manuel",
  STALE: "Donnée périmée",
  UNAVAILABLE: "Indisponible",
};

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

/**
 * Taxonomie universelle de PortfolioLab.
 *
 * Elle reste volontairement métier : une source de marché peut avoir cent
 * sous-types, mais l'application les normalise dans ces familles stables.
 */
export const ASSET_TYPES = [
  "STOCK",
  "ETF",
  "OPTION",
  "MUTUAL_FUND",
  "BOND",
  "CRYPTO",
  "FX",
  "INDEX",
  "FUTURE",
  "COMMODITY",
  "STRUCTURED_PRODUCT",
  "PRIVATE_ASSET",
  "CASH",
  "OTHER",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export const assetTypeSchema = z.enum(ASSET_TYPES);

export const ASSET_TYPE_LABEL: Readonly<Record<AssetType, string>> = {
  STOCK: "Action",
  ETF: "ETF",
  OPTION: "Option",
  MUTUAL_FUND: "Fonds de placement",
  BOND: "Obligation",
  CRYPTO: "Crypto",
  FX: "Devise / FX",
  INDEX: "Indice",
  FUTURE: "Future",
  COMMODITY: "Matière première",
  STRUCTURED_PRODUCT: "Produit structuré",
  PRIVATE_ASSET: "Actif privé",
  CASH: "Liquidités",
  OTHER: "Autre",
};

export const MARKET_STATES = ["PRE", "OPEN", "AFTER", "CLOSED", "UNKNOWN"] as const;

export type MarketState = (typeof MARKET_STATES)[number];

export const marketStateSchema = z.enum(MARKET_STATES);

export function isValuable(freshness: QuoteFreshness): boolean {
  return freshness !== "UNAVAILABLE";
}
