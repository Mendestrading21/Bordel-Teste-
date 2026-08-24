import { describe, expect, it } from "vitest";

import { createCoinGeckoProvider } from "./coingecko-provider.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("CoinGecko provider", () => {
  it("utilise l'ID CoinGecko plutôt qu'un ticker ambigu", async () => {
    const provider = createCoinGeckoProvider({
      mode: "keyless",
      fetchImpl: async () =>
        response([
          {
            id: "bitcoin",
            symbol: "btc",
            name: "Bitcoin",
            current_price: 65000,
            market_cap_rank: 1,
          },
        ]),
    });
    const result = await provider.search({ text: "BTC", assetTypes: ["CRYPTO"] });
    expect(result[0]).toMatchObject({
      providerSymbol: "bitcoin",
      assetType: "CRYPTO",
      currency: "USD",
    });
  });

  it("normalise le prix et son timestamp sans prétendre au tick-by-tick", async () => {
    const provider = createCoinGeckoProvider({
      mode: "keyless",
      now: () => new Date("2026-08-24T09:00:00.000Z"),
      fetchImpl: async () => response({ bitcoin: { usd: 65123.456, last_updated_at: 1787561000 } }),
    });
    const quote = await provider.getSnapshot({
      provider: "coingecko",
      providerSymbol: "bitcoin",
      name: "Bitcoin",
      assetType: "CRYPTO",
      currency: "USD",
      exchangeMic: null,
      isin: null,
      optionContract: null,
    });
    expect(quote.price).toBe("65123.456");
    expect(quote.freshness).toBe("DELAYED");
    expect(quote.provider).toBe("coingecko");
  });

  it("ne transforme jamais une erreur 429 en donnée fictive", async () => {
    const provider = createCoinGeckoProvider({
      mode: "keyless",
      fetchImpl: async () => response({}, 429),
    });
    await expect(provider.search({ text: "BTC" })).rejects.toMatchObject({
      kind: "RATE_LIMITED",
      provider: "coingecko",
    });
  });
});
