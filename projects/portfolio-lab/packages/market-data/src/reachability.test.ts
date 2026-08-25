import { describe, expect, it } from "vitest";

import type { MarketDataProvider, ProviderCapabilities } from "./contract.js";
import { createConfiguredProviders } from "./provider-factory.js";
import { PROVIDER_REQUIREMENTS, ProviderRouter, type ProviderRequirement } from "./provider-router.js";
import { readLiveProviderConfig, validateLiveProviderConfig } from "./live-provider-config.js";
import { createMockProvider } from "./mock-provider.js";
import { CANDIDATE_PROVIDERS } from "./candidates.js";

/**
 * Garde contre la panne silencieuse.
 *
 * Cinq défauts de la même famille ont été trouvés dans ce paquet, tous
 * invisibles à la compilation et à l'exécution :
 *
 * 1. `finnhub` avait un adaptateur que la fabrique n'instanciait pas ;
 * 2. `alphavantage` et `factset` étaient configurables sans adaptateur ;
 * 3. le besoin `fx` était routable sans méthode `fxRate()` ;
 * 4. le besoin `optionChain` l'était aussi, sans méthode ni sur le routeur ni
 *    sur le contrat ;
 * 5. Massive annonçait `optionChains: true` sans rien pouvoir servir.
 *
 * Aucun ne provoquait d'erreur : la configuration paraissait correcte, l'écran
 * restait muet, et rien nulle part ne reliait les deux. Cette suite existe pour
 * qu'un sixième soit impossible à commettre en silence.
 */

/** Point d'entrée attendu du routeur pour chaque besoin. */
const ROUTER_ENTRY_POINT: Readonly<Record<ProviderRequirement, keyof ProviderRouter>> = {
  search: "search",
  resolve: "resolve",
  snapshot: "snapshot",
  history: "history",
  stream: "subscribe",
  optionChain: "optionChain",
  fx: "fxRate",
};

/**
 * Capacités facultatives et méthode qui doit les accompagner.
 *
 * Une capacité annoncée sans méthode fait choisir le fournisseur par le
 * routeur, puis échouer à chaque appel : une lacune de couverture déguisée en
 * panne intermittente.
 */
const OPTIONAL_METHODS: readonly {
  capability: keyof ProviderCapabilities;
  method: keyof MarketDataProvider;
}[] = [
  { capability: "fx", method: "getFxRate" },
  { capability: "streaming", method: "subscribe" },
  { capability: "optionChains", method: "getOptionChain" },
];

describe("atteignabilité des besoins du routeur", () => {
  it("chaque besoin possède un point d'entrée", () => {
    const router = new ProviderRouter([]);

    for (const requirement of PROVIDER_REQUIREMENTS) {
      const method = ROUTER_ENTRY_POINT[requirement];
      expect(
        typeof router[method],
        `le besoin « ${requirement} » n'a aucune méthode « ${method} » sur le routeur : ` +
          "un fournisseur peut être sélectionné pour lui, mais personne ne peut l'appeler",
      ).toBe("function");
    }
  });

  it("la table des points d'entrée couvre exactement les besoins déclarés", () => {
    // Sans cette égalité, ajouter un besoin sans l'inscrire ici le rendrait
    // invisible au test précédent — le trou se déplacerait au lieu de se fermer.
    expect(Object.keys(ROUTER_ENTRY_POINT).sort()).toEqual([...PROVIDER_REQUIREMENTS].sort());
  });
});

describe("cohérence entre capacités annoncées et méthodes réelles", () => {
  /**
   * Tous les fournisseurs instanciables, quelle que soit leur configuration.
   *
   * Le mock est inclus : il sert le mode démonstration et n'a aucune raison
   * d'échapper à la règle.
   */
  const providers: readonly MarketDataProvider[] = [
    createMockProvider({ instruments: [] }),
    ...createConfiguredProviders({
      MARKET_DATA_MODE: "live",
      MARKET_DATA_ENABLED_PROVIDERS: "eodhd,twelvedata,massive,coingecko,finnhub",
      EODHD_ENABLED: "true",
      EODHD_MODE: "live",
      EODHD_API_KEY: "clé-de-test",
      TWELVE_DATA_ENABLED: "true",
      TWELVE_DATA_MODE: "live",
      TWELVE_DATA_API_KEY: "clé-de-test",
      MASSIVE_ENABLED: "true",
      MASSIVE_MODE: "live",
      MASSIVE_API_KEY: "clé-de-test",
      COINGECKO_ENABLED: "true",
      COINGECKO_MODE: "demo",
      FINNHUB_ENABLED: "true",
      FINNHUB_API_KEY: "clé-de-test",
    }).providers,
  ];

  it("instancie bien tous les adaptateurs existants", () => {
    expect(providers.map((provider) => provider.id).sort()).toEqual([
      "coingecko",
      "eodhd",
      "finnhub",
      "massive",
      "mock",
      "twelvedata",
    ]);
  });

  for (const { capability, method } of OPTIONAL_METHODS) {
    it(`« ${capability} » n'est annoncé que par les fournisseurs qui ont « ${method} »`, () => {
      for (const provider of providers) {
        const declared = provider.capabilities()[capability];
        const implemented = provider[method] !== undefined;

        if (declared === true) {
          expect(
            implemented,
            `${provider.id} annonce ${capability} sans implémenter ${method} : ` +
              "le routeur le choisira, puis chaque appel échouera",
          ).toBe(true);
        }
      }
    });

    it(`« ${method} » n'est implémenté que par les fournisseurs qui annoncent « ${capability} »`, () => {
      for (const provider of providers) {
        if (provider[method] === undefined) continue;
        expect(
          provider.capabilities()[capability],
          `${provider.id} implémente ${method} sans annoncer ${capability} : ` +
            "le routeur l'écartera, et la fonction restera inatteignable",
        ).toBe(true);
      }
    });
  }
});

describe("cohérence entre configuration et adaptateurs", () => {
  const CONFIGURABLE = Object.keys(readLiveProviderConfig({}).providers);

  it("chaque fournisseur configurable est soit instanciable, soit signalé", () => {
    for (const providerId of CONFIGURABLE) {
      const env: Record<string, string> = {
        MARKET_DATA_MODE: "live",
        MARKET_DATA_ENABLED_PROVIDERS: providerId,
        [`${providerId.toUpperCase().replace("TWELVEDATA", "TWELVE_DATA")}_ENABLED`]: "true",
        [`${providerId.toUpperCase().replace("TWELVEDATA", "TWELVE_DATA")}_MODE`]: "live",
        [`${providerId.toUpperCase().replace("TWELVEDATA", "TWELVE_DATA")}_API_KEY`]: "clé",
      };

      const built = createConfiguredProviders(env).providers.length > 0;
      const flagged = validateLiveProviderConfig(readLiveProviderConfig(env)).length > 0;

      /*
       * L'un ou l'autre, jamais ni l'un ni l'autre. Un fournisseur qui ne
       * s'instancie pas **et** ne produit aucun signalement est exactement le
       * piège qu'a été Finnhub : une clé renseignée, aucune erreur, aucun cours.
       */
      expect(
        built || flagged,
        `${providerId} : activé avec une clé, il ne s'instancie pas et rien ne le signale`,
      ).toBe(true);
    }
  });

  it("les candidats documentés recouvrent les fournisseurs configurables", () => {
    // `candidates.ts` alimente l'écran Réglages. Un fournisseur configurable
    // absent de cette liste serait invisible pour l'utilisateur, qui ne pourrait
    // pas comprendre pourquoi rien n'arrive.
    const documented = new Set(CANDIDATE_PROVIDERS.map((candidate) => candidate.id));
    const undocumented = CONFIGURABLE.filter((providerId) => !documented.has(providerId));

    expect(undocumented, "fournisseurs configurables absents de l'écran Réglages").toEqual([]);
  });
});
