import { describe, expect, it } from "vitest";

import { createEodhdProvider } from "./eodhd-provider.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("EODHD provider", () => {
  it("normalise une recherche réelle sans confondre l'exchange avec un MIC", async () => {
    const provider = createEodhdProvider({
      apiToken: "test",
      mode: "live",
      fetchImpl: async () =>
        response([
          {
            Code: "AAPL",
            Exchange: "US",
            Name: "Apple Inc",
            Type: "Common Stock",
            Country: "USA",
            Currency: "USD",
            ISIN: "US0378331005",
            isPrimary: true,
          },
        ]),
    });

    const result = await provider.search({ text: "AAPL" });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      provider: "eodhd",
      providerSymbol: "AAPL.US",
      assetType: "STOCK",
      currency: "USD",
      exchangeMic: null,
      isin: "US0378331005",
    });
  });

  it("utilise la clé demo uniquement pour les symboles officiellement supportés", async () => {
    const provider = createEodhdProvider({ apiToken: "demo", mode: "demo" });
    const apple = await provider.resolve({ kind: "TICKER", ticker: "AAPL" });
    const unknown = await provider.resolve({ kind: "TICKER", ticker: "NESN" });

    expect(apple?.providerSymbol).toBe("AAPL.US");
    expect(unknown).toBeNull();
    expect(provider.capabilities().searchByText).toBe(false);
  });

  it("normalise le snapshot delayed et conserve le timestamp fournisseur", async () => {
    const provider = createEodhdProvider({
      apiToken: "demo",
      mode: "demo",
      now: () => new Date("2026-08-24T08:00:00.000Z"),
      fetchImpl: async () =>
        response({
          code: "AAPL.US",
          timestamp: 1787550000,
          close: 227.31,
          previousClose: 225.5,
        }),
    });
    const instrument = await provider.resolve({ kind: "TICKER", ticker: "AAPL" });
    if (instrument === null) throw new Error("Fixture AAPL absente");

    const quote = await provider.getSnapshot(instrument);
    expect(quote.price).toBe("227.31");
    expect(quote.previousClose).toBe("225.5");
    expect(quote.freshness).toBe("DELAYED");
    expect(quote.priceType).toBe("LAST_TRADE");
    expect(quote.receivedAt).toBe("2026-08-24T08:00:00.000Z");
  });

  it("valorise un fonds avec EOD/NAV et non avec un faux flux intraday", async () => {
    const provider = createEodhdProvider({
      apiToken: "test",
      mode: "live",
      fetchImpl: async (url) => {
        if (url.includes("/search/")) {
          return response([
            {
              Code: "FUND",
              Exchange: "EUFUND",
              Name: "Example Fund",
              Type: "Fund",
              Country: "LU",
              Currency: "EUR",
              ISIN: "LU0000000001",
              isPrimary: true,
            },
          ]);
        }
        return response([{ date: "2026-08-21", open: 101, high: 101, low: 101, close: 101.42 }]);
      },
    });
    const instrument = await provider.resolve({ kind: "ISIN", isin: "LU0000000001" });
    if (instrument === null) throw new Error("Fonds non résolu");

    const quote = await provider.getSnapshot(instrument);
    expect(quote.freshness).toBe("NAV");
    expect(quote.priceType).toBe("NAV");
    expect(quote.price).toBe("101.42");
    expect(quote.asOf).toContain("2026-08-21");
  });

  it("propage une erreur d'authentification comme UNAUTHORIZED", async () => {
    const provider = createEodhdProvider({
      apiToken: "bad",
      mode: "live",
      fetchImpl: async () => response({ error: "forbidden" }, 403),
    });

    await expect(provider.search({ text: "AAPL" })).rejects.toMatchObject({
      kind: "UNAUTHORIZED",
      provider: "eodhd",
    });
  });
});
