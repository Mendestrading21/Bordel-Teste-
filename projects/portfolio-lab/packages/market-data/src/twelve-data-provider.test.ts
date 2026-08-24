import { describe, expect, it } from "vitest";

import type { ResolvedInstrument } from "./contract.js";
import { createTwelveDataProvider } from "./twelve-data-provider.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Twelve Data provider", () => {
  it("normalise symbol_search avec MIC ISO 10383", async () => {
    const provider = createTwelveDataProvider({
      apiKey: "demo",
      mode: "demo",
      fetchImpl: async () =>
        response({
          data: [
            {
              symbol: "AAPL",
              instrument_name: "Apple Inc",
              exchange: "NASDAQ",
              mic_code: "XNAS",
              instrument_type: "Common Stock",
              country: "United States",
              currency: "USD",
            },
          ],
          status: "ok",
        }),
    });

    const result = await provider.search({ text: "AAPL" });
    expect(result[0]).toMatchObject({
      provider: "twelvedata",
      providerSymbol: "AAPL",
      assetType: "STOCK",
      currency: "USD",
      exchangeMic: "XNAS",
    });
  });

  it("ne prétend jamais être LIVE sans configuration explicite", () => {
    const delayed = createTwelveDataProvider({
      apiKey: "demo",
      mode: "demo",
      fetchImpl: async () => response({}),
    });
    const live = createTwelveDataProvider({
      apiKey: "test",
      mode: "live",
      freshness: "LIVE",
      fetchImpl: async () => response({}),
    });

    expect(delayed.capabilities().bestFreshness).toBe("DELAYED");
    expect(live.capabilities().bestFreshness).toBe("LIVE");
  });

  it("normalise quote et previous close", async () => {
    const provider = createTwelveDataProvider({
      apiKey: "demo",
      mode: "demo",
      now: () => new Date("2026-08-24T08:00:00.000Z"),
      fetchImpl: async (url) => {
        if (url.includes("symbol_search")) {
          return response({
            data: [
              {
                symbol: "AAPL",
                instrument_name: "Apple Inc",
                exchange: "NASDAQ",
                mic_code: "XNAS",
                instrument_type: "Common Stock",
                country: "United States",
                currency: "USD",
              },
            ],
            status: "ok",
          });
        }
        return response({
          symbol: "AAPL",
          currency: "USD",
          timestamp: 1787550000,
          close: "227.31000",
          previous_close: "225.50000",
          is_market_open: true,
        });
      },
    });

    const instrument = await provider.resolve({
      kind: "TICKER",
      ticker: "AAPL",
      exchangeMic: "XNAS",
    });
    if (instrument === null) throw new Error("AAPL non résolu");
    const quote = await provider.getSnapshot(instrument);

    expect(quote.price).toBe("227.31");
    expect(quote.previousClose).toBe("225.5");
    expect(quote.marketState).toBe("OPEN");
    expect(quote.freshness).toBe("DELAYED");
  });

  it("garde un fonds en NAV quotidienne", async () => {
    const provider = createTwelveDataProvider({
      apiKey: "test",
      mode: "live",
      fetchImpl: async (url) => {
        if (url.includes("symbol_search")) {
          return response({
            data: [
              {
                symbol: "FXAIX",
                instrument_name: "Fidelity 500 Index Fund",
                exchange: "NASDAQ",
                mic_code: "XNAS",
                instrument_type: "Mutual Fund",
                country: "United States",
                currency: "USD",
              },
            ],
            status: "ok",
          });
        }
        return response({
          symbol: "FXAIX",
          currency: "USD",
          datetime: "2026-08-21",
          close: "215.42",
        });
      },
    });

    const instrument = await provider.resolve({ kind: "TICKER", ticker: "FXAIX" });
    if (instrument === null) throw new Error("fonds non résolu");
    const quote = await provider.getSnapshot(instrument);
    expect(quote.freshness).toBe("NAV");
    expect(quote.priceType).toBe("NAV");
  });

  it("convertit les erreurs JSON provider en erreurs normalisées", async () => {
    const provider = createTwelveDataProvider({
      apiKey: "bad",
      mode: "live",
      fetchImpl: async () => response({ status: "error", code: 429, message: "rate limit" }),
    });
    await expect(provider.search({ text: "AAPL" })).rejects.toMatchObject({
      provider: "twelvedata",
    });
  });
});

describe("Twelve Data — couverture, ambiguïté et flux", () => {
  const base = {
    apiKey: "test",
    mode: "live" as const,
    freshness: "DELAYED" as const,
    now: () => new Date("2026-08-24T10:00:00.000Z"),
  };

  const nestleInstrument: ResolvedInstrument = {
    provider: "twelvedata",
    providerSymbol: "NESN",
    name: "Nestlé SA",
    assetType: "STOCK",
    currency: "CHF",
    exchangeMic: "XSWX",
    isin: "CH0038863350",
    optionContract: null,
  };

  function withSearch(rows: readonly unknown[]) {
    return createTwelveDataProvider({
      ...base,
      fetchImpl: async () =>
        new Response(JSON.stringify({ data: rows }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
  }

  it("déclare les classes qu'il sait réellement servir", () => {
    const capabilities = createTwelveDataProvider(base).capabilities();
    // `fx: true` sans `FX` dans la liste rendait les devises inatteignables
    // depuis LIVE-01, sans qu'aucune erreur ne le dise.
    expect(capabilities.fx).toBe(true);
    expect(capabilities.assetTypes).toContain("FX");
    expect(capabilities.assetTypes).toContain("CRYPTO");
    expect(capabilities.assetTypes).toContain("INDEX");
  });

  it("n'annonce pas de flux sans implémentation", () => {
    /*
     * La version précédente annonçait `streaming: true` sans qu'aucune méthode
     * `subscribe` n'existe : une capacité déclarée que rien n'implémentait.
     */
    const provider = createTwelveDataProvider(base);
    expect(provider.capabilities().streaming).toBe(false);
    expect(provider.subscribe).toBeUndefined();
  });

  it("annonce le flux dès qu'une fabrique est fournie", () => {
    const provider = createTwelveDataProvider({
      ...base,
      socketFactory: () =>
        ({
          send: () => undefined,
          close: () => undefined,
          addEventListener: () => undefined,
        }) as never,
    });
    expect(provider.capabilities().streaming).toBe(true);
    expect(provider.subscribe).toBeDefined();
  });

  it("reconnaît devises, cryptos et indices au lieu de les jeter", async () => {
    const provider = withSearch([
      {
        symbol: "USD/CHF",
        instrument_name: "US Dollar/Swiss Franc",
        instrument_type: "Physical Currency",
        currency: "CHF",
        exchange: "FOREX",
        mic_code: null,
        country: null,
      },
      {
        symbol: "BTC/USD",
        instrument_name: "Bitcoin",
        instrument_type: "Digital Currency",
        currency: "USD",
        exchange: "Coinbase",
        mic_code: null,
        country: null,
      },
      {
        symbol: "SPX",
        instrument_name: "S&P 500",
        instrument_type: "Index",
        currency: "USD",
        exchange: "NYSE",
        mic_code: "XNYS",
        country: "United States",
      },
    ]);

    const candidates = await provider.search({ text: "test", limit: 10 });
    expect(candidates.map((candidate) => candidate.assetType)).toEqual(["FX", "CRYPTO", "INDEX"]);
  });

  it("signale l'ambiguïté au lieu de laisser un autre fournisseur trancher", async () => {
    const provider = withSearch([
      {
        symbol: "NESN",
        instrument_name: "Nestlé SA",
        instrument_type: "Common Stock",
        currency: "CHF",
        exchange: "SIX",
        mic_code: "XSWX",
        country: "Switzerland",
      },
      {
        symbol: "NESN",
        instrument_name: "Nestlé SA",
        instrument_type: "Common Stock",
        currency: "EUR",
        exchange: "XETR",
        mic_code: "XETR",
        country: "Germany",
      },
    ]);

    await expect(provider.resolve({ kind: "TICKER", ticker: "NESN" })).rejects.toMatchObject({
      kind: "AMBIGUOUS",
    });
  });

  it("ouvre un seul socket et bat le cœur", async () => {
    const sent: string[] = [];
    const listeners = new Map<string, ((event?: unknown) => void)[]>();
    let closed = false;

    const provider = createTwelveDataProvider({
      ...base,
      heartbeatMs: 10,
      socketFactory: () =>
        ({
          send: (data: string) => sent.push(data),
          close: () => {
            closed = true;
          },
          addEventListener: (type: string, listener: (event?: unknown) => void) => {
            listeners.set(type, [...(listeners.get(type) ?? []), listener]);
          },
        }) as never,
    });

    const handle = await provider.subscribe?.([nestleInstrument], () => undefined);
    for (const listener of listeners.get("open") ?? []) listener();

    expect(JSON.parse(sent[0] ?? "{}")).toEqual({
      action: "subscribe",
      params: { symbols: "NESN" },
    });

    // Le serveur ferme une connexion inactive ; une fermeture silencieuse
    // pendant les heures creuses ressemble à un marché sans transaction.
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(sent.some((message) => message.includes("heartbeat"))).toBe(true);

    await handle?.unsubscribe();
    expect(sent.at(-1)).toContain("unsubscribe");
    expect(closed).toBe(true);
  });

  it("transmet un tick normalisé et ignore le bruit", async () => {
    const listeners = new Map<string, ((event?: unknown) => void)[]>();
    const received: string[] = [];

    const provider = createTwelveDataProvider({
      ...base,
      heartbeatMs: 100_000,
      socketFactory: () =>
        ({
          send: () => undefined,
          close: () => undefined,
          addEventListener: (type: string, listener: (event?: unknown) => void) => {
            listeners.set(type, [...(listeners.get(type) ?? []), listener]);
          },
        }) as never,
    });

    const handle = await provider.subscribe?.([nestleInstrument], (quote) =>
      received.push(`${quote.price}/${quote.freshness}`),
    );

    const fire = (data: unknown) => {
      for (const listener of listeners.get("message") ?? []) listener({ data });
    };

    fire(JSON.stringify({ event: "subscribe-status", status: "ok" }));
    fire("texte non JSON");
    fire(
      JSON.stringify({ event: "price", symbol: "INCONNU", price: "1", timestamp: 1_787_500_800 }),
    );
    fire(
      JSON.stringify({
        event: "price",
        symbol: "NESN",
        price: "95.20000",
        timestamp: 1_787_500_800,
      }),
    );

    expect(received).toEqual(["95.2/DELAYED"]);
    await handle?.unsubscribe();
  });
});
