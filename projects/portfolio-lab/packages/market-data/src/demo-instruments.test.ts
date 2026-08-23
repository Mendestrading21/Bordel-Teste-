import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DEMO_FX_RATES, DEMO_INSTRUMENTS } from "./demo-instruments.js";
import { createMockProvider } from "./mock-provider.js";

/**
 * Le fournisseur simulé doit réellement connaître les instruments du seed.
 *
 * Régression réelle : la passerelle instanciait le fournisseur simulé avec une
 * liste **vide**. Elle démarrait, annonçait `liveChannel: ready`, acceptait les
 * connexions — et ne résolvait jamais aucun symbole. Le défaut n'était visible
 * qu'en interrogeant le canal avec un vrai client.
 */
const seed = readFileSync(
  fileURLToPath(new URL("../../../supabase/seed.sql", import.meta.url)),
  "utf8",
);

describe("DEMO_INSTRUMENTS", () => {
  it("n'est jamais vide", () => {
    expect(DEMO_INSTRUMENTS.length).toBeGreaterThan(0);
  });

  it("couvre les six instruments du seed de démonstration", () => {
    // Le seed insère six instruments ; en servir moins laisserait des positions
    // sans cours.
    expect(DEMO_INSTRUMENTS).toHaveLength(6);
  });

  it("couvre toutes les classes d'actifs du seed", () => {
    const types = new Set(DEMO_INSTRUMENTS.map((entry) => entry.assetType));
    expect(types).toEqual(new Set(["STOCK", "ETF", "MUTUAL_FUND", "CASH", "OPTION"]));
  });

  it("n'utilise que des ISIN fictifs de code pays XX", () => {
    for (const instrument of DEMO_INSTRUMENTS) {
      if (instrument.isin !== null) {
        expect(instrument.isin.startsWith("XX"), instrument.isin).toBe(true);
      }
    }
  });

  it("reprend les ISIN exactement présents dans le seed", () => {
    for (const instrument of DEMO_INSTRUMENTS) {
      if (instrument.isin !== null) {
        expect(seed, `${instrument.isin} absent du seed`).toContain(instrument.isin);
      }
    }
  });

  it("signale chaque instrument comme fictif dans son nom", () => {
    for (const instrument of DEMO_INSTRUMENTS) {
      expect(
        /démo|fictif|liquidités/i.test(instrument.name),
        `${instrument.name} ne se signale pas comme donnée de démonstration`,
      ).toBe(true);
    }
  });

  it("porte un multiplicateur explicite sur le contrat d'option", () => {
    const option = DEMO_INSTRUMENTS.find((entry) => entry.assetType === "OPTION");
    expect(option?.optionContract?.multiplier).toBe("100");
    expect(option?.optionContract?.osiSymbol).toBeTruthy();
  });

  it("permet au fournisseur simulé de résoudre et valoriser chaque instrument", async () => {
    const provider = createMockProvider({
      instruments: DEMO_INSTRUMENTS,
      fxRates: DEMO_FX_RATES,
      now: () => new Date("2026-08-23T00:00:00.000Z"),
    });

    for (const instrument of DEMO_INSTRUMENTS) {
      const resolved = await provider.resolve({
        kind: "PROVIDER_SYMBOL",
        provider: provider.id,
        symbol: instrument.symbol,
      });
      expect(resolved, `${instrument.symbol} non résolu`).not.toBeNull();

      if (resolved !== null) {
        const quote = await provider.getSnapshot(resolved);
        expect(Number(quote.price), `${instrument.symbol} sans prix`).toBeGreaterThan(0);
        // Aucune donnée simulée ne peut se présenter comme un cours de marché.
        expect(["MANUAL", "NAV"]).toContain(quote.freshness);
      }
    }
  });

  it("fournit les taux de change des devises du seed", async () => {
    const provider = createMockProvider({
      instruments: DEMO_INSTRUMENTS,
      fxRates: DEMO_FX_RATES,
    });
    expect((await provider.getFxRate?.("USD", "CHF"))?.rate).toBe("0.8900");
    expect((await provider.getFxRate?.("EUR", "CHF"))?.rate).toBe("0.9400");
  });
});
