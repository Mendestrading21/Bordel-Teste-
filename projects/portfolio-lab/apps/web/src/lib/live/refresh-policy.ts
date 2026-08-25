import type { CurrencyCode, DecimalString, QuoteFreshness } from "@portfolio-lab/domain";

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
