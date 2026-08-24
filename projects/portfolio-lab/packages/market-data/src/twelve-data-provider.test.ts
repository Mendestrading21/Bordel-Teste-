import { describe, expect, it } from "vitest";

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
      fetchImpl: async () => response({
        data: [{
          symbol: "AAPL",
          instrument_name: "Apple Inc",
          exchange: "NASDAQ",
          mic_code: "XNAS",
          instrument_type: "Common Stock",
          country: "United States",
          currency: "USD",
        }],
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
    const delayed = createTwelveDataProvider({ apiKey: "demo", mode: "demo", fetchImpl: async () => response({}) });
    const live = createTwelveDataProvider({ apiKey: "test", mode: "live", freshness: "LIVE", fetchImpl: async () => response({}) });

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
          return response({ data: [{ symbol: "AAPL", instrument_name: "Apple Inc", exchange: "NASDAQ", mic_code: "XNAS", instrument_type: "Common Stock", country: "United States", currency: "USD" }], status: "ok" });
        }
        return response({ symbol: "AAPL", currency: "USD", timestamp: 1787550000, close: "227.31000", previous_close: "225.50000", is_market_open: true });
      },
    });

    const instrument = await provider.resolve({ kind: "TICKER", ticker: "AAPL", exchangeMic: "XNAS" });
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
          return response({ data: [{ symbol: "FXAIX", instrument_name: "Fidelity 500 Index Fund", exchange: "NASDAQ", mic_code: "XNAS", instrument_type: "Mutual Fund", country: "United States", currency: "USD" }], status: "ok" });
        }
        return response({ symbol: "FXAIX", currency: "USD", datetime: "2026-08-21", close: "215.42" });
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
    await expect(provider.search({ text: "AAPL" })).rejects.toMatchObject({ provider: "twelvedata" });
  });
});
