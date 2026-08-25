import {
  isCurrencyCode,
  isDecimalString,
  type CurrencyCode,
  type DecimalString,
  type QuoteFreshness,
} from "@portfolio-lab/domain";

import type { LiveQuote } from "./client-protocol";

/**
 * Politique de scrutation des cours.
 *
 * Extraite du hook et sans dépendance à React ni au DOM, pour être testable :
 * une décision « faut-il rafraîchir maintenant ? » qui ne vit que dans un effet
 * ne se vérifie qu'en simulant un navigateur, et n'est donc jamais vérifiée.
 */

export type LiveQuoteRecord = {
  readonly instrumentId: string;
  readonly price: DecimalString;
  readonly currency: CurrencyCode;
  readonly freshness: QuoteFreshness;
  readonly priceType: string;
  readonly asOf: string;
  readonly provider: string;
};

export type RefreshState =
  | { readonly status: "idle" }
  | { readonly status: "refreshing" }
  | {
      readonly status: "ok";
      readonly refreshedAt: string;
      readonly providers: readonly string[];
      readonly quoted: number;
      readonly unquoted: readonly { instrumentId: string; reason: string }[];
    }
  /** Le serveur n'a aucun fournisseur : inutile d'insister. */
  | { readonly status: "disabled"; readonly reason: string }
  | { readonly status: "failed"; readonly reason: string };

export type PollConditions = {
  readonly documentVisible: boolean;
  readonly online: boolean;
  readonly state: RefreshState;
};

export const BASE_INTERVAL_MS = 60_000;
const MAX_INTERVAL_MS = 15 * 60_000;

/**
 * Faut-il lancer un rafraîchissement maintenant ?
 *
 * Trois refus, et chacun évite une dépense inutile :
 *
 * - onglet en arrière-plan : personne ne regarde, et le quota d'un plan gratuit
 *   se compte en dizaines d'appels par minute ;
 * - navigateur hors ligne : la requête échouerait à coup sûr ;
 * - serveur sans fournisseur : l'état ne changera pas tant que la configuration
 *   n'aura pas changé, et celle-ci ne change pas en cours de session.
 */
export function shouldPoll(conditions: PollConditions): boolean {
  if (!conditions.documentVisible) return false;
  if (!conditions.online) return false;
  if (conditions.state.status === "disabled") return false;
  if (conditions.state.status === "refreshing") return false;
  return true;
}

/**
 * Délai avant la prochaine tentative.
 *
 * Après un échec, l'intervalle double — un fournisseur en panne ou un quota
 * atteint ne se répare pas en une minute, et scruter au même rythme
 * transformerait une panne passagère en épuisement de quota. Le plafond
 * garantit qu'une reprise finit par être tentée.
 */
export function nextDelayMs(consecutiveFailures: number, baseMs = BASE_INTERVAL_MS): number {
  if (consecutiveFailures <= 0) return baseMs;
  return Math.min(baseMs * 2 ** consecutiveFailures, MAX_INTERVAL_MS);
}

/**
 * Fusionne les cours reçus avec ceux déjà connus.
 *
 * Les anciens cours sont **conservés** quand une campagne n'en rapporte pas :
 * un instrument momentanément muet garde son dernier cours connu, daté, plutôt
 * que de disparaître de l'écran. La fraîcheur affichée reste celle de ce cours,
 * jamais celle de la campagne — c'est ce qui empêche un cours d'hier de
 * paraître arrivé à l'instant.
 */
export function mergeQuotes(
  previous: ReadonlyMap<string, LiveQuoteRecord>,
  incoming: readonly LiveQuoteRecord[],
): ReadonlyMap<string, LiveQuoteRecord> {
  if (incoming.length === 0) return previous;
  const next = new Map(previous);
  for (const quote of incoming) next.set(quote.instrumentId, quote);
  return next;
}

/**
 * Un cours affichable, quelle que soit sa provenance.
 *
 * Le flux et la scrutation rendent des formes différentes. L'écran n'a pas à
 * savoir laquelle il regarde — mais il doit savoir **quand** le cours a été
 * établi, et c'est ce que porte `asOf`.
 */
export type DisplayQuote = {
  readonly price: DecimalString;
  readonly currency: CurrencyCode;
  readonly freshness: QuoteFreshness;
  readonly asOf: string;
  readonly provider: string;
};

/**
 * Retient, pour chaque instrument, le cours **le plus récent**.
 *
 * Deux sources alimentent le même écran : la scrutation REST toutes les
 * minutes, et le flux temps réel quand une passerelle est déployée. Elles se
 * recouvrent, et il faut trancher.
 *
 * Le critère est la date du cours, jamais la source. Privilégier le flux par
 * principe afficherait un tick d'il y a dix minutes par-dessus une scrutation
 * de l'instant, simplement parce qu'il est arrivé par une socket — un cours
 * plus ancien présenté comme plus frais, exactement ce que l'étage de
 * fraîcheur existe pour empêcher. À date égale, la valeur déjà affichée est
 * conservée : remplacer un cours par un autre identique ferait clignoter la
 * ligne sans rien apprendre.
 */
export function mostRecent(
  polled: ReadonlyMap<string, DisplayQuote>,
  streamed: ReadonlyMap<string, DisplayQuote>,
): ReadonlyMap<string, DisplayQuote> {
  if (streamed.size === 0) return polled;

  const merged = new Map(polled);
  for (const [instrumentId, quote] of streamed) {
    const current = merged.get(instrumentId);
    if (current === undefined || Date.parse(quote.asOf) > Date.parse(current.asOf)) {
      merged.set(instrumentId, quote);
    }
  }
  return merged;
}

/**
 * Convertit une cotation du flux en cours affichable.
 *
 * Renvoie `null` quand le prix n'est pas une décimale exacte ou la devise
 * inconnue. Les types du fil sont de simples chaînes ; ceux du domaine sont
 * marqués, et ce marquage n'est pas décoratif : il est ce qui empêche une
 * chaîne arbitraire d'entrer dans un calcul de valorisation. Le convertir de
 * force reviendrait à contourner la seule barrière qui existe.
 */
export function toDisplayQuote(quote: LiveQuote): DisplayQuote | null {
  if (!isDecimalString(quote.price) || !isCurrencyCode(quote.currency)) return null;
  return {
    price: quote.price,
    currency: quote.currency,
    freshness: quote.freshness,
    asOf: quote.asOf,
    provider: quote.provider,
  };
}
