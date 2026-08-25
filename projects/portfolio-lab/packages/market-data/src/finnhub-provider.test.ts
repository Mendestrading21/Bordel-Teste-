import { describe, expect, it } from "vitest";

import {
  createFinnhubProvider,
  finnhubAssetType,
  finnhubFreshness,
  isEmptyQuote,
  FINNHUB_PROVIDER_ID,
} from "./finnhub-provider.js";
import { ProviderError } from "./contract.js";

const NOW = new Date("2026-08-24T15:30:00.000Z");

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function provider(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
  plan: "free" | "paid" = "free",
) {
  return createFinnhubProvider({
    apiKey: "clé-de-test",
    plan,
    now: () => NOW,
    fetchImpl: (input, init) => handler(String(input), init),
  });
}

const APPLE_QUOTE = {
  c: 310.62,
  d: 1.27,
  dp: 0.41,
  h: 311.5,
  l: 308.2,
  o: 309.1,
  pc: 309.35,
  t: 1787601339,
};

describe("finnhubAssetType", () => {
  it("reconnaît les types publiés", () => {
    expect(finnhubAssetType("Common Stock")).toBe("STOCK");
    expect(finnhubAssetType("ETP")).toBe("ETF");
    expect(finnhubAssetType("Mutual Fund")).toBe("MUTUAL_FUND");
  });

  it("écarte un type inconnu plutôt que de le ranger dans « Autre »", () => {
    /* Une ligne mal classée fausse ensuite toutes les répartitions : mieux
       vaut ne pas proposer le candidat que le proposer sous une fausse
       classe. */
    expect(finnhubAssetType("Structured Warrant")).toBeNull();
    expect(finnhubAssetType("")).toBeNull();
    expect(finnhubAssetType(undefined)).toBeNull();
  });
});

describe("isEmptyQuote", () => {
  it("reconnaît la cotation vide renvoyée pour un symbole inconnu", () => {
    /* Finnhub répond 200 avec des zéros quand il ne connaît pas le symbole.
       Prendre ce zéro pour un cours valoriserait la position à néant sans
       rien signaler — un total qui reste plausible et qui est faux. */
    expect(isEmptyQuote({ c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0 })).toBe(true);
  });

  it("ne confond pas un cours réel avec une cotation vide", () => {
    expect(isEmptyQuote(APPLE_QUOTE)).toBe(false);
  });

  it("ne déclare pas vide une cotation à zéro qui garde une clôture", () => {
    // Une action suspendue peut coter zéro tout en ayant une clôture connue.
    expect(isEmptyQuote({ c: 0, pc: 12.5 })).toBe(false);
  });
});

describe("finnhubFreshness", () => {
  it("n'annonce LIVE sur le plan gratuit que pour les places américaines", () => {
    expect(finnhubFreshness("free", "AAPL")).toBe("LIVE");
    // Un suffixe de place désigne une bourse étrangère, hors temps réel gratuit.
    expect(finnhubFreshness("free", "NESN.SW")).toBe("DELAYED");
    expect(finnhubFreshness("free", "MC.PA")).toBe("DELAYED");
  });

  it("suit le plan payant lorsqu'il est déclaré", () => {
    expect(finnhubFreshness("paid", "NESN.SW")).toBe("LIVE");
  });
});

describe("createFinnhubProvider", () => {
  it("refuse d'exister sans clé", () => {
    expect(() => createFinnhubProvider({ apiKey: "  ", plan: "free" })).toThrow(ProviderError);
  });

  it("ne déclare ni fonds, ni options, ni historique", () => {
    /* Déclarer une capacité que rien ne soutient ferait router vers un
       fournisseur qui échouera à chaque appel. */
    const caps = provider(async () => jsonResponse({})).capabilities();
    expect(caps.assetTypes).toEqual(["STOCK", "ETF"]);
    expect(caps.optionChains).toBe(false);
    expect(caps.history).toBe(false);
    expect(caps.fx).toBe(false);
    expect(caps.streaming).toBe(false);
  });

  it("annonce DELAYED sur le plan gratuit, jamais LIVE par défaut", () => {
    expect(provider(async () => jsonResponse({})).capabilities().bestFreshness).toBe("DELAYED");
    expect(provider(async () => jsonResponse({}), "paid").capabilities().bestFreshness).toBe(
      "LIVE",
    );
  });

  it("transmet la clé en en-tête, jamais dans l'URL", async () => {
    let seenUrl = "";
    let seenHeader: string | null = null;
    const p = provider(async (url, init) => {
      seenUrl = url;
      seenHeader = new Headers(init?.headers).get("x-finnhub-token");
      return jsonResponse(APPLE_QUOTE);
    });
    await p.getSnapshot({
      provider: FINNHUB_PROVIDER_ID,
      providerSymbol: "AAPL",
      name: "Apple",
      assetType: "STOCK",
      currency: "USD",
      exchangeMic: null,
      isin: null,
      optionContract: null,
    });
    // Une URL finit dans les journaux d'accès ; un en-tête beaucoup plus rarement.
    expect(seenUrl).not.toContain("clé-de-test");
    expect(seenHeader).toBe("clé-de-test");
  });

  it("normalise une cotation réelle", async () => {
    const p = provider(async () => jsonResponse(APPLE_QUOTE));
    const quote = await p.getSnapshot({
      provider: FINNHUB_PROVIDER_ID,
      providerSymbol: "AAPL",
      name: "Apple",
      assetType: "STOCK",
      currency: "USD",
      exchangeMic: null,
      isin: null,
      optionContract: null,
    });
    expect(quote.price).toBe("310.62");
    expect(quote.previousClose).toBe("309.35");
    expect(quote.priceType).toBe("LAST_TRADE");
    // L'horodatage vient du fournisseur, pas de l'horloge locale.
    expect(quote.asOf).toBe(new Date(1787601339 * 1000).toISOString());
    expect(quote.receivedAt).toBe(NOW.toISOString());
  });

  it("refuse une cotation vide au lieu de valoriser à zéro", async () => {
    const p = provider(async () =>
      jsonResponse({ c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0 }),
    );
    await expect(
      p.getSnapshot({
        provider: FINNHUB_PROVIDER_ID,
        providerSymbol: "INEXISTANT",
        name: "?",
        assetType: "STOCK",
        currency: "USD",
        exchangeMic: null,
        isin: null,
        optionContract: null,
      }),
    ).rejects.toMatchObject({ kind: "NOT_FOUND" });
  });

  it("refuse une cotation sans horodatage exploitable", async () => {
    const p = provider(async () => jsonResponse({ ...APPLE_QUOTE, t: 0 }));
    await expect(
      p.getSnapshot({
        provider: FINNHUB_PROVIDER_ID,
        providerSymbol: "AAPL",
        name: "Apple",
        assetType: "STOCK",
        currency: "USD",
        exchangeMic: null,
        isin: null,
        optionContract: null,
      }),
    ).rejects.toMatchObject({ kind: "MALFORMED_RESPONSE" });
  });

  it("distingue une clé refusée d'une panne réseau", async () => {
    const p = provider(async () => jsonResponse({ error: "Invalid API key" }, 401));
    await expect(
      p.getSnapshot({
        provider: FINNHUB_PROVIDER_ID,
        providerSymbol: "AAPL",
        name: "Apple",
        assetType: "STOCK",
        currency: "USD",
        exchangeMic: null,
        isin: null,
        optionContract: null,
      }),
    ).rejects.toMatchObject({ kind: "UNAUTHORIZED" });
  });

  it("propage le délai suggéré lorsque le quota est atteint", async () => {
    const p = provider(async () => jsonResponse({}, 429, { "retry-after": "30" }));
    await expect(
      p.getSnapshot({
        provider: FINNHUB_PROVIDER_ID,
        providerSymbol: "AAPL",
        name: "Apple",
        assetType: "STOCK",
        currency: "USD",
        exchangeMic: null,
        isin: null,
        optionContract: null,
      }),
    ).rejects.toMatchObject({ kind: "RATE_LIMITED", retryAfterSeconds: 30 });
  });

  it("écarte de la recherche les lignes au type inconnu", async () => {
    const p = provider(async () =>
      jsonResponse({
        count: 3,
        result: [
          { description: "APPLE INC", displaySymbol: "AAPL", symbol: "AAPL", type: "Common Stock" },
          {
            description: "DIREXION DAILY AAPL BULL 2X",
            displaySymbol: "AAPU",
            symbol: "AAPU",
            type: "ETP",
          },
          {
            description: "MACHIN EXOTIQUE",
            displaySymbol: "ZZZZ",
            symbol: "ZZZZ",
            type: "Warrant",
          },
        ],
      }),
    );
    const found = await p.search({ text: "AAPL" });
    expect(found.map((c) => c.providerSymbol)).toEqual(["AAPL", "AAPU"]);
    // Le tri place la correspondance exacte devant, sans la choisir.
    expect(found[0]?.confidence).toBeGreaterThan(found[1]?.confidence ?? 1);
  });

  it("ne choisit jamais silencieusement entre deux symboles identiques", async () => {
    const p = provider(async () =>
      jsonResponse({
        count: 2,
        result: [
          { description: "APPLE INC", displaySymbol: "AAPL", symbol: "AAPL", type: "Common Stock" },
          { description: "APPLE INC ADR", displaySymbol: "AAPL", symbol: "AAPL", type: "ADR" },
        ],
      }),
    );
    await expect(p.resolve({ kind: "TICKER", ticker: "AAPL" })).rejects.toMatchObject({
      kind: "AMBIGUOUS",
    });
  });

  it("refuse l'historique plutôt que de rendre un tableau vide", async () => {
    const p = provider(async () => jsonResponse({}));
    await expect(
      p.getHistory({
        instrument: {
          provider: FINNHUB_PROVIDER_ID,
          providerSymbol: "AAPL",
          name: "Apple",
          assetType: "STOCK",
          currency: "USD",
          exchangeMic: null,
          isin: null,
          optionContract: null,
        },
        from: "2026-01-01",
        to: "2026-08-24",
        interval: "1day",
      }),
    ).rejects.toMatchObject({ kind: "UNSUPPORTED" });
  });

  it("ne résout ni ISIN ni option", async () => {
    const p = provider(async () => jsonResponse({}));
    expect(await p.resolve({ kind: "ISIN", isin: "US0378331005" })).toBeNull();
  });
});
