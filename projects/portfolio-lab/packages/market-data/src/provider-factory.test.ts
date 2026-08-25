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

  it("instancie Finnhub quand il est activé avec une clé", () => {
    const result = createConfiguredProviders({
      MARKET_DATA_MODE: "live",
      MARKET_DATA_ENABLED_PROVIDERS: "finnhub",
      FINNHUB_ENABLED: "true",
      FINNHUB_API_KEY: "clé-de-test",
    });
    expect(result.providers.map((provider) => provider.id)).toContain("finnhub");
  });

  /*
   * Régression : l'adaptateur Finnhub existait et `finnhub` figurait dans la
   * configuration, mais la fabrique ne l'instanciait pas. Une clé pouvait donc
   * être renseignée sans qu'aucun cours n'en vienne jamais — une panne
   * parfaitement silencieuse.
   */
  it("signale Finnhub activé sans clé plutôt que de l'omettre en silence", () => {
    const result = createConfiguredProviders({
      MARKET_DATA_MODE: "live",
      MARKET_DATA_ENABLED_PROVIDERS: "finnhub",
      FINNHUB_ENABLED: "true",
    });
    expect(result.providers).toHaveLength(0);
    expect(result.issues.join(" ")).toContain("finnhub");
  });

  it("ne promeut pas la fraîcheur Finnhub sans plan payant déclaré", () => {
    const free = createConfiguredProviders({
      MARKET_DATA_MODE: "live",
      MARKET_DATA_ENABLED_PROVIDERS: "finnhub",
      FINNHUB_ENABLED: "true",
      FINNHUB_API_KEY: "clé-de-test",
    }).providers.find((provider) => provider.id === "finnhub");
    expect(free?.capabilities().bestFreshness).toBe("DELAYED");

    const paid = createConfiguredProviders({
      MARKET_DATA_MODE: "live",
      MARKET_DATA_ENABLED_PROVIDERS: "finnhub",
      FINNHUB_ENABLED: "true",
      FINNHUB_API_KEY: "clé-de-test",
      FINNHUB_PLAN: "paid",
    }).providers.find((provider) => provider.id === "finnhub");
    expect(paid?.capabilities().bestFreshness).toBe("LIVE");
  });
});
