import { describe, expect, it } from "vitest";
import type {
  InstrumentCandidate,
  InstrumentSearchQuery,
  MarketDataProvider,
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
});
