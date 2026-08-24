import type { QuoteFreshness } from "@portfolio-lab/domain";

import { ProviderError, type NormalizedQuote, type ResolvedInstrument } from "./contract.js";
import { providerDecimal } from "./provider-decimal.js";
import { TWELVE_DATA_PROVIDER_ID } from "./twelve-data-provider.js";

/**
 * Flux temps réel de Twelve Data.
 *
 * Un seul point d'entrée pour toutes les classes d'actifs, contrairement à
 * EODHD : `wss://ws.twelvedata.com/v1/quotes/price`.
 *
 * ⚠️ Le format de fil suit la documentation publique et n'a **pas** pu être
 * confronté à une vraie connexion depuis cet environnement, dont la politique
 * de sortie réseau refuse `twelvedata.com`. Le parseur est isolé pour que
 * cette confrontation ne demande de corriger qu'un seul endroit.
 */
export const TWELVE_DATA_STREAM_URL = "wss://ws.twelvedata.com/v1/quotes/price";

export function twelveDataStreamUrl(apiKey: string, baseUrl = TWELVE_DATA_STREAM_URL): string {
  return `${baseUrl}?apikey=${encodeURIComponent(apiKey)}`;
}

export type TwelveDataAction = "subscribe" | "unsubscribe" | "heartbeat" | "reset";

export type TwelveDataMessage = {
  readonly action: TwelveDataAction;
  readonly params?: { readonly symbols: string };
};

/**
 * Message d'abonnement.
 *
 * Twelve Data attend les symboles dans `params.symbols`, séparés par des
 * virgules — et non à la racine du message comme EODHD. Un message mal formé
 * n'est pas rejeté : il est ignoré, et l'abonnement reste silencieux.
 */
export function twelveDataSubscription(
  action: "subscribe" | "unsubscribe",
  symbols: readonly string[],
): TwelveDataMessage {
  return { action, params: { symbols: symbols.join(",") } };
}

/** Battement de cœur. Sans lui, le serveur ferme une connexion inactive. */
export function twelveDataHeartbeat(): TwelveDataMessage {
  return { action: "heartbeat" };
}

type RawEvent = {
  event?: unknown;
  symbol?: unknown;
  price?: unknown;
  timestamp?: unknown;
  currency?: unknown;
  status?: unknown;
};

export type TwelveDataTickContext = {
  readonly instrument: ResolvedInstrument;
  readonly receivedAt: string;
  /**
   * Fraîcheur du plan **réellement souscrit**.
   *
   * Elle n'est jamais déduite du fait qu'un tick soit arrivé : un plan différé
   * envoie lui aussi des messages par socket. Seul l'abonnement décide, et
   * c'est la configuration qui le déclare.
   */
  readonly freshness: QuoteFreshness;
};

/**
 * Convertit un message de flux en cotation normalisée.
 *
 * Renvoie `null` pour tout ce qui n'est pas un prix : accusés d'abonnement,
 * battements, statuts. Ces messages sont normaux ; les traiter comme des
 * erreurs déclencherait des reconnexions inutiles.
 */
export function parseTwelveDataTick(
  raw: unknown,
  context: TwelveDataTickContext,
): NormalizedQuote | null {
  if (typeof raw !== "object" || raw === null) return null;
  const event = raw as RawEvent;

  if (event.event !== "price") return null;
  if (typeof event.symbol !== "string") return null;
  if (event.price === undefined || event.price === null) return null;

  const timestamp = typeof event.timestamp === "number" ? event.timestamp : Number(event.timestamp);
  if (!Number.isFinite(timestamp)) {
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      TWELVE_DATA_PROVIDER_ID,
      `Horodatage de flux illisible pour ${event.symbol}`,
    );
  }

  /*
   * Twelve Data horodate en secondes. La borne distingue tout de même les
   * millisecondes : un fournisseur qui changerait d'unité sans prévenir
   * daterait sinon chaque tick de 1970, ce qui les ferait tous rejeter comme
   * périmés au lieu de signaler le problème.
   */
  const ms = timestamp < 1e11 ? timestamp * 1000 : timestamp;
  const asOf = new Date(ms);
  if (Number.isNaN(asOf.getTime())) {
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      TWELVE_DATA_PROVIDER_ID,
      `Horodatage hors plage pour ${event.symbol}`,
    );
  }

  return {
    instrumentId: context.instrument.providerSymbol,
    provider: TWELVE_DATA_PROVIDER_ID,
    providerSymbol: context.instrument.providerSymbol,
    /*
     * La devise vient de l'instrument résolu, jamais du message. Twelve Data
     * ne la répète pas systématiquement, et la déduire du symbole donnerait
     * des dollars à une action suisse.
     */
    currency: context.instrument.currency,
    price: providerDecimal(event.price, TWELVE_DATA_PROVIDER_ID, "price"),
    priceType: "LAST_TRADE",
    freshness: context.freshness,
    asOf: asOf.toISOString(),
    receivedAt: context.receivedAt,
  };
}

/**
 * `true` si le message est un refus du serveur.
 *
 * Twelve Data répond par un `status` en cas de symbole inconnu ou de quota
 * dépassé, sans fermer la connexion. Sans cette détection, l'abonnement paraît
 * réussi et reste muet.
 */
export function twelveDataRejection(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const event = raw as RawEvent;
  if (event.event !== "subscribe-status") return null;
  if (event.status === "ok") return null;
  return typeof event.status === "string" ? event.status : "statut d'abonnement inconnu";
}
