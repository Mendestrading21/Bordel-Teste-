import type { AssetType } from "@portfolio-lab/domain";

import {
  ProviderError,
  type InstrumentReference,
  type NormalizedQuote,
  type ResolvedInstrument,
} from "./contract.js";
import type { ProviderRouter, RouterTrace } from "./provider-router.js";

/**
 * Rafraîchissement d'un lot de cours.
 *
 * Ce module est le seul endroit qui sait transformer « voici mes positions » en
 * « voici les cours et, pour les autres, pourquoi il n'y en a pas ». Il est
 * volontairement pur : il reçoit un routeur et rend un rapport, sans toucher ni
 * à la base, ni au réseau, ni à l'horloge autrement que par injection.
 *
 * Deux règles le gouvernent, et elles expliquent presque tout le code :
 *
 * 1. **Un échec ne se propage jamais.** Un instrument introuvable chez le
 *    fournisseur ne doit pas empêcher les onze autres d'être valorisés. Une
 *    exception qui remonte transformerait une lacune de couverture en panne
 *    totale de l'écran.
 * 2. **Une absence de cours se dit.** Elle produit un `UNQUOTED` avec son
 *    motif, jamais un silence ni une valeur de repli. Un portefeuille dont une
 *    ligne est muette doit le montrer ; s'il affichait un ancien cours comme
 *    s'il venait d'arriver, il mentirait.
 */

export type QuoteRequest = {
  /** Identifiant **local** de l'instrument, tel que stocké en base. */
  readonly instrumentId: string;
  readonly reference: InstrumentReference;
  /** Classe d'actif connue localement, pour que le routeur écarte les fournisseurs incompétents. */
  readonly assetType?: AssetType | undefined;
  readonly exchangeMic?: string | null | undefined;
};

export type QuoteRefreshOutcome =
  | {
      readonly kind: "QUOTED";
      readonly instrumentId: string;
      readonly quote: NormalizedQuote;
      readonly servedBy: string;
    }
  | {
      readonly kind: "UNQUOTED";
      readonly instrumentId: string;
      /** Motif lisible par un humain, en français, affichable tel quel. */
      readonly reason: string;
      /** Fournisseurs réellement interrogés — vide si aucun n'était compétent. */
      readonly attemptedProviders: readonly string[];
    };

export type QuoteRefreshReport = {
  readonly outcomes: readonly QuoteRefreshOutcome[];
  readonly quoted: number;
  readonly unquoted: number;
  /** Instant de la campagne de rafraîchissement, ISO 8601 UTC. */
  readonly refreshedAt: string;
};

export type RefreshQuotesOptions = {
  /**
   * Nombre d'instruments interrogés simultanément.
   *
   * Volontairement bas. Les plans gratuits — le cas normal ici — limitent à
   * quelques dizaines d'appels par minute : ouvrir vingt requêtes d'un coup
   * déclencherait un `RATE_LIMITED` qui coûterait plus cher que l'attente.
   */
  readonly concurrency?: number;
  readonly now?: () => Date;
};

const DEFAULT_CONCURRENCY = 4;

/**
 * Motif lisible pour un échec fournisseur.
 *
 * Le message brut d'un adaptateur peut contenir une URL, un identifiant, voire
 * un fragment de requête. Ce qui est affiché est donc une phrase choisie ici,
 * jamais le message d'origine.
 */
export function failureReason(error: unknown): string {
  if (!(error instanceof ProviderError)) {
    return "Cours indisponible : erreur inattendue du fournisseur.";
  }

  switch (error.kind) {
    case "NOT_FOUND":
      return "Cours indisponible : instrument inconnu du fournisseur.";
    case "AMBIGUOUS":
      /*
       * L'ambiguïté n'est jamais tranchée ici. Deux classes de parts d'un fonds
       * ne diffèrent parfois que par une lettre, et choisir « la plus probable »
       * valoriserait un portefeuille avec le cours d'un autre instrument.
       */
      return "Cours indisponible : plusieurs instruments correspondent, à départager manuellement.";
    case "RATE_LIMITED":
      return "Cours indisponible : quota du fournisseur atteint, réessai plus tard.";
    case "UNAUTHORIZED":
      return "Cours indisponible : le fournisseur a refusé la clé configurée.";
    case "UNSUPPORTED":
      return "Cours indisponible : cette classe d'actif n'est pas couverte par les fournisseurs configurés.";
    case "NETWORK":
      return "Cours indisponible : fournisseur injoignable.";
    case "MALFORMED_RESPONSE":
      return "Cours indisponible : réponse illisible du fournisseur.";
  }
}

/** Fournisseurs réellement interrogés, tous besoins confondus. */
function attempted(...traces: readonly (RouterTrace | undefined)[]): readonly string[] {
  const seen = new Set<string>();
  for (const trace of traces) {
    for (const provider of trace?.attemptedProviders ?? []) seen.add(provider);
  }
  return [...seen];
}

async function refreshOne(
  router: ProviderRouter,
  request: QuoteRequest,
): Promise<QuoteRefreshOutcome> {
  let resolved: ResolvedInstrument;
  let resolveTrace: RouterTrace | undefined;

  try {
    const outcome = await router.resolve(request.reference, {
      assetType: request.assetType,
      exchangeMic: request.exchangeMic,
    });
    resolved = outcome.instrument;
    resolveTrace = outcome.trace;
  } catch (error) {
    return {
      kind: "UNQUOTED",
      instrumentId: request.instrumentId,
      reason: failureReason(error),
      attemptedProviders: attempted(resolveTrace),
    };
  }

  try {
    const { quote, trace } = await router.snapshot(resolved);
    return {
      kind: "QUOTED",
      instrumentId: request.instrumentId,
      /*
       * L'identifiant est réécrit avec celui de la base.
       *
       * Un adaptateur renseigne `instrumentId` avec ce qu'il connaît — souvent
       * son propre symbole. Laisser passer cette valeur ferait échouer
       * silencieusement l'appariement avec les positions : le moteur chercherait
       * un cours sous une clé qui n'existe pas, et la ligne apparaîtrait non
       * valorisée sans qu'aucune erreur ne soit levée.
       */
      quote: { ...quote, instrumentId: request.instrumentId },
      servedBy: trace.servedBy ?? quote.provider,
    };
  } catch (error) {
    return {
      kind: "UNQUOTED",
      instrumentId: request.instrumentId,
      reason: failureReason(error),
      attemptedProviders: attempted(resolveTrace),
    };
  }
}

/**
 * Rafraîchit un lot de cours, par vagues bornées.
 *
 * L'ordre des résultats suit celui des requêtes, quelle que soit la vitesse de
 * réponse : un rapport dont l'ordre dépendrait de la latence rendrait tout
 * test instable et tout affichage sautillant.
 */
export async function refreshQuotes(
  router: ProviderRouter,
  requests: readonly QuoteRequest[],
  options: RefreshQuotesOptions = {},
): Promise<QuoteRefreshReport> {
  const now = options.now ?? (() => new Date());
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const outcomes: QuoteRefreshOutcome[] = new Array<QuoteRefreshOutcome>(requests.length);

  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const request = requests[index];
      if (request === undefined) return;
      outcomes[index] = await refreshOne(router, request);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, requests.length) }, () => worker()),
  );

  const settled = outcomes.filter((outcome): outcome is QuoteRefreshOutcome => outcome !== undefined);

  return {
    outcomes: settled,
    quoted: settled.filter((outcome) => outcome.kind === "QUOTED").length,
    unquoted: settled.filter((outcome) => outcome.kind === "UNQUOTED").length,
    refreshedAt: now().toISOString(),
  };
}
