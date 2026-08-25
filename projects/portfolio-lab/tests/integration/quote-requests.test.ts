import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildQuoteRequests,
  ProviderError,
  ProviderRouter,
  refreshQuotes,
  type IdentifierRow,
  type InstrumentRow,
  type MarketDataProvider,
  type NormalizedQuote,
  type ResolvedInstrument,
} from "@portfolio-lab/market-data";
import { toDecimalString, type AssetType, type CurrencyCode } from "@portfolio-lab/domain";

import { DEMO_USER, hasTestDatabase, setupTestDatabase, type TestDatabase } from "../helpers/database.js";

/**
 * Chaîne complète « portefeuille en base → requêtes de cours », sur un vrai
 * PostgreSQL.
 *
 * Le SQL du service de cours est le maillon le plus exposé : un `::uuid[]` mal
 * placé, une jointure qui perd les instruments sans identifiant, un `distinct`
 * oublié qui interroge trois fois la même action. Aucun de ces défauts
 * n'apparaît dans un test unitaire à données inventées, et tous produisent en
 * production un écran qui a l'air correct.
 */

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

/** Symbole désigné par une référence, quel qu'en soit le type. */
function referenceSymbol(ref: Parameters<MarketDataProvider["resolve"]>[0]): string {
  switch (ref.kind) {
    case "TICKER":
      return ref.ticker;
    case "ISIN":
      return ref.isin;
    case "PROVIDER_SYMBOL":
      return ref.symbol;
    case "FIGI":
      return ref.figi;
    case "OPTION":
      return ref.underlying;
  }
}

/** Fournisseur de test : il ne connaît qu'un symbole, et le dit pour les autres. */
function stubProvider(known: ReadonlySet<string>): MarketDataProvider {
  const symbolOf = referenceSymbol;

  return {
    id: "stub",
    capabilities: () => ({
      assetTypes: ["STOCK", "ETF", "MUTUAL_FUND", "OPTION", "CASH", "OTHER"],
      searchByText: false,
      searchByIsin: true,
      optionChains: false,
      fx: false,
      history: false,
      streaming: false,
      bestFreshness: "DELAYED",
      delayMinutes: 15,
    }),
    search: () => Promise.resolve([]),
    resolve: (ref): Promise<ResolvedInstrument | null> => {
      const symbol = symbolOf(ref);
      if (!known.has(symbol)) {
        throw new ProviderError("NOT_FOUND", "stub", `inconnu: ${symbol}`);
      }
      return Promise.resolve({
        provider: "stub",
        providerSymbol: symbol,
        name: symbol,
        assetType: "STOCK",
        currency: "USD" as CurrencyCode,
        exchangeMic: null,
        isin: null,
        optionContract: null,
      });
    },
    getSnapshot: (instrument): Promise<NormalizedQuote> =>
      Promise.resolve({
        instrumentId: `stub-${instrument.providerSymbol}`,
        provider: "stub",
        providerSymbol: instrument.providerSymbol,
        currency: instrument.currency,
        price: toDecimalString("42.5"),
        priceType: "LAST_TRADE",
        freshness: "DELAYED",
        asOf: "2026-08-25T06:41:30.000Z",
        receivedAt: "2026-08-25T06:41:31.000Z",
      }),
    getHistory: () => Promise.resolve([]),
  };
}

describe.skipIf(!hasTestDatabase)("requêtes de cours depuis la base", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await setupTestDatabase({ name: "quote_requests", seed: true });
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  async function loadRows(): Promise<{
    instruments: InstrumentRow[];
    identifiers: IdentifierRow[];
  }> {
    return db.asUser(DEMO_USER, async (client) => {
      const portfolios = await client.query<{ id: string }>(
        "select id from portfolios order by created_at asc limit 1",
      );
      const portfolioId = portfolios.rows[0]?.id;
      expect(portfolioId, "le seed de démonstration doit fournir un portefeuille").toBeTypeOf(
        "string",
      );

      const instruments = await client.query<{
        instrument_id: string;
        asset_type: string;
        exchange_mic: string | null;
      }>(INSTRUMENTS_QUERY, [portfolioId]);

      const ids = instruments.rows.map((row) => row.instrument_id);
      const identifiers = await client.query<{
        instrument_id: string;
        identifier_type: string;
        identifier_value: string;
        provider: string | null;
        exchange_mic: string | null;
      }>(IDENTIFIERS_QUERY, [ids]);

      return {
        instruments: instruments.rows.map((row) => ({
          instrumentId: row.instrument_id,
          assetType: row.asset_type as AssetType,
          exchangeMic: row.exchange_mic,
        })),
        identifiers: identifiers.rows.map((row) => ({
          instrumentId: row.instrument_id,
          identifierType: row.identifier_type as IdentifierRow["identifierType"],
          identifierValue: row.identifier_value,
          provider: row.provider,
          exchangeMic: row.exchange_mic,
        })),
      };
    });
  }

  it("lit les instruments détenus sans doublon", async () => {
    const { instruments } = await loadRows();

    expect(instruments.length).toBeGreaterThan(0);
    const ids = instruments.map((row) => row.instrumentId);
    // `distinct` : deux positions sur le même titre ne doivent pas provoquer
    // deux appels fournisseur facturés pour le même cours.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("associe chaque instrument détenu à une requête ou à un motif", async () => {
    const { instruments, identifiers } = await loadRows();
    const { requests, unidentified } = buildQuoteRequests(instruments, identifiers);

    const covered = new Set([
      ...requests.map((request) => request.instrumentId),
      ...unidentified.map((entry) => entry.instrumentId),
    ]);
    expect(covered.size).toBe(instruments.length);
  });

  it("l'option du seed est déclarée non identifiable, faute d'OSI", async () => {
    const { instruments, identifiers } = await loadRows();
    const options = instruments.filter((row) => row.assetType === "OPTION");
    expect(options.length).toBeGreaterThan(0);

    const { requests, unidentified } = buildQuoteRequests(instruments, identifiers);

    for (const option of options) {
      /*
       * Sans OSI, l'option ne doit surtout pas être requêtée : la seule
       * référence disponible serait le sous-jacent, et le cours renvoyé serait
       * celui de l'action — plausible, du bon ordre de grandeur, et faux.
       */
      expect(requests.map((request) => request.instrumentId)).not.toContain(option.instrumentId);
      expect(unidentified.map((entry) => entry.instrumentId)).toContain(option.instrumentId);
    }
  });

  it("valorise ce qui est connu et motive le reste, sans jamais échouer en bloc", async () => {
    const { instruments, identifiers } = await loadRows();
    const { requests, unidentified } = buildQuoteRequests(instruments, identifiers);

    /*
     * Le stub ne connaît qu'un seul des symboles du seed, et ce symbole est
     * extrait de la référence **réellement retenue** — pas d'un type supposé.
     * La préférence place l'ISIN avant le ticker : présumer « ticker » ici
     * rendait le test vert ou rouge selon un détail du seed plutôt que selon le
     * comportement mesuré.
     */
    const first = requests[0];
    expect(first, "le seed doit produire au moins une requête").toBeDefined();
    const known = new Set(first === undefined ? [] : [referenceSymbol(first.reference)]);

    const report = await refreshQuotes(new ProviderRouter([stubProvider(known)]), requests);

    expect(report.outcomes).toHaveLength(requests.length);
    expect(report.quoted + report.unquoted).toBe(requests.length);
    expect(report.quoted).toBeGreaterThan(0);
    // Les instruments non identifiés ne disparaissent pas non plus du décompte
    // global : ils sont juste comptés ailleurs.
    expect(unidentified.length + report.outcomes.length).toBe(instruments.length);

    for (const outcome of report.outcomes) {
      if (outcome.kind === "QUOTED") {
        // L'identifiant local, jamais celui du fournisseur.
        expect(outcome.quote.instrumentId).not.toContain("stub-");
        expect(instruments.map((row) => row.instrumentId)).toContain(outcome.quote.instrumentId);
        expect(outcome.quote.freshness).toBe("DELAYED");
      } else {
        expect(outcome.reason).toMatch(/^Cours indisponible/u);
      }
    }
  });
});
