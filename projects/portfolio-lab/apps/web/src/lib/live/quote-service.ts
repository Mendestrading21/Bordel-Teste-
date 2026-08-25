import "server-only";

import {
  buildQuoteRequests,
  createConfiguredProviders,
  pickSubscriptionSymbols,
  refreshFxRates,
  ProviderRouter,
  refreshQuotes,
  type FxRefreshReport,
  type IdentifierRow,
  type SubscriptionSymbol,
  type InstrumentRow,
  type QuoteRefreshOutcome,
} from "@portfolio-lab/market-data";
import { createDatabase, loadDatabaseConfig, type Database } from "@portfolio-lab/database";
import type { AssetType, CurrencyCode, DecimalString, QuoteFreshness } from "@portfolio-lab/domain";

import { resolveDataMode } from "@/lib/data/mode";
import { currentUserId } from "@/lib/auth/owner";

/**
 * Service de rafraîchissement des cours pour l'application web.
 *
 * C'est la frontière : les clés fournisseur vivent ici et ne franchissent
 * jamais la limite du navigateur. Le client reçoit des prix et des motifs, rien
 * d'autre — ni nom de variable d'environnement, ni URL de fournisseur, ni
 * message d'erreur brut.
 */

let cachedDatabase: Database | null = null;
function database(): Database {
  cachedDatabase ??= createDatabase(loadDatabaseConfig());
  return cachedDatabase;
}

/**
 * Routeur construit une seule fois par processus.
 *
 * Le reconstruire à chaque requête relirait l'environnement et rouvrirait des
 * clients HTTP pour rien ; surtout, cela réinitialiserait les compteurs de
 * santé des fournisseurs, qui ne servent qu'accumulés.
 */
let cachedRouter: { router: ProviderRouter; providerIds: readonly string[] } | null = null;

function routerOrNull(): { router: ProviderRouter; providerIds: readonly string[] } | null {
  if (cachedRouter !== null) return cachedRouter;

  const { providers } = createConfiguredProviders();
  if (providers.length === 0) return null;

  cachedRouter = {
    router: new ProviderRouter(providers),
    providerIds: providers.map((provider) => provider.id),
  };
  return cachedRouter;
}

/** Réinitialise le routeur mémorisé. Réservé aux tests. */
export function resetQuoteServiceCache(): void {
  cachedRouter = null;
}

export type LiveQuoteRecord = {
  readonly instrumentId: string;
  readonly price: DecimalString;
  readonly currency: CurrencyCode;
  readonly freshness: QuoteFreshness;
  readonly priceType: string;
  readonly asOf: string;
  readonly provider: string;
};

export type QuoteRefreshResponse =
  | {
      readonly status: "disabled";
      /** Phrase affichable telle quelle. */
      readonly reason: string;
    }
  | {
      readonly status: "ok";
      readonly refreshedAt: string;
      readonly providers: readonly string[];
      readonly quotes: readonly LiveQuoteRecord[];
      readonly unquoted: readonly { instrumentId: string; reason: string }[];
    };

const NO_PROVIDER =
  "Aucun fournisseur de cours n'est configuré sur ce serveur. " +
  "Les valeurs affichées sont celles que vous avez saisies.";

const INSTRUMENTS_QUERY = `
  select distinct
    i.id                as instrument_id,
    i.asset_type::text  as asset_type,
    i.exchange_mic
  from positions p
  join instruments i on i.id = p.instrument_id
  where p.portfolio_id = $1
`;

const IDENTIFIERS_QUERY = `
  select
    ii.instrument_id,
    ii.identifier_type::text as identifier_type,
    ii.identifier_value,
    ii.provider,
    ii.exchange_mic
  from instrument_identifiers ii
  where ii.instrument_id = any($1::uuid[])
`;

/**
 * Rafraîchit les cours des instruments réellement détenus.
 *
 * La liste des instruments est **dérivée du portefeuille côté serveur**, jamais
 * reçue du client. Accepter une liste d'identifiants transmise par le
 * navigateur transformerait cette route en sonde : un compte authentifié
 * pourrait demander le cours de n'importe quel instrument de la base et
 * apprendre ce que d'autres détiennent.
 */
export async function refreshPortfolioQuotes(): Promise<QuoteRefreshResponse> {
  const configured = routerOrNull();
  if (configured === null) {
    return { status: "disabled", reason: NO_PROVIDER };
  }

  const mode = resolveDataMode();
  const userId = await currentUserId(mode);
  if (userId === null) {
    return { status: "disabled", reason: "Session requise pour rafraîchir les cours." };
  }

  const rows = await database().withUser(userId, async (client) => {
    const portfolios = await client.query<{ id: string }>(
      "select id from portfolios order by created_at asc limit 1",
    );
    const portfolioId = portfolios.rows[0]?.id;
    if (portfolioId === undefined) return null;

    const instruments = await client.query<{
      instrument_id: string;
      asset_type: string;
      exchange_mic: string | null;
    }>(INSTRUMENTS_QUERY, [portfolioId]);

    const ids = instruments.rows.map((row) => row.instrument_id);
    if (ids.length === 0) return { instruments: [], identifiers: [] };

    const identifiers = await client.query<{
      instrument_id: string;
      identifier_type: string;
      identifier_value: string;
      provider: string | null;
      exchange_mic: string | null;
    }>(IDENTIFIERS_QUERY, [ids]);

    return { instruments: instruments.rows, identifiers: identifiers.rows };
  });

  if (rows === null) {
    return {
      status: "ok",
      refreshedAt: new Date().toISOString(),
      providers: configured.providerIds,
      quotes: [],
      unquoted: [],
    };
  }

  const instruments: InstrumentRow[] = rows.instruments.map((row) => ({
    instrumentId: row.instrument_id,
    assetType: row.asset_type as AssetType,
    exchangeMic: row.exchange_mic,
  }));

  const identifiers: IdentifierRow[] = rows.identifiers.map((row) => ({
    instrumentId: row.instrument_id,
    identifierType: row.identifier_type as IdentifierRow["identifierType"],
    identifierValue: row.identifier_value,
    provider: row.provider,
    exchangeMic: row.exchange_mic,
  }));

  const { requests, unidentified } = buildQuoteRequests(instruments, identifiers);
  const report = await refreshQuotes(configured.router, requests);

  const quotes: LiveQuoteRecord[] = [];
  const unquoted = unidentified.map((entry) => ({
    instrumentId: entry.instrumentId,
    reason: entry.reason,
  }));

  for (const outcome of report.outcomes) {
    if (isQuoted(outcome)) {
      quotes.push({
        instrumentId: outcome.instrumentId,
        price: outcome.quote.price,
        currency: outcome.quote.currency,
        // La fraîcheur vient du fournisseur et n'est jamais remontée d'un cran
        // au passage : c'est le seul champ qui empêche d'afficher « en direct »
        // sur du différé.
        freshness: outcome.quote.freshness,
        priceType: outcome.quote.priceType,
        asOf: outcome.quote.asOf,
        provider: outcome.quote.provider,
      });
    } else {
      unquoted.push({ instrumentId: outcome.instrumentId, reason: outcome.reason });
    }
  }

  return {
    status: "ok",
    refreshedAt: report.refreshedAt,
    providers: configured.providerIds,
    quotes,
    unquoted,
  };
}

function isQuoted(
  outcome: QuoteRefreshOutcome,
): outcome is Extract<QuoteRefreshOutcome, { kind: "QUOTED" }> {
  return outcome.kind === "QUOTED";
}

/**
 * Taux de change vers la devise de consolidation, depuis un fournisseur réel.
 *
 * Rendu séparément du rafraîchissement des cours parce que les deux n'ont pas
 * la même conséquence en cas d'échec. Un cours manquant laisse une ligne non
 * valorisée ; un taux manquant fausse toutes les lignes de cette devise et le
 * total avec elles.
 *
 * Renvoie `null` quand aucun fournisseur n'est configuré — l'appelant décide
 * alors quoi faire, et ce qu'il décide doit rester visible à l'écran. Rendre un
 * tableau vide serait indiscernable de « aucune devise étrangère à convertir ».
 */
export async function fetchFxRates(
  currencies: readonly CurrencyCode[],
  baseCurrency: CurrencyCode,
): Promise<FxRefreshReport | null> {
  const configured = routerOrNull();
  if (configured === null) return null;
  return refreshFxRates(configured.router, currencies, baseCurrency);
}

/**
 * Symboles auxquels la session a le droit de s'abonner sur le canal temps réel.
 *
 * Dérivé du portefeuille **côté serveur**, comme la liste des cours. C'est ce
 * périmètre qui est ensuite scellé dans le jeton de canal : sans lui, le jeton
 * prouvait qui était l'appelant sans limiter ce à quoi il pouvait s'abonner, et
 * la passerelle devenait un relais de données de marché sur la clé de
 * l'exploitant.
 *
 * Seules les valeurs d'identifiants réellement enregistrées sont retenues. Un
 * instrument sans identifiant n'entre pas dans le périmètre — cohérent avec le
 * rafraîchissement REST, qui le déclare non identifiable plutôt que de le
 * deviner.
 */
export async function portfolioSubscriptionScope(): Promise<readonly SubscriptionSymbol[]> {
  const mode = resolveDataMode();
  const userId = await currentUserId(mode);
  if (userId === null) return [];

  return database().withUser(userId, async (client) => {
    const portfolios = await client.query<{ id: string }>(
      "select id from portfolios order by created_at asc limit 1",
    );
    const portfolioId = portfolios.rows[0]?.id;
    if (portfolioId === undefined) return [];

    const { rows } = await client.query<{
      instrument_id: string;
      identifier_type: string;
      identifier_value: string;
      provider: string | null;
      exchange_mic: string | null;
    }>(
      `select distinct ii.instrument_id,
              ii.identifier_type::text as identifier_type,
              ii.identifier_value,
              ii.provider,
              ii.exchange_mic
         from positions p
         join instrument_identifiers ii on ii.instrument_id = p.instrument_id
        where p.portfolio_id = $1`,
      [portfolioId],
    );

    const identifiers: IdentifierRow[] = rows.map((row) => ({
      instrumentId: row.instrument_id,
      identifierType: row.identifier_type as IdentifierRow["identifierType"],
      identifierValue: row.identifier_value,
      provider: row.provider,
      exchangeMic: row.exchange_mic,
    }));

    /*
     * Les valeurs hors alphabet sont écartées ici plutôt que de faire échouer
     * l'émission du jeton. Un identifiant exotique en base ne doit pas priver
     * l'utilisateur de tout le canal : il le prive de sa seule ligne.
     */
    return pickSubscriptionSymbols(identifiers).filter((entry) =>
      SCOPE_SYMBOL_PATTERN.test(entry.symbol),
    );
  });
}

/**
 * Même alphabet que celui accepté par le jeton de canal.
 *
 * Dupliqué plutôt qu'importé : l'application web ne dépend pas de la passerelle,
 * qui est un service déployé séparément. `scope-sync.test.ts` vérifie que les
 * deux définitions ne divergent pas.
 */
const SCOPE_SYMBOL_PATTERN = /^[A-Za-z0-9._:-]{1,32}$/;
