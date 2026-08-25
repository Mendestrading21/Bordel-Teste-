import { describe, expect, it } from "vitest";

import { toDecimalString, type CurrencyCode } from "@portfolio-lab/domain";

import {
  ProviderError,
  type FxQuote,
  type MarketDataProvider,
  type ProviderCapabilities,
} from "./contract.js";
import { refreshFxRates } from "./fx-refresh.js";
import { ProviderRouter } from "./provider-router.js";

const CAPABILITIES: ProviderCapabilities = {
  assetTypes: ["STOCK"],
  searchByText: false,
  searchByIsin: false,
  optionChains: false,
  fx: true,
  history: false,
  streaming: false,
  bestFreshness: "DELAYED",
  delayMinutes: null,
};

function fxProvider(
  id: string,
  rates: Readonly<Record<string, string>>,
  calls: string[] = [],
): MarketDataProvider {
  return {
    id,
    capabilities: () => CAPABILITIES,
    search: () => Promise.resolve([]),
    resolve: () => Promise.resolve(null),
    getSnapshot: () => {
      throw new ProviderError("UNSUPPORTED", id, "pas de cours");
    },
    getHistory: () => Promise.resolve([]),
    getFxRate: (base: CurrencyCode, quote: CurrencyCode): Promise<FxQuote> => {
      calls.push(`${base}/${quote}`);
      const rate = rates[`${base}/${quote}`];
      if (rate === undefined) {
        throw new ProviderError("NOT_FOUND", id, `pas de taux ${base}/${quote}`);
      }
      return Promise.resolve({
        base,
        quote,
        rate: toDecimalString(rate),
        provider: id,
        asOf: "2026-08-25T06:00:00.000Z",
        freshness: "DELAYED",
      });
    },
  };
}

/** Fournisseur sans FX : le routeur doit l'écarter avant tout appel. */
function noFxProvider(id: string): MarketDataProvider {
  return {
    id,
    capabilities: () => ({ ...CAPABILITIES, fx: false }),
    search: () => Promise.resolve([]),
    resolve: () => Promise.resolve(null),
    getSnapshot: () => {
      throw new ProviderError("UNSUPPORTED", id, "pas de cours");
    },
    getHistory: () => Promise.resolve([]),
  };
}

describe("refreshFxRates", () => {
  it("relève un taux par devise distincte", async () => {
    const calls: string[] = [];
    const router = new ProviderRouter([
      fxProvider("p", { "USD/CHF": "0.8037", "EUR/CHF": "0.9412" }, calls),
    ]);

    const report = await refreshFxRates(router, ["USD", "EUR", "USD", "USD"], "CHF");

    expect(report.resolved).toBe(2);
    // Une seule requête pour USD, malgré trois occurrences : sur un plan
    // gratuit compté en dizaines d'appels par minute, la différence compte.
    expect(calls).toEqual(["USD/CHF", "EUR/CHF"]);
  });

  it("n'interroge personne pour une conversion identité", async () => {
    const calls: string[] = [];
    const router = new ProviderRouter([fxProvider("p", {}, calls)]);

    const report = await refreshFxRates(router, ["CHF"], "CHF");

    const [outcome] = report.outcomes;
    expect(outcome?.kind).toBe("RESOLVED");
    if (outcome?.kind !== "RESOLVED") throw new Error("taux attendu");
    expect(outcome.fx.rate).toBe("1");
    expect(calls).toEqual([]);
    /*
     * `MANUAL` et non `LIVE` : personne n'a coté ce taux. Le déclarer temps
     * réel serait la promotion de fraîcheur que le produit interdit — et
     * l'adaptateur EODHD répond déjà `MANUAL` au même cas.
     */
    expect(outcome.fx.freshness).toBe("MANUAL");
  });

  /*
   * La règle qui distingue le FX du reste : un taux manquant ne se remplace
   * pas. Ni par 1 — qui vaudrait « le dollar égale le franc » —, ni par un taux
   * plus ancien présenté comme courant. Il fausserait toutes les lignes de
   * cette devise et le total avec elles.
   */
  it("déclare un taux manquant au lieu de retomber sur 1", async () => {
    const router = new ProviderRouter([fxProvider("p", { "USD/CHF": "0.8037" })]);

    const report = await refreshFxRates(router, ["USD", "GBP"], "CHF");

    expect(report.resolved).toBe(1);
    expect(report.missing).toBe(1);

    const missing = report.outcomes.find((outcome) => outcome.kind === "MISSING");
    expect(missing).toBeDefined();
    if (missing?.kind !== "MISSING") throw new Error("absence attendue");
    expect(missing.base).toBe("GBP");
    expect(missing.reason).toMatch(/^Cours indisponible/u);

    // Aucun `RESOLVED` fabriqué pour GBP.
    const resolvedBases = report.outcomes
      .filter((outcome) => outcome.kind === "RESOLVED")
      .map((outcome) => outcome.base);
    expect(resolvedBases).toEqual(["USD"]);
  });

  it("bascule sur le fournisseur suivant quand le premier ne sait pas faire de FX", async () => {
    const calls: string[] = [];
    const router = new ProviderRouter([
      noFxProvider("sans-fx"),
      fxProvider("avec-fx", { "USD/CHF": "0.8037" }, calls),
    ]);

    const report = await refreshFxRates(router, ["USD"], "CHF");

    expect(report.resolved).toBe(1);
    expect(calls).toEqual(["USD/CHF"]);
  });

  it("n'invente aucun taux quand aucun fournisseur n'en sert", async () => {
    const router = new ProviderRouter([noFxProvider("sans-fx")]);

    const report = await refreshFxRates(router, ["USD", "EUR"], "CHF");

    expect(report.resolved).toBe(0);
    expect(report.missing).toBe(2);
  });

  it("conserve la fraîcheur annoncée sans la promouvoir", async () => {
    const router = new ProviderRouter([fxProvider("p", { "USD/CHF": "0.8037" })]);

    const report = await refreshFxRates(router, ["USD"], "CHF");
    const [outcome] = report.outcomes;
    if (outcome?.kind !== "RESOLVED") throw new Error("taux attendu");
    expect(outcome.fx.freshness).toBe("DELAYED");
  });
});
