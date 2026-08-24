import { describe, expect, it } from "vitest";

import { ProviderError, type ResolvedInstrument } from "./contract.js";
import { createMassiveProvider } from "./massive-provider.js";

const base = {
  apiKey: "clé-de-test",
  freshness: "DELAYED" as const,
  delayMinutes: 15,
  now: () => new Date("2026-08-24T10:00:00.000Z"),
};

const apple: ResolvedInstrument = {
  provider: "massive",
  providerSymbol: "AAPL",
  name: "Apple Inc.",
  assetType: "STOCK",
  currency: "USD",
  exchangeMic: "XNAS",
  isin: null,
  optionContract: null,
};

function providerWith(body: unknown, status = 200, capture?: { url?: string; init?: RequestInit }) {
  return createMassiveProvider({
    ...base,
    fetchImpl: async (url, init) => {
      if (capture !== undefined) {
        capture.url = url;
        if (init !== undefined) capture.init = init;
      }
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    },
  });
}

describe("Massive — clé et erreurs", () => {
  it("envoie la clé en en-tête et jamais dans l'URL", async () => {
    /*
     * Une URL se retrouve dans les journaux d'accès, les traces et les
     * rapports d'erreur. Une clé qui y figure est une clé publiée.
     */
    const capture: { url?: string; init?: RequestInit } = {};
    const provider = providerWith({ results: [] }, 200, capture);
    await provider.search({ text: "AAPL" });

    expect(capture.url).not.toContain("clé-de-test");
    expect(capture.url).not.toMatch(/api[_-]?key/i);
    const headers = capture.init?.headers as Record<string, string> | undefined;
    expect(headers?.["Authorization"]).toBe("Bearer clé-de-test");
  });

  it("distingue une clé refusée d'un instrument introuvable", async () => {
    await expect(providerWith({}, 403).search({ text: "AAPL" })).rejects.toMatchObject({
      kind: "UNAUTHORIZED",
    });
    await expect(providerWith({}, 404).search({ text: "AAPL" })).rejects.toMatchObject({
      kind: "NOT_FOUND",
    });
    await expect(providerWith({}, 429).search({ text: "AAPL" })).rejects.toMatchObject({
      kind: "RATE_LIMITED",
    });
  });

  it("refuse une réponse de recherche sans tableau results", async () => {
    await expect(providerWith({ status: "OK" }).search({ text: "AAPL" })).rejects.toThrow(
      ProviderError,
    );
  });
});

describe("Massive — couverture déclarée", () => {
  it("ne prétend pas couvrir ce qu'il ne couvre pas", () => {
    /*
     * Massive est un fournisseur américain. Y router une action suisse
     * produirait un « introuvable » qui ressemble à un instrument inexistant
     * plutôt qu'à une couverture absente. Les fonds classiques se valorisent à
     * la NAV, que Massive ne publie pas.
     */
    const capabilities = createMassiveProvider(base).capabilities();
    expect(capabilities.assetTypes).toContain("OPTION");
    expect(capabilities.assetTypes).toContain("FUTURE");
    expect(capabilities.assetTypes).not.toContain("MUTUAL_FUND");
    expect(capabilities.assetTypes).not.toContain("CRYPTO");
    expect(capabilities.fx).toBe(false);
  });

  it("n'annonce pas de flux tant qu'aucune implémentation n'existe", () => {
    expect(createMassiveProvider(base).capabilities().streaming).toBe(false);
    expect(createMassiveProvider(base).subscribe).toBeUndefined();
  });

  it("porte la fraîcheur du plan et non une valeur devinée", () => {
    // Les plans différés et temps réel renvoient la même forme de réponse :
    // rien dans la charge utile ne permet de les distinguer.
    expect(createMassiveProvider(base).capabilities().bestFreshness).toBe("DELAYED");
    expect(createMassiveProvider(base).capabilities().delayMinutes).toBe(15);
    expect(
      createMassiveProvider({ ...base, freshness: "LIVE" }).capabilities().delayMinutes,
    ).toBeNull();
  });
});

describe("Massive — instantané", () => {
  const snapshot = {
    ticker: {
      lastTrade: { p: 227.31, t: 1_787_500_800_000_000_000 },
      prevDay: { c: 225.5 },
    },
  };

  it("convertit les nanosecondes en horodatage exploitable", async () => {
    /*
     * Massive horodate en nanosecondes. L'oublier daterait chaque cours de
     * plusieurs millénaires dans le futur, et la détection de péremption les
     * accepterait tous comme frais.
     */
    const quote = await providerWith(snapshot).getSnapshot(apple);
    expect(quote.asOf).toBe(new Date(1_787_500_800_000).toISOString());
    expect(new Date(quote.asOf).getUTCFullYear()).toBeLessThan(2100);
  });

  it("normalise le prix et la clôture précédente", async () => {
    const quote = await providerWith(snapshot).getSnapshot(apple);
    expect(quote.price).toBe("227.31");
    expect(quote.previousClose).toBe("225.5");
    expect(quote.currency).toBe("USD");
  });

  it("ne déduit jamais la fraîcheur de la réponse", async () => {
    const delayed = await providerWith(snapshot).getSnapshot(apple);
    expect(delayed.freshness).toBe("DELAYED");
  });

  it("omet la clôture précédente absente au lieu de la poser à undefined", async () => {
    const quote = await providerWith({
      ticker: { lastTrade: snapshot.ticker.lastTrade },
    }).getSnapshot(apple);
    expect(quote).not.toHaveProperty("previousClose");
  });

  it("refuse un instantané sans horodatage plutôt que d'en inventer un", async () => {
    await expect(
      providerWith({ ticker: { lastTrade: { p: 227.31 } } }).getSnapshot(apple),
    ).rejects.toThrow(/Horodatage/);
  });

  it("signale l'absence d'instantané", async () => {
    await expect(providerWith({}).getSnapshot(apple)).rejects.toMatchObject({ kind: "NOT_FOUND" });
  });
});

describe("Massive — résolution", () => {
  it("signale l'ambiguïté au lieu de choisir", async () => {
    const provider = providerWith({
      results: [
        {
          ticker: "AAPL",
          name: "Apple Inc.",
          type: "CS",
          currency_name: "usd",
          primary_exchange: "XNAS",
        },
        {
          ticker: "AAPL",
          name: "Apple Inc. (autre)",
          type: "CS",
          currency_name: "usd",
          primary_exchange: "BATS",
        },
      ],
    });
    await expect(provider.resolve({ kind: "TICKER", ticker: "AAPL" })).rejects.toMatchObject({
      kind: "AMBIGUOUS",
    });
  });

  it("rend null pour une référence qu'il ne sait pas traiter", async () => {
    const provider = providerWith({ results: [] });
    expect(await provider.resolve({ kind: "ISIN", isin: "US0378331005" })).toBeNull();
    expect(
      await provider.resolve({ kind: "PROVIDER_SYMBOL", provider: "eodhd", symbol: "AAPL.US" }),
    ).toBeNull();
  });
});

describe("Massive — historique", () => {
  it("convertit les bornes en dates et normalise les décimales", async () => {
    const provider = providerWith({
      results: [{ t: 1_787_500_800_000, o: 1.1, h: "2.5", l: null, c: 2.0 }],
    });
    const bars = await provider.getHistory({
      instrument: apple,
      from: "2026-08-01",
      to: "2026-08-24",
      interval: "1day",
    });

    expect(bars[0]?.date).toBe("2026-08-23");
    expect(bars[0]?.open).toBe("1.1");
    expect(bars[0]?.high).toBe("2.5");
    expect(bars[0]?.low).toBeNull();
    expect(bars[0]?.close).toBe("2");
  });

  it("date la barre journalière au bon jour de bourse", async () => {
    /*
     * Massive horodate une barre journalière à l'ouverture, minuit heure de
     * New York — soit 04:00 ou 05:00 UTC le **même** jour calendaire. Découper
     * l'ISO UTC donne donc le bon jour.
     *
     * Ce test fixe cette hypothèse : si le fournisseur passait à un horodatage
     * de clôture, 20:00 ET tomberait le lendemain en UTC et tout l'historique
     * glisserait d'un jour, silencieusement.
     */
    const provider = providerWith({
      results: [
        // 2026-08-24T00:00:00 heure de New York (EDT, UTC-4).
        { t: Date.parse("2026-08-24T04:00:00.000Z"), c: 1 },
      ],
    });
    const bars = await provider.getHistory({
      instrument: apple,
      from: "2026-08-24",
      to: "2026-08-24",
      interval: "1day",
    });
    expect(bars[0]?.date).toBe("2026-08-24");
  });

  it("rend une série vide plutôt que d'échouer sur une réponse sans résultats", async () => {
    const bars = await providerWith({ status: "OK" }).getHistory({
      instrument: apple,
      from: "2026-08-01",
      to: "2026-08-24",
      interval: "1day",
    });
    expect(bars).toEqual([]);
  });
});
