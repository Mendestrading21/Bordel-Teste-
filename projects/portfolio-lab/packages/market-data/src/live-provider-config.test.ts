import { describe, expect, it } from "vitest";
import { readLiveProviderConfig, validateLiveProviderConfig } from "./live-provider-config";

describe("live provider configuration", () => {
  it("reste en mock par défaut et n'expose jamais les valeurs de secrets", () => {
    const config = readLiveProviderConfig({
      EODHD_API_KEY: "secret-value",
    });

    expect(config.marketDataMode).toBe("mock");
    expect(config.providers["eodhd"]?.apiKeyPresent).toBe(true);
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

    expect(validateLiveProviderConfig(config)).toContain("eodhd: activé sans clé API configurée");
  });

  /*
   * Le piège que ce garde-fou ferme : `alphavantage` et `factset` figurent dans
   * la configuration parce qu'ils ont été étudiés, mais aucun adaptateur ne les
   * implémente. Les activer avec une clé passait toutes les validations et
   * n'instanciait rien — configuration en apparence correcte, écran muet, et
   * aucun lien visible entre les deux.
   */
  it("signale un fournisseur activé sans adaptateur", () => {
    const issues = validateLiveProviderConfig(
      readLiveProviderConfig({
        MARKET_DATA_MODE: "live",
        ALPHAVANTAGE_ENABLED: "true",
        ALPHAVANTAGE_API_KEY: "une-clé",
      }),
    );

    expect(issues.join(" ")).toContain("alphavantage");
    expect(issues.join(" ")).toContain("aucun adaptateur");
  });

  it("n'envoie pas chercher une clé pour un fournisseur sans adaptateur", () => {
    const issues = validateLiveProviderConfig(
      readLiveProviderConfig({ MARKET_DATA_MODE: "live", FACTSET_ENABLED: "true" }),
    );

    expect(issues.join(" ")).toContain("aucun adaptateur");
    expect(issues.join(" ")).not.toContain("factset: activé sans clé API");
  });

  it("laisse passer un fournisseur réellement implémenté et configuré", () => {
    const issues = validateLiveProviderConfig(
      readLiveProviderConfig({
        MARKET_DATA_MODE: "live",
        FINNHUB_ENABLED: "true",
        FINNHUB_API_KEY: "une-clé",
      }),
    );

    expect(issues).toEqual([]);
  });
});
