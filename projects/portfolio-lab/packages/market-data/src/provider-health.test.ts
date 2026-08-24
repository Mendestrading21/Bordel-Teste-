import { ASSET_TYPES } from "@portfolio-lab/domain";
import { describe, expect, it } from "vitest";

import type { MarketDataProvider, ProviderCapabilities } from "./contract.js";
import { marketDataHealth } from "./provider-health.js";

function stub(id: string, capabilities: Partial<ProviderCapabilities> = {}): MarketDataProvider {
  return {
    id,
    capabilities: () => ({
      assetTypes: ["STOCK"],
      searchByText: true,
      searchByIsin: false,
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
      throw new Error("non utilisé");
    },
    getHistory: async () => [],
  };
}

describe("marketDataHealth", () => {
  it("ne laisse échapper aucune valeur de clé", () => {
    // Le rapport doit pouvoir être journalisé ou affiché sans relecture champ
    // par champ. C'est sa raison d'être.
    const health = marketDataHealth([stub("eodhd")], [], {
      EODHD_ENABLED: "true",
      EODHD_MODE: "live",
      EODHD_API_KEY: "valeur-ultra-secrete",
      TWELVE_DATA_API_KEY: "autre-secret",
    });

    const serialised = JSON.stringify(health);
    expect(serialised).not.toContain("valeur-ultra-secrete");
    expect(serialised).not.toContain("autre-secret");
    expect(health.providers.find((p) => p.providerId === "eodhd")?.apiKeyPresent).toBe(true);
  });

  it("distingue « activé dans la configuration » de « adaptateur réellement monté »", () => {
    /*
     * La confusion la plus coûteuse : une case cochée dans un `.env` donne
     * l'illusion d'une couverture alors qu'aucun code n'existe derrière.
     */
    const health = marketDataHealth([], [], { MASSIVE_ENABLED: "true", MASSIVE_MODE: "live" });
    const massive = health.providers.find((provider) => provider.providerId === "massive");

    expect(massive?.enabled).toBe(true);
    expect(massive?.adapterInstantiated).toBe(false);
    expect(massive?.assetTypes).toEqual([]);
  });

  it("rapporte un fournisseur monté hors configuration", () => {
    // Le fournisseur simulé du mode développement n'est pas dans `.env` ; ne
    // pas le montrer ferait mentir le rapport par omission.
    const health = marketDataHealth([stub("mock")], [], {});
    const mock = health.providers.find((provider) => provider.providerId === "mock");

    expect(mock?.adapterInstantiated).toBe(true);
    expect(mock?.assetTypes).toEqual(["STOCK"]);
  });

  it("nomme les classes d'actifs qu'aucun fournisseur ne couvre", () => {
    const health = marketDataHealth([stub("equities", { assetTypes: ["STOCK", "ETF"] })], [], {});

    expect(health.uncovered).toContain("BOND");
    expect(health.uncovered).toContain("OPTION");
    expect(health.uncovered).not.toContain("STOCK");
    expect(health.uncovered).not.toContain("ETF");
  });

  it("couvre toute la taxonomie dans son tableau de couverture", () => {
    // Garde-fou : un type ajouté à `ASSET_TYPES` sans passer par ici
    // disparaîtrait silencieusement du rapport.
    const health = marketDataHealth([stub("equities")], [], {});
    expect(health.coverage.map((entry) => entry.assetType)).toEqual([...ASSET_TYPES]);
  });

  it("dit quels fournisseurs couvrent une classe donnée", () => {
    const health = marketDataHealth(
      [stub("a", { assetTypes: ["CRYPTO"] }), stub("b", { assetTypes: ["CRYPTO", "FX"] })],
      [],
      {},
    );

    expect(health.coverage.find((e) => e.assetType === "CRYPTO")?.coveredBy).toEqual(["a", "b"]);
    expect(health.coverage.find((e) => e.assetType === "FX")?.coveredBy).toEqual(["b"]);
  });

  it("reprend les problèmes de configuration signalés", () => {
    const health = marketDataHealth([], ["eodhd: activé sans clé API configurée"], {});
    expect(health.issues).toEqual(["eodhd: activé sans clé API configurée"]);
  });

  it("reste en mock par défaut", () => {
    expect(marketDataHealth([], [], {}).marketDataMode).toBe("mock");
  });
});
