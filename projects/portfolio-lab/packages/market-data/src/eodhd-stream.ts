import {
  decimal,
  fromDecimal,
  type AssetType,
  type CurrencyCode,
  type DecimalString,
} from "@portfolio-lab/domain";

import { ProviderError, type NormalizedQuote, type ResolvedInstrument } from "./contract.js";
import { EODHD_PROVIDER_ID } from "./eodhd-provider.js";
import { providerDecimal } from "./provider-decimal.js";

/**
 * Canaux temps réel d'EODHD.
 *
 * EODHD n'expose pas un flux unique : chaque famille d'actifs a son propre
 * point d'entrée, et un symbole envoyé sur le mauvais canal n'est simplement
 * jamais coté — sans erreur. Le choix du canal fait donc partie de la
 * correction, pas de la configuration.
 *
 * ⚠️ Le format de fil décrit ici suit la documentation publique d'EODHD. Il
 * n'a **pas** pu être confronté à une vraie connexion depuis cet environnement,
 * dont la politique de sortie réseau refuse `eodhd.com`. Le parseur est isolé
 * et testé sur fixtures précisément pour que cette confrontation, le jour où
 * elle sera possible, ne demande de corriger qu'un seul endroit.
 */
export const EODHD_CHANNELS = ["us", "us-quote", "forex", "crypto"] as const;

export type EodhdChannel = (typeof EODHD_CHANNELS)[number];

/**
 * Canal correspondant à une classe d'actif, ou `null` si EODHD ne diffuse pas
 * cette classe en temps réel.
 *
 * Les actions non américaines n'ont pas de canal : EODHD ne diffuse en direct
 * que les États-Unis, le forex et la crypto. Renvoyer `null` plutôt que de
 * rabattre sur `us` évite d'abonner une action suisse à un flux qui ne la
 * cotera jamais.
 */
export function eodhdChannelFor(instrument: ResolvedInstrument): EodhdChannel | null {
  switch (instrument.assetType) {
    case "FX":
      return "forex";
    case "CRYPTO":
      return "crypto";
    case "STOCK":
    case "ETF":
      return instrument.providerSymbol.toUpperCase().endsWith(".US") ? "us" : null;
    default:
      return null;
  }
}

/** URL du canal. Le jeton reste dans la requête, jamais dans un journal. */
export function eodhdStreamUrl(
  channel: EodhdChannel,
  apiToken: string,
  baseUrl = "wss://ws.eodhistoricaldata.com/ws",
): string {
  return `${baseUrl.replace(/\/$/, "")}/${channel}?api_token=${encodeURIComponent(apiToken)}`;
}

/**
 * Symbole tel que le canal l'attend.
 *
 * Les symboles REST d'EODHD portent un suffixe de place — `AAPL.US` — que le
 * flux temps réel n'utilise pas. Envoyer le symbole REST tel quel donne un
 * abonnement accepté qui ne cote jamais : l'échec le plus coûteux à
 * diagnostiquer, puisqu'il ressemble à un marché fermé.
 */
export function eodhdStreamSymbol(instrument: ResolvedInstrument): string {
  const symbol = instrument.providerSymbol;
  if (instrument.assetType === "FX" || instrument.assetType === "CRYPTO") {
    return symbol.replace(/\.(FOREX|CC)$/i, "");
  }
  return symbol.replace(/\.US$/i, "");
}

export type EodhdSubscribeMessage = {
  readonly action: "subscribe" | "unsubscribe";
  readonly symbols: string;
};

export function eodhdSubscription(
  action: "subscribe" | "unsubscribe",
  symbols: readonly string[],
): EodhdSubscribeMessage {
  return { action, symbols: symbols.join(",") };
}

type RawTick = {
  s?: unknown;
  p?: unknown;
  a?: unknown;
  b?: unknown;
  t?: unknown;
};

/**
 * Horodatage EODHD vers ISO 8601.
 *
 * EODHD envoie des millisecondes sur les canaux actions et des secondes sur
 * certains canaux devises. Les distinguer par leur magnitude est robuste :
 * un horodatage en secondes tient sur dix chiffres jusqu'en 2286, un
 * horodatage en millisecondes en compte treize dès 2001.
 */
function isoFromEpoch(value: number): string {
  const ms = value < 1e11 ? value * 1000 : value;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    throw new ProviderError("MALFORMED_RESPONSE", EODHD_PROVIDER_ID, "Horodatage de flux invalide");
  }
  return date.toISOString();
}

export type EodhdTickContext = {
  readonly instrument: ResolvedInstrument;
  readonly channel: EodhdChannel;
  readonly receivedAt: string;
};

/**
 * Convertit un message de flux en cotation normalisée.
 *
 * Renvoie `null` — sans lever — pour les messages qui ne sont pas des ticks :
 * accusés d'abonnement, battements de cœur, statuts. Ces messages sont normaux
 * et fréquents ; les traiter comme des erreurs remplirait les journaux et
 * déclencherait des reconnexions inutiles.
 *
 * Lève en revanche sur un message qui **prétend** être un tick mais dont le
 * prix ou l'horodatage est inexploitable : là, quelque chose a changé côté
 * fournisseur et le silence serait pire que l'erreur.
 */
export function parseEodhdTick(raw: unknown, context: EodhdTickContext): NormalizedQuote | null {
  if (typeof raw !== "object" || raw === null) return null;
  const tick = raw as RawTick;

  if (typeof tick.s !== "string" || tick.t === undefined || tick.t === null) return null;

  /*
   * Le canal `us-quote` publie une fourchette sans prix de transaction. Le
   * point milieu est une **construction**, pas une observation : il est
   * calculé ici, mais le type de prix le dit explicitement pour que rien en
   * aval ne le confonde avec un dernier échange.
   */
  const hasTrade = tick.p !== undefined && tick.p !== null;
  const hasQuote =
    tick.a !== undefined && tick.a !== null && tick.b !== undefined && tick.b !== null;
  if (!hasTrade && !hasQuote) return null;

  const timestamp = typeof tick.t === "number" ? tick.t : Number(tick.t);
  if (!Number.isFinite(timestamp)) {
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      EODHD_PROVIDER_ID,
      `Horodatage de flux illisible pour ${tick.s}`,
    );
  }

  const bid = hasQuote ? providerDecimal(tick.b, EODHD_PROVIDER_ID, "bid") : undefined;
  const ask = hasQuote ? providerDecimal(tick.a, EODHD_PROVIDER_ID, "ask") : undefined;

  const price = hasTrade ? providerDecimal(tick.p, EODHD_PROVIDER_ID, "price") : midpoint(bid, ask);

  return {
    instrumentId: context.instrument.providerSymbol,
    provider: EODHD_PROVIDER_ID,
    providerSymbol: context.instrument.providerSymbol,
    currency: context.instrument.currency as CurrencyCode,
    price,
    priceType: hasTrade ? "LAST_TRADE" : "MID",
    /*
     * `LIVE` n'est revendiqué que pour les canaux qu'EODHD documente comme
     * temps réel, et seulement parce que l'horodatage vient du fournisseur.
     * Aucune promotion : un canal absent de cette liste garderait `DELAYED`.
     */
    freshness: "LIVE",
    asOf: isoFromEpoch(timestamp),
    receivedAt: context.receivedAt,
    ...(bid === undefined ? {} : { bid }),
    ...(ask === undefined ? {} : { ask }),
  };
}

/**
 * Point milieu d'une fourchette.
 *
 * Le calcul passe par le moteur décimal et non par des flottants : additionner
 * puis diviser deux prix en `number` réintroduirait exactement l'imprécision
 * que tout le paquet `domain` existe pour éviter, et sur le champ le plus
 * regardé de l'écran.
 */
function midpoint(bid: DecimalString | undefined, ask: DecimalString | undefined): DecimalString {
  if (bid === undefined || ask === undefined) {
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      EODHD_PROVIDER_ID,
      "Fourchette incomplète : point milieu impossible",
    );
  }
  return fromDecimal(decimal(bid).plus(decimal(ask)).dividedBy(2));
}

/** Classes d'actifs qu'EODHD sait diffuser en temps réel. */
export const EODHD_STREAMABLE: readonly AssetType[] = ["STOCK", "ETF", "FX", "CRYPTO"];
