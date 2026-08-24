import { describe, expect, it } from "vitest";
import type {
  InstrumentCandidate,
  InstrumentSearchQuery,
  MarketDataProvider,
  NormalizedQuote,
  ProviderCapabilities,
  ResolvedInstrument,
} from "./contract";
import { ProviderError } from "./contract";
import { ProviderRouter } from "./provider-router";

function provider(
  id: string,
  overrides: Partial<MarketDataProvider> = {},
  capabilities: Partial<ProviderCapabilities> = {},
): MarketDataProvider {
  return {
    id,
    capabilities: () => ({
      assetTypes: ["STOCK", "ETF", "MUTUAL_FUND", "OPTION", "CASH", "OTHER"],
      searchByText: true,
      searchByIsin: true,
      optionChains: false,
      fx: false,
      history: true,
      streaming: false,
      bestFreshness: "EOD",
      delayMinutes: null,
      ...capabilities,
    }),
    search: async () => [],
    resolve: async () => null,
    getSnapshot: async () => {
      throw new ProviderError("NOT_FOUND", id, "missing");
    },
    getHistory: async () => [],
    ...overrides,
  };
}

const candidate = (providerId: string, confidence: number): InstrumentCandidate => ({
  provider: providerId,
  providerSymbol: "AAPL",
  name: "Apple Inc.",
  assetType: "STOCK",
  currency: "USD",
  exchangeMic: "XNAS",
  isin: "US0378331005",
  figi: null,
  countryCode: "US",
  confidence,
});

const quote = (providerId: string): NormalizedQuote => ({
  instrumentId: "AAPL",
  provider: providerId,
  providerSymbol: "AAPL",
  currency: "USD",
  price: "227.31" as NormalizedQuote["price"],
  priceType: "LAST_TRADE",
  freshness: "EOD",
  asOf: "2026-08-24T00:00:00.000Z",
  receivedAt: "2026-08-24T00:00:01.000Z",
});

const instrument: ResolvedInstrument = {
  provider: "primary",
  providerSymbol: "AAPL",
  name: "Apple Inc.",
  assetType: "STOCK",
  currency: "USD",
  exchangeMic: "XNAS",
  isin: "US0378331005",
  optionContract: null,
};

describe("ProviderRouter", () => {
  it("agrège et déduplique la recherche en gardant la meilleure confiance", async () => {
    const first = provider("first", {
      search: async (_query: InstrumentSearchQuery) => [candidate("first", 0.7)],
    });
    const second = provider("second", {
      search: async () => [candidate("second", 0.95)],
    });

    const router = new ProviderRouter([first, second]);
    const result = await router.search({ text: "Apple" });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.confidence).toBe(0.95);
    expect(result.trace.attemptedProviders).toEqual(["first", "second"]);
  });

  it("fallback vers le second fournisseur sur NOT_FOUND", async () => {
    const primary = provider("primary", {
      resolve: async () => {
        throw new ProviderError("NOT_FOUND", "primary", "not found");
      },
    });
    const backup = provider("backup", {
      resolve: async () => ({ ...instrument, provider: "backup" }),
    });

    const router = new ProviderRouter([primary, backup]);
    const result = await router.resolve({ kind: "TICKER", ticker: "AAPL" });

    expect(result.instrument.provider).toBe("backup");
    expect(result.trace.attemptedProviders).toEqual(["primary", "backup"]);
    expect(result.trace.failures[0]?.kind).toBe("NOT_FOUND");
  });

  it("ne masque pas une erreur UNAUTHORIZED avec un fallback", async () => {
    const primary = provider("primary", {
      resolve: async () => {
        throw new ProviderError("UNAUTHORIZED", "primary", "bad key");
      },
    });
    const backup = provider("backup", {
      resolve: async () => ({ ...instrument, provider: "backup" }),
    });

    const router = new ProviderRouter([primary, backup]);
    await expect(router.resolve({ kind: "TICKER", ticker: "AAPL" })).rejects.toMatchObject({
      kind: "UNAUTHORIZED",
      provider: "primary",
    });
  });

  it("respecte les priorités configurées", async () => {
    const first = provider("first", {
      resolve: async () => ({ ...instrument, provider: "first" }),
    });
    const second = provider("second", {
      resolve: async () => ({ ...instrument, provider: "second" }),
    });

    const router = new ProviderRouter(
      [first, second],
      [
        { providerId: "second", priority: 0, enabled: true },
        { providerId: "first", priority: 10, enabled: true },
      ],
    );

    const result = await router.resolve({ kind: "TICKER", ticker: "AAPL" });
    expect(result.instrument.provider).toBe("second");
  });
  it("n'interroge pas un fournisseur qui ne couvre pas la classe d'actif", async () => {
    /*
     * Le manque le plus coûteux de la version précédente : un fournisseur
     * crypto était interrogé pour une option américaine. La requête partait, la
     * latence était payée, et le « je ne trouve pas » qui revenait était
     * indiscernable d'une vraie recherche infructueuse.
     */
    let cryptoCalled = false;
    const cryptoOnly = provider(
      "crypto",
      {
        getSnapshot: async () => {
          cryptoCalled = true;
          throw new ProviderError("NOT_FOUND", "crypto", "jamais atteint");
        },
      },
      { assetTypes: ["CRYPTO"] },
    );
    const equities = provider(
      "equities",
      { getSnapshot: async () => quote("equities") },
      { assetTypes: ["STOCK", "OPTION"] },
    );

    const router = new ProviderRouter([cryptoOnly, equities]);
    const result = await router.snapshot({ ...instrument, provider: "inconnu" });

    expect(cryptoCalled).toBe(false);
    expect(result.trace.attemptedProviders).toEqual(["equities"]);
    expect(result.trace.skipped).toEqual([{ provider: "crypto", reason: "ne couvre pas STOCK" }]);
  });

  it("explique l'absence de couverture plutôt que de dire seulement « introuvable »", async () => {
    const cryptoOnly = provider("crypto", {}, { assetTypes: ["CRYPTO"] });
    const router = new ProviderRouter([cryptoOnly]);

    await expect(
      router.history({
        instrument: { ...instrument, assetType: "BOND" },
        from: "2026-01-01",
        to: "2026-02-01",
        interval: "1day",
      }),
    ).rejects.toThrow(/Aucun fournisseur compétent.*crypto \(ne couvre pas BOND\)/);
  });

  it("poursuit la recherche quand un fournisseur refuse la clé", async () => {
    /*
     * Une clé invalide chez un fournisseur sur deux ne doit pas priver
     * l'utilisateur des résultats de l'autre. L'échec reste visible dans la
     * trace : il est reporté, pas masqué.
     */
    const broken = provider("broken", {
      search: async () => {
        throw new ProviderError("UNAUTHORIZED", "broken", "clé refusée");
      },
    });
    const working = provider("working", { search: async () => [candidate("working", 0.8)] });

    const router = new ProviderRouter([broken, working]);
    const result = await router.search({ text: "Apple" });

    expect(result.candidates).toHaveLength(1);
    expect(result.trace.failures).toEqual([
      { provider: "broken", kind: "UNAUTHORIZED", message: "clé refusée" },
    ]);
  });

  it("signale les instruments qu'aucun fournisseur ne peut diffuser", async () => {
    /*
     * Le silence de la version précédente : la souscription réussissait, et la
     * moitié du portefeuille ne bougeait jamais. Rien ne distinguait cela d'un
     * marché calme.
     */
    const streaming = provider(
      "streaming",
      { subscribe: async () => ({ unsubscribe: async () => undefined }) },
      { streaming: true },
    );
    const silent = provider("silent", {}, { streaming: false });

    const router = new ProviderRouter([streaming, silent]);
    const result = await router.subscribe(
      [
        { ...instrument, provider: "streaming" },
        { ...instrument, provider: "silent", providerSymbol: "MSFT" },
        { ...instrument, provider: "absent", providerSymbol: "NESN" },
      ],
      () => undefined,
    );

    expect(result.traces.map((trace) => trace.servedBy)).toEqual(["streaming"]);
    expect(result.unsupported.map((entry) => entry.instrument.providerSymbol)).toEqual([
      "MSFT",
      "NESN",
    ]);
    expect(result.unsupported[0]?.reason).toContain("pas de flux temps réel");
    expect(result.unsupported[1]?.reason).toContain("non enregistré");
  });

  it("interroge tous les fournisseurs quand la recherche ne précise aucun type", async () => {
    // La recherche universelle : l'utilisateur tape « Apple » sans dire s'il
    // cherche une action, un ETF ou une obligation.
    const cryptoOnly = provider(
      "crypto",
      { search: async () => [candidate("crypto", 0.4)] },
      { assetTypes: ["CRYPTO"] },
    );
    const equities = provider(
      "equities",
      { search: async () => [candidate("equities", 0.9)] },
      { assetTypes: ["STOCK"] },
    );

    const router = new ProviderRouter([cryptoOnly, equities]);
    const result = await router.search({ text: "Apple" });

    expect(result.trace.attemptedProviders).toEqual(["crypto", "equities"]);
    expect(result.trace.skipped).toEqual([]);
  });
});
