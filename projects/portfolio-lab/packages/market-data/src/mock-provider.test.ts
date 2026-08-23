import { describe, expect, it } from "vitest";

import { toDecimalString, type DecimalString } from "@portfolio-lab/domain";

import {
  assertFreshnessWithinCapabilities,
  assertProviderError,
  assertValidCandidate,
  assertValidHistory,
  assertValidQuote,
  assertValidResolution,
} from "./testing.js";
import { ProviderError, type ResolvedInstrument } from "./contract.js";
import { createMockProvider, MOCK_PROVIDER_ID, type MockInstrument } from "./mock-provider.js";

const d = (value: string): DecimalString => toDecimalString(value);

/** Horloge figée : les tests d'horodatage doivent être reproductibles. */
const NOW = (): Date => new Date("2026-06-15T14:00:00.000Z");

const INSTRUMENTS: MockInstrument[] = [
  {
    symbol: "DEMOI",
    name: "Démo Industrie SA",
    assetType: "STOCK",
    currency: "CHF",
    exchangeMic: "XSWX",
    isin: "XX000000DEM0",
  },
  {
    symbol: "DEMOT",
    name: "Démo Technologies Inc",
    assetType: "STOCK",
    currency: "USD",
    exchangeMic: "XNAS",
    isin: null,
  },
  {
    symbol: "DEMOW",
    name: "Démo Monde ETF",
    assetType: "ETF",
    currency: "USD",
    exchangeMic: "XNYS",
    isin: "XX000000DE27",
  },
  {
    symbol: "DEMOF",
    name: "Démo Fonds Équilibré P CHF",
    assetType: "MUTUAL_FUND",
    currency: "CHF",
    exchangeMic: null,
    isin: "XX000000DE35",
  },
  {
    symbol: "DEMOT270115C00100000",
    name: "Démo Technologies CALL 100",
    assetType: "OPTION",
    currency: "USD",
    exchangeMic: "XCBO",
    isin: null,
    optionContract: {
      underlyingSymbol: "DEMOT",
      optionType: "CALL",
      expiration: "2027-01-15",
      strike: d("100"),
      multiplier: d("100"),
      osiSymbol: "DEMOT270115C00100000",
      exerciseStyle: "AMERICAN",
      settlementType: "PHYSICAL",
    },
  },
];

const FX = new Map<string, DecimalString>([
  ["USD/CHF", d("0.89")],
  ["EUR/CHF", d("0.94")],
]);

function provider(overrides: Partial<Parameters<typeof createMockProvider>[0]> = {}) {
  return createMockProvider({ instruments: INSTRUMENTS, fxRates: FX, now: NOW, ...overrides });
}

describe("capabilities", () => {
  it("n'annonce jamais mieux que MANUAL", () => {
    // Une donnée simulée ne doit structurellement pas pouvoir se présenter
    // comme un cours de marché.
    expect(provider().capabilities().bestFreshness).toBe("MANUAL");
  });

  it("déclare les classes d'actifs et les capacités", () => {
    const capabilities = provider().capabilities();
    expect(capabilities.assetTypes).toContain("OPTION");
    expect(capabilities.searchByIsin).toBe(true);
    expect(capabilities.fx).toBe(true);
  });
});

describe("search", () => {
  it("trouve par nom partiel", async () => {
    const results = await provider().search({ text: "Industrie" });
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Démo Industrie SA");
  });

  it("trouve par ticker exact", async () => {
    const results = await provider().search({ text: "DEMOW" });
    expect(results[0]?.providerSymbol).toBe("DEMOW");
  });

  it("trouve par ISIN et lui donne la confiance maximale", async () => {
    const results = await provider().search({ text: "XX000000DE35" });
    expect(results).toHaveLength(1);
    // L'ISIN est l'identifiant le plus sûr.
    expect(results[0]?.confidence).toBe(1);
  });

  it("renvoie une liste vide plutôt qu'une approximation quand rien ne correspond", async () => {
    expect(await provider().search({ text: "instrument-inexistant" })).toEqual([]);
  });

  it("renvoie une liste vide pour une recherche vide", async () => {
    expect(await provider().search({ text: "   " })).toEqual([]);
  });

  it("filtre par classe d'actifs", async () => {
    const results = await provider().search({ text: "Démo", assetTypes: ["MUTUAL_FUND"] });
    expect(results.map((r) => r.assetType)).toEqual(["MUTUAL_FUND"]);
  });

  it("filtre par place de cotation", async () => {
    const results = await provider().search({ text: "Démo", exchangeMic: "XSWX" });
    expect(results.map((r) => r.providerSymbol)).toEqual(["DEMOI"]);
  });

  it("respecte la limite demandée", async () => {
    expect(await provider().search({ text: "Démo", limit: 2 })).toHaveLength(2);
  });

  it("produit des candidats conformes au contrat", async () => {
    for (const candidate of await provider().search({ text: "Démo" })) {
      assertValidCandidate(candidate, candidate.providerSymbol);
    }
  });

  it("laisse plusieurs candidats en cas d'ambiguïté, sans en choisir un", async () => {
    // MARKET_DATA.md : toute ambiguïté est tranchée par l'utilisateur.
    const results = await provider().search({ text: "Démo" });
    expect(results.length).toBeGreaterThan(1);
  });
});

describe("resolve", () => {
  it("résout par ISIN", async () => {
    const resolved = await provider().resolve({ kind: "ISIN", isin: "XX000000DEM0" });
    expect(resolved?.providerSymbol).toBe("DEMOI");
  });

  it("résout par ticker et place", async () => {
    const resolved = await provider().resolve({
      kind: "TICKER",
      ticker: "DEMOT",
      exchangeMic: "XNAS",
    });
    expect(resolved?.name).toBe("Démo Technologies Inc");
  });

  it("ne résout pas un ticker sur la mauvaise place", async () => {
    expect(
      await provider().resolve({ kind: "TICKER", ticker: "DEMOT", exchangeMic: "XSWX" }),
    ).toBeNull();
  });

  it("résout une option par ses quatre attributs", async () => {
    const resolved = await provider().resolve({
      kind: "OPTION",
      underlying: "DEMOT",
      optionType: "CALL",
      expiration: "2027-01-15",
      strike: d("100"),
    });
    expect(resolved).not.toBeNull();
    assertValidResolution(resolved as ResolvedInstrument, "option");
    expect(resolved?.optionContract?.multiplier).toBe("100");
  });

  it("ne résout pas une option dont un attribut diffère", async () => {
    expect(
      await provider().resolve({
        kind: "OPTION",
        underlying: "DEMOT",
        optionType: "PUT",
        expiration: "2027-01-15",
        strike: d("100"),
      }),
    ).toBeNull();
  });

  it("déclare son incapacité sur FIGI plutôt que d'approximer", async () => {
    expect(await provider().resolve({ kind: "FIGI", figi: "BBG000B9XRY4" })).toBeNull();
  });

  it("ignore un symbole destiné à un autre fournisseur", async () => {
    expect(
      await provider().resolve({ kind: "PROVIDER_SYMBOL", provider: "autre", symbol: "DEMOI" }),
    ).toBeNull();
  });

  it("renvoie null et non une erreur quand rien ne correspond", async () => {
    expect(await provider().resolve({ kind: "ISIN", isin: "XX000000DE99" })).toBeNull();
  });
});

describe("getSnapshot", () => {
  async function snapshotOf(symbol: string) {
    const instance = provider();
    const resolved = await instance.resolve({
      kind: "PROVIDER_SYMBOL",
      provider: MOCK_PROVIDER_ID,
      symbol,
    });
    return { instance, quote: await instance.getSnapshot(resolved as ResolvedInstrument) };
  }

  it("produit une quote conforme au contrat", async () => {
    const { instance, quote } = await snapshotOf("DEMOI");
    assertValidQuote(quote, "DEMOI");
    assertFreshnessWithinCapabilities(instance, quote, "DEMOI");
  });

  it("est déterministe : deux appels donnent le même prix", async () => {
    const first = await snapshotOf("DEMOT");
    const second = await snapshotOf("DEMOT");
    expect(first.quote.price).toBe(second.quote.price);
  });

  it("donne des prix différents à des instruments différents", async () => {
    // Un prix constant partagé ferait passer des tests par coïncidence.
    const a = await snapshotOf("DEMOI");
    const b = await snapshotOf("DEMOT");
    expect(a.quote.price).not.toBe(b.quote.price);
  });

  it("valorise un fonds par sa NAV, sans bid/ask ni clôture", async () => {
    const { quote } = await snapshotOf("DEMOF");
    expect(quote.priceType).toBe("NAV");
    expect(quote.freshness).toBe("NAV");
    expect(quote.bid).toBeUndefined();
    expect(quote.ask).toBeUndefined();
    // Un fonds n'a pas de clôture intraday.
    expect(quote.previousClose).toBeUndefined();
  });

  it("ordonne toujours bid <= ask", async () => {
    for (const symbol of ["DEMOI", "DEMOT", "DEMOW", "DEMOT270115C00100000"]) {
      const { quote } = await snapshotOf(symbol);
      expect(Number(quote.bid), symbol).toBeLessThanOrEqual(Number(quote.ask));
    }
  });

  it("horodate avec l'horloge injectée", async () => {
    const { quote } = await snapshotOf("DEMOI");
    expect(quote.asOf).toBe("2026-06-15T14:00:00.000Z");
  });

  it("signale un instrument inconnu par une erreur normalisée", async () => {
    const instance = provider();
    const fake: ResolvedInstrument = {
      provider: MOCK_PROVIDER_ID,
      providerSymbol: "INEXISTANT",
      name: "x",
      assetType: "STOCK",
      currency: "CHF",
      exchangeMic: null,
      isin: null,
      optionContract: null,
    };
    await expect(instance.getSnapshot(fake)).rejects.toThrow(ProviderError);
    await instance.getSnapshot(fake).catch((error: unknown) => {
      assertProviderError(error, "NOT_FOUND", "instrument inconnu");
    });
  });
});

describe("getHistory", () => {
  it("produit un historique conforme, trié et sans doublon", async () => {
    const instance = provider();
    const resolved = (await instance.resolve({
      kind: "PROVIDER_SYMBOL",
      provider: MOCK_PROVIDER_ID,
      symbol: "DEMOI",
    })) as ResolvedInstrument;

    const bars = await instance.getHistory({
      instrument: resolved,
      from: "2026-06-01",
      to: "2026-06-30",
      interval: "1day",
    });

    assertValidHistory(bars, "DEMOI");
    expect(bars.length).toBeGreaterThan(15);
  });

  it("exclut samedis et dimanches", async () => {
    const instance = provider();
    const resolved = (await instance.resolve({
      kind: "PROVIDER_SYMBOL",
      provider: MOCK_PROVIDER_ID,
      symbol: "DEMOI",
    })) as ResolvedInstrument;

    const bars = await instance.getHistory({
      instrument: resolved,
      from: "2026-06-01",
      to: "2026-06-30",
      interval: "1day",
    });

    // Une série contenant des week-ends masquerait les bugs de calendrier.
    for (const bar of bars) {
      const weekday = new Date(`${bar.date}T00:00:00Z`).getUTCDay();
      expect(weekday, bar.date).not.toBe(0);
      expect(weekday, bar.date).not.toBe(6);
    }
  });

  it("renvoie une série vide pour un intervalle inversé", async () => {
    const instance = provider();
    const resolved = (await instance.resolve({
      kind: "PROVIDER_SYMBOL",
      provider: MOCK_PROVIDER_ID,
      symbol: "DEMOI",
    })) as ResolvedInstrument;

    expect(
      await instance.getHistory({
        instrument: resolved,
        from: "2026-06-30",
        to: "2026-06-01",
        interval: "1day",
      }),
    ).toEqual([]);
  });
});

describe("getFxRate", () => {
  it("renvoie un taux connu", async () => {
    const rate = await provider().getFxRate?.("USD", "CHF");
    expect(rate?.rate).toBe("0.89");
    expect(rate?.freshness).toBe("MANUAL");
  });

  it("échoue explicitement sur un taux inconnu plutôt que d'en inventer un", async () => {
    await expect(provider().getFxRate?.("JPY", "CHF")).rejects.toThrow(ProviderError);
  });
});

describe("subscribe", () => {
  it("émet un instantané conforme par instrument", async () => {
    const instance = provider();
    const resolved = (await instance.resolve({
      kind: "PROVIDER_SYMBOL",
      provider: MOCK_PROVIDER_ID,
      symbol: "DEMOI",
    })) as ResolvedInstrument;

    const received: string[] = [];
    const handle = await instance.subscribe?.([resolved], (quote) => {
      assertValidQuote(quote, "abonnement");
      received.push(quote.providerSymbol);
    });

    expect(received).toEqual(["DEMOI"]);
    await handle?.unsubscribe();
  });
});

describe("gestion des pannes", () => {
  it("propage une erreur normalisée sur toutes les méthodes", async () => {
    const failing = provider({
      failWith: new ProviderError("RATE_LIMITED", MOCK_PROVIDER_ID, "quota dépassé", 60),
    });

    await expect(failing.search({ text: "Démo" })).rejects.toThrow(ProviderError);
    await expect(failing.resolve({ kind: "ISIN", isin: "XX000000DEM0" })).rejects.toThrow(
      ProviderError,
    );
    await expect(failing.getFxRate?.("USD", "CHF")).rejects.toThrow(ProviderError);
  });

  it("transporte le délai avant nouvelle tentative", async () => {
    const failing = provider({
      failWith: new ProviderError("RATE_LIMITED", MOCK_PROVIDER_ID, "quota dépassé", 60),
    });
    await failing.search({ text: "x" }).catch((error: unknown) => {
      expect((error as ProviderError).retryAfterSeconds).toBe(60);
    });
  });
});
