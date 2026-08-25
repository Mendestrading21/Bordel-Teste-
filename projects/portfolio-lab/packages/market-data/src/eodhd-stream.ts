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
 * ⚠️ Le format de fil décrit ici suit la documentation officielle d'EODHD. Il
 * n'a **pas** pu être confronté à une vraie connexion depuis cet environnement,
 * dont la politique de sortie réseau refuse `eodhd.com`. Le parseur est isolé
 * et testé sur fixtures précisément pour que cette confrontation, le jour où
 * elle sera possible, ne demande de corriger qu'un seul endroit.
 *
 * Cette isolation a déjà servi : les quatre canaux n'emploient **pas** les
 * mêmes noms de champs pour une fourchette — `us-quote` publie `ap`/`bp`,
 * `forex` publie `a`/`b`. Le parseur ne connaissait que la seconde forme et
 * renvoyait donc `null` pour chaque message de `us-quote` : un abonnement
 * accepté qui ne cotait jamais, indiscernable d'un marché sans transaction.
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
  /*
   * Le plafond est vérifié à la construction, pas espéré.
   *
   * EODHD n'échoue pas au-delà de cinquante symboles : il accepte l'abonnement
   * et n'en cote qu'une partie. Le silence porterait alors sur les lignes
   * situées après la cinquantième, sans que rien ne le signale.
   */
  if (action === "subscribe" && symbols.length > EODHD_MAX_SYMBOLS_PER_CONNECTION) {
    throw new ProviderError(
      "UNSUPPORTED",
      EODHD_PROVIDER_ID,
      `Abonnement de ${symbols.length} symboles au-delà du plafond de ` +
        `${EODHD_MAX_SYMBOLS_PER_CONNECTION} par connexion`,
    );
  }
  return { action, symbols: symbols.join(",") };
}

/**
 * Message de fil, tous canaux confondus.
 *
 * Les quatre canaux ne partagent que `s` et `t`. Le reste diffère, et deux
 * champs portent le même sens sous des noms différents selon le canal : d'où
 * la table `CHANNEL_FIELDS` plutôt qu'une lecture opportuniste de tout ce qui
 * ressemble à un prix.
 */
type RawTick = {
  s?: unknown;
  /** Prix de transaction — `us` (nombre) et `crypto` (chaîne). */
  p?: unknown;
  /** Fourchette du canal `forex`. */
  a?: unknown;
  b?: unknown;
  /** Fourchette du canal `us-quote`. */
  ap?: unknown;
  bp?: unknown;
  /** Statut de marché du canal `us` : open | closed | extended-hours. */
  ms?: unknown;
  t?: unknown;
};

/** Noms de champs de la fourchette, par canal. */
const CHANNEL_FIELDS: Readonly<
  Record<EodhdChannel, { readonly bid: keyof RawTick; readonly ask: keyof RawTick }>
> = {
  us: { bid: "bp", ask: "ap" },
  "us-quote": { bid: "bp", ask: "ap" },
  forex: { bid: "b", ask: "a" },
  crypto: { bid: "b", ask: "a" },
};

/**
 * Statut renvoyé par EODHD à la place des données.
 *
 * `422` signifie que l'abonnement a été **refusé** — typiquement un symbole
 * hors des six autorisés par la clé de démonstration. Le message n'a pas la
 * forme d'un tick : le traiter comme un message anodin laisserait un
 * abonnement définitivement muet passer pour un marché calme.
 */
export type EodhdStatus = {
  readonly statusCode: number;
  readonly message: string;
  /** `false` pour tout code hors 2xx : l'abonnement ne produira rien. */
  readonly authorized: boolean;
};

export function parseEodhdStatus(raw: unknown): EodhdStatus | null {
  if (typeof raw !== "object" || raw === null) return null;
  const message = raw as { status_code?: unknown; message?: unknown };
  if (typeof message.status_code !== "number") return null;
  return {
    statusCode: message.status_code,
    message: typeof message.message === "string" ? message.message : "",
    authorized: message.status_code >= 200 && message.status_code < 300,
  };
}

/**
 * Nombre de symboles qu'une connexion accepte par défaut.
 *
 * Documenté par EODHD, relevable depuis le tableau de bord moyennant
 * supplément. Dépasser ce plafond ne produit pas d'erreur : les symboles
 * excédentaires ne cotent simplement jamais.
 */
export const EODHD_MAX_SYMBOLS_PER_CONNECTION = 50;

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
  const fields = CHANNEL_FIELDS[context.channel];
  const rawBid = tick[fields.bid];
  const rawAsk = tick[fields.ask];

  const hasTrade = tick.p !== undefined && tick.p !== null;
  const hasQuote =
    rawAsk !== undefined && rawAsk !== null && rawBid !== undefined && rawBid !== null;
  if (!hasTrade && !hasQuote) return null;

  const timestamp = typeof tick.t === "number" ? tick.t : Number(tick.t);
  if (!Number.isFinite(timestamp)) {
    throw new ProviderError(
      "MALFORMED_RESPONSE",
      EODHD_PROVIDER_ID,
      `Horodatage de flux illisible pour ${tick.s}`,
    );
  }

  const bid = hasQuote ? providerDecimal(rawBid, EODHD_PROVIDER_ID, "bid") : undefined;
  const ask = hasQuote ? providerDecimal(rawAsk, EODHD_PROVIDER_ID, "ask") : undefined;

  const price = hasTrade ? providerDecimal(tick.p, EODHD_PROVIDER_ID, "price") : midpoint(bid, ask);

  return {
    instrumentId: context.instrument.providerSymbol,
    provider: EODHD_PROVIDER_ID,
    providerSymbol: context.instrument.providerSymbol,
    currency: context.instrument.currency as CurrencyCode,
    price,
    priceType: hasTrade ? "LAST_TRADE" : "MID",
    /*
     * La fraîcheur suit le statut de marché **annoncé par le fournisseur**,
     * jamais le seul fait d'être arrivé par un flux.
     *
     * Le canal `us` publie `ms` : open, closed ou extended-hours. Une
     * impression tardive reçue marché fermé n'est pas un cours en direct, et
     * l'étiqueter `LIVE` parce qu'elle vient d'une socket serait exactement la
     * promotion que tout l'étage de fraîcheur existe pour empêcher.
     */
    freshness: freshnessFor(tick.ms),
    asOf: isoFromEpoch(timestamp),
    receivedAt: context.receivedAt,
    ...(bid === undefined ? {} : { bid }),
    ...(ask === undefined ? {} : { ask }),
  };
}

/**
 * Fraîcheur déduite du statut de marché.
 *
 * `undefined` — le cas des canaux `forex`, `crypto` et `us-quote`, qui ne
 * publient pas `ms` — vaut `LIVE` : ces marchés n'ont pas d'heure de
 * fermeture, ou la cotation n'a de sens que marché ouvert.
 */
function freshnessFor(marketStatus: unknown): NormalizedQuote["freshness"] {
  if (marketStatus === "closed") return "EOD";
  return "LIVE";
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
