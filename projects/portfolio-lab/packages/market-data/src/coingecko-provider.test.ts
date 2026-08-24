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

describe("CoinGecko — ambiguïté des tickers", () => {
  const base = {
    mode: "keyless" as const,
    now: () => new Date("2026-08-24T10:00:00.000Z"),
  };

  function providerWithRows(rows: readonly unknown[]) {
    return createCoinGeckoProvider({
      ...base,
      fetchImpl: async () =>
        new Response(JSON.stringify(rows), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
  }

  const uniswap = {
    id: "uniswap",
    symbol: "uni",
    name: "Uniswap",
    market_cap_rank: 22,
    current_price: 8.5,
  };
  const unicorn = {
    id: "unicorn-token",
    symbol: "uni",
    name: "Unicorn Token",
    market_cap_rank: 4821,
    current_price: 0.00031,
  };

  it("résout un ticker vers l'identifiant CoinGecko", async () => {
    /*
     * `providerSymbol` porte l'identifiant CoinGecko (`uniswap`), pas le ticker
     * (`uni`). L'ancien filtre comparait le ticker demandé à cet identifiant et
     * au nom : résoudre « UNI » ne pouvait donc jamais aboutir, alors même que
     * la recherche rendait des résultats.
     */
    const resolved = await providerWithRows([uniswap]).resolve({
      kind: "TICKER",
      ticker: "UNI",
    });

    expect(resolved?.providerSymbol).toBe("uniswap");
    expect(resolved?.name).toBe("Uniswap");
    expect(resolved?.assetType).toBe("CRYPTO");
  });

  it("refuse de choisir entre deux jetons homonymes", async () => {
    /*
     * Choisir le mieux classé serait le réflexe naturel et serait faux : un
     * utilisateur qui détient le jeton obscur verrait son patrimoine valorisé
     * au cours de l'homonyme capitalisé, sans rien pour le lui signaler.
     */
    await expect(
      providerWithRows([uniswap, unicorn]).resolve({ kind: "TICKER", ticker: "UNI" }),
    ).rejects.toMatchObject({ kind: "AMBIGUOUS" });
  });

  it("nomme les candidats et leur identifiant, seul moyen de trancher", async () => {
    const error = await providerWithRows([uniswap, unicorn])
      .resolve({ kind: "TICKER", ticker: "UNI" })
      .catch((caught: unknown) => caught);

    const message = error instanceof Error ? error.message : String(error);
    expect(message).toContain("id uniswap");
    expect(message).toContain("id unicorn-token");
    expect(message).toContain("Uniswap");
    expect(message).toContain("Unicorn Token");
  });

  it("accepte un identifiant CoinGecko exact sans ambiguïté", async () => {
    // L'identifiant est unique par construction : c'est lui qui lève le doute.
    const resolved = await providerWithRows([uniswap, unicorn]).resolve({
      kind: "TICKER",
      ticker: "unicorn-token",
    });
    expect(resolved?.providerSymbol).toBe("unicorn-token");
  });

  it("rend null quand rien ne correspond, sans inventer", async () => {
    const resolved = await providerWithRows([uniswap]).resolve({
      kind: "TICKER",
      ticker: "INEXISTANT",
    });
    expect(resolved).toBeNull();
  });

  it("ignore les lignes incomplètes plutôt que de les compter comme homonymes", async () => {
    // Une ligne sans identifiant ne peut pas être choisie : la compter dans
    // l'ambiguïté bloquerait une résolution par ailleurs certaine.
    const resolved = await providerWithRows([uniswap, { symbol: "uni", name: "Sans id" }]).resolve({
      kind: "TICKER",
      ticker: "UNI",
    });
    expect(resolved?.providerSymbol).toBe("uniswap");
  });
});
