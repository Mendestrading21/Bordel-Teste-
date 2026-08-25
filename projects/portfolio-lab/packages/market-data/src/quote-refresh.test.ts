import { describe, expect, it } from "vitest";

import { toDecimalString, type CurrencyCode } from "@portfolio-lab/domain";

import {
  ProviderError,
  type HistoryRequest,
  type InstrumentCandidate,
  type InstrumentReference,
  type InstrumentSearchQuery,
  type MarketDataProvider,
  type NormalizedQuote,
  type PriceBar,
  type ProviderCapabilities,
  type ResolvedInstrument,
} from "./contract.js";
import { ProviderRouter } from "./provider-router.js";
import { failureReason, refreshQuotes } from "./quote-refresh.js";

const CAPABILITIES: ProviderCapabilities = {
  assetTypes: ["STOCK", "ETF"],
  searchByText: true,
  searchByIsin: true,
  optionChains: false,
  fx: false,
  history: false,
  streaming: false,
  bestFreshness: "DELAYED",
  delayMinutes: 15,
};

type Behaviour = {
  readonly resolveFails?: ProviderError;
  readonly snapshotFails?: ProviderError;
  /** Symbole -> comportement spécifique, sinon succès. */
  readonly perSymbol?: Readonly<Record<string, "resolve" | "snapshot">>;
};

function symbolOf(ref: InstrumentReference): string {
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

/** Fournisseur de test, dont chaque échec est explicitement demandé. */
function fakeProvider(
  id: string,
  behaviour: Behaviour = {},
  log: string[] = [],
): MarketDataProvider {
  return {
    id,
    capabilities: () => CAPABILITIES,
    search: (_query: InstrumentSearchQuery): Promise<readonly InstrumentCandidate[]> =>
      Promise.resolve([]),
    resolve: (ref: InstrumentReference): Promise<ResolvedInstrument | null> => {
      const symbol = symbolOf(ref);
      log.push(`resolve:${symbol}`);
      if (behaviour.resolveFails) throw behaviour.resolveFails;
      if (behaviour.perSymbol?.[symbol] === "resolve") {
        throw new ProviderError("NOT_FOUND", id, `inconnu: ${symbol}`);
      }
      return Promise.resolve({
        provider: id,
        providerSymbol: symbol,
        name: `Instrument ${symbol}`,
        assetType: "STOCK",
        currency: "USD" as CurrencyCode,
        exchangeMic: "XNAS",
        isin: null,
        optionContract: null,
      });
    },
    getSnapshot: (instrument: ResolvedInstrument): Promise<NormalizedQuote> => {
      log.push(`snapshot:${instrument.providerSymbol}`);
      if (behaviour.snapshotFails) throw behaviour.snapshotFails;
      if (behaviour.perSymbol?.[instrument.providerSymbol] === "snapshot") {
        throw new ProviderError("RATE_LIMITED", id, "quota");
      }
      return Promise.resolve({
        // Volontairement faux : l'adaptateur renseigne ce qu'il connaît, c'est
        // à l'orchestrateur de réécrire l'identifiant local.
        instrumentId: `provider-${instrument.providerSymbol}`,
        provider: id,
        providerSymbol: instrument.providerSymbol,
        currency: instrument.currency,
        price: toDecimalString("101.5"),
        priceType: "LAST_TRADE",
        freshness: "DELAYED",
        asOf: "2026-08-25T06:41:30.000Z",
        receivedAt: "2026-08-25T06:41:31.000Z",
      });
    },
    getHistory: (_request: HistoryRequest): Promise<readonly PriceBar[]> => Promise.resolve([]),
  };
}

const request = (instrumentId: string, ticker: string) => ({
  instrumentId,
  reference: { kind: "TICKER" as const, ticker },
  assetType: "STOCK" as const,
});

const NOW = () => new Date("2026-08-25T07:00:00.000Z");

describe("refreshQuotes", () => {
  it("réécrit l'identifiant local sur le cours obtenu", async () => {
    const router = new ProviderRouter([fakeProvider("p")]);
    const report = await refreshQuotes(router, [request("uuid-aapl", "AAPL")], { now: NOW });

    const [outcome] = report.outcomes;
    expect(outcome?.kind).toBe("QUOTED");
    if (outcome?.kind !== "QUOTED") throw new Error("cours attendu");
    /*
     * Régression volontaire : le fournisseur renvoie `provider-AAPL`. Si cette
     * valeur passait, le moteur chercherait le cours sous une clé absente et la
     * position apparaîtrait non valorisée, sans la moindre erreur.
     */
    expect(outcome.quote.instrumentId).toBe("uuid-aapl");
    expect(outcome.servedBy).toBe("p");
    expect(report.refreshedAt).toBe("2026-08-25T07:00:00.000Z");
  });

  it("ne promeut jamais la fraîcheur annoncée par le fournisseur", async () => {
    const router = new ProviderRouter([fakeProvider("p")]);
    const report = await refreshQuotes(router, [request("uuid", "MSFT")], { now: NOW });

    const [outcome] = report.outcomes;
    if (outcome?.kind !== "QUOTED") throw new Error("cours attendu");
    expect(outcome.quote.freshness).toBe("DELAYED");
  });

  it("isole l'échec d'un instrument : les autres restent valorisés", async () => {
    const router = new ProviderRouter([
      fakeProvider("p", { perSymbol: { BROKEN: "resolve", LIMITED: "snapshot" } }),
    ]);

    const report = await refreshQuotes(
      router,
      [request("a", "AAPL"), request("b", "BROKEN"), request("c", "LIMITED"), request("d", "MSFT")],
      { now: NOW },
    );

    expect(report.quoted).toBe(2);
    expect(report.unquoted).toBe(2);
    expect(report.outcomes.map((outcome) => outcome.instrumentId)).toEqual(["a", "b", "c", "d"]);
    expect(report.outcomes.map((outcome) => outcome.kind)).toEqual([
      "QUOTED",
      "UNQUOTED",
      "UNQUOTED",
      "QUOTED",
    ]);
  });

  it("donne un motif lisible plutôt qu'un silence", async () => {
    const router = new ProviderRouter([fakeProvider("p", { perSymbol: { BROKEN: "resolve" } })]);
    const report = await refreshQuotes(router, [request("b", "BROKEN")], { now: NOW });

    const [outcome] = report.outcomes;
    if (outcome?.kind !== "UNQUOTED") throw new Error("absence de cours attendue");
    expect(outcome.reason).toBe("Cours indisponible : instrument inconnu du fournisseur.");
  });

  it("ne divulgue pas le message brut du fournisseur", async () => {
    const router = new ProviderRouter([
      fakeProvider("p", {
        resolveFails: new ProviderError(
          "UNAUTHORIZED",
          "p",
          "401 sur https://api.exemple/quote?token=SECRET",
        ),
      }),
    ]);
    const report = await refreshQuotes(router, [request("a", "AAPL")], { now: NOW });

    const [outcome] = report.outcomes;
    if (outcome?.kind !== "UNQUOTED") throw new Error("absence de cours attendue");
    expect(outcome.reason).not.toContain("SECRET");
    expect(outcome.reason).toBe("Cours indisponible : le fournisseur a refusé la clé configurée.");
  });

  it("ne tranche jamais une ambiguïté à la place de l'utilisateur", () => {
    expect(failureReason(new ProviderError("AMBIGUOUS", "p", "3 candidats"))).toContain(
      "à départager manuellement",
    );
  });

  it("borne le nombre d'appels simultanés", async () => {
    let inFlight = 0;
    let peak = 0;

    const provider: MarketDataProvider = {
      ...fakeProvider("p"),
      resolve: async (ref: InstrumentReference): Promise<ResolvedInstrument | null> => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return {
          provider: "p",
          providerSymbol: symbolOf(ref),
          name: "x",
          assetType: "STOCK",
          currency: "USD" as CurrencyCode,
          exchangeMic: null,
          isin: null,
          optionContract: null,
        };
      },
    };

    const router = new ProviderRouter([provider]);
    const requests = Array.from({ length: 12 }, (_unused, index) =>
      request(`id-${index}`, `SYM${index}`),
    );

    await refreshQuotes(router, requests, { concurrency: 3, now: NOW });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("rend un rapport vide sans appeler personne", async () => {
    const log: string[] = [];
    const router = new ProviderRouter([fakeProvider("p", {}, log)]);
    const report = await refreshQuotes(router, [], { now: NOW });

    expect(report.outcomes).toEqual([]);
    expect(report.quoted).toBe(0);
    expect(log).toEqual([]);
  });
});
