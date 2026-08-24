import { describe, expect, it } from "vitest";
import { readLiveProviderConfig, validateLiveProviderConfig } from "./live-provider-config";

describe("live provider configuration", () => {
  it("reste en mock par défaut et n'expose jamais les valeurs de secrets", () => {
    const config = readLiveProviderConfig({
      EODHD_API_KEY: "secret-value",
    });

    expect(config.marketDataMode).toBe("mock");
    expect(config.providers.eodhd?.apiKeyPresent).toBe(true);
    expect(JSON.stringify(config)).not.toContain("secret-value");
  });

  it("signale un live sans provider activé", () => {
    const config = readLiveProviderConfig({ MARKET_DATA_MODE: "live" });
    expect(validateLiveProviderConfig(config)).toContain(
      "MARKET_DATA_MODE=live mais aucun fournisseur n'est activé",
    );
  });

  it("signale un provider live activé sans clé", () => {
    const config = readLiveProviderConfig({
      MARKET_DATA_MODE: "live",
      EODHD_ENABLED: "true",
      EODHD_MODE: "live",
    });

    expect(validateLiveProviderConfig(config)).toContain(
      "eodhd: activé sans clé API configurée",
    );
  });
});
