import { describe, expect, it } from "vitest";

import { createConfiguredProviders } from "./provider-factory.js";

describe("provider factory", () => {
  it("n'instancie aucun provider live par défaut", () => {
    const result = createConfiguredProviders({ MARKET_DATA_MODE: "mock" });
    expect(result.providers).toHaveLength(0);
  });

  it("active EODHD demo sans secret personnel", () => {
    const result = createConfiguredProviders({
      MARKET_DATA_MODE: "demo",
      MARKET_DATA_ENABLED_PROVIDERS: "eodhd",
      EODHD_ENABLED: "true",
      EODHD_MODE: "demo",
    });
    expect(result.providers.map((provider) => provider.id)).toContain("eodhd");
  });

  it("active Twelve Data demo avec la clé officielle demo", () => {
    const result = createConfiguredProviders({
      MARKET_DATA_MODE: "demo",
      MARKET_DATA_ENABLED_PROVIDERS: "twelvedata",
      TWELVE_DATA_ENABLED: "true",
      TWELVE_DATA_MODE: "demo",
    });
    expect(result.providers.map((provider) => provider.id)).toContain("twelvedata");
  });

  it("peut activer CoinGecko keyless en mode demo", () => {
    const result = createConfiguredProviders({
      MARKET_DATA_MODE: "demo",
      MARKET_DATA_ENABLED_PROVIDERS: "coingecko",
      COINGECKO_ENABLED: "true",
      COINGECKO_MODE: "demo",
    });
    expect(result.providers.map((provider) => provider.id)).toContain("coingecko");
  });

  it("refuse CoinGecko live sans clé", () => {
    const result = createConfiguredProviders({
      MARKET_DATA_MODE: "live",
      MARKET_DATA_ENABLED_PROVIDERS: "coingecko",
      COINGECKO_ENABLED: "true",
      COINGECKO_MODE: "live",
    });
    expect(result.providers).toHaveLength(0);
    expect(result.issues.join(" ")).toContain("coingecko");
  });
});
