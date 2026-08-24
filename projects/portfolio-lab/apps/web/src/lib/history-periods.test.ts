import { describe, expect, it } from "vitest";

import { toDecimalString, type CurrencyCode } from "@portfolio-lab/domain";
import type { WealthPoint } from "@portfolio-lab/portfolio-engine";

import { historyPeriods } from "./history-periods";

const VERSION = "1.0.0";

function point(date: string, value: string, overrides: Partial<WealthPoint> = {}): WealthPoint {
  return {
    date,
    marketValueBase: toDecimalString(value),
    costBasisBase: toDecimalString("1000"),
    unrealizedPnlBase: toDecimalString("0"),
    baseCurrency: "CHF" as CurrencyCode,
    calculationVersion: VERSION,
    ...overrides,
  };
}

const TODAY = "2026-08-24";

describe("historyPeriods", () => {
  it("ne propose aucune fenêtre sous deux points", () => {
    expect(historyPeriods([point("2026-08-20", "1000")], TODAY)).toEqual([]);
    expect(historyPeriods([], TODAY)).toEqual([]);
  });

  it("ne trace rien lorsque la série mêle deux devises de consolidation", () => {
    const series = [
      point("2026-08-01", "1000"),
      point("2026-08-20", "1100", { baseCurrency: "EUR" as CurrencyCode }),
    ];
    // Superposer ces points dessinerait une marche qui ne correspond à aucun
    // mouvement de patrimoine.
    expect(historyPeriods(series, TODAY)).toEqual([]);
  });

  it("ne trace rien lorsque la série mêle deux versions du moteur", () => {
    const series = [
      point("2026-08-01", "1000"),
      point("2026-08-20", "1100", { calculationVersion: "2.0.0" }),
    ];
    expect(historyPeriods(series, TODAY)).toEqual([]);
  });

  it("écarte les fenêtres qui ne contiennent pas deux points enregistrés", () => {
    // Deux points espacés de plus de trois mois : « 1 mois » et « 3 mois » n'en
    // contiennent qu'un seul et ne doivent pas être proposés.
    const series = [point("2026-01-10", "1000"), point("2026-08-20", "1500")];
    const keys = historyPeriods(series, TODAY).map((period) => period.key);
    expect(keys).not.toContain("1M");
    expect(keys).not.toContain("3M");
    expect(keys).toContain("ALL");
  });

  it("fusionne les fenêtres qui contiennent exactement la même courbe", () => {
    /*
     * Tout l'historique tient dans le dernier mois : proposer « 1 mois »,
     * « 3 mois », « 6 mois », « 1 an » et « Tout » donnerait cinq onglets qui
     * ne changent jamais rien à l'écran.
     */
    const series = [
      point("2026-08-10", "1000"),
      point("2026-08-15", "1100"),
      point("2026-08-20", "1200"),
    ];
    const periods = historyPeriods(series, TODAY);
    expect(periods).toHaveLength(1);
    expect(periods[0]?.label).toBe("Tout");
    expect(periods[0]?.points).toHaveLength(3);
  });

  it("distingue les fenêtres dès qu'elles diffèrent réellement", () => {
    const series = [
      point("2025-09-01", "800"),
      point("2026-03-01", "900"),
      point("2026-08-10", "1000"),
      point("2026-08-20", "1200"),
    ];
    const periods = historyPeriods(series, TODAY);

    /*
     * Les deux derniers points tiennent aussi bien dans un mois que dans trois :
     * une seule fenêtre est proposée pour les deux, sous le libellé le plus
     * étroit. Un onglet « 3 mois » au-dessus d'une courbe de vingt jours se lit
     * comme un écran cassé.
     */
    expect(periods.map((period) => [period.key, period.points.length])).toEqual([
      ["1M", 2],
      ["6M", 3],
      ["ALL", 4],
    ]);
  });

  it("calcule la variation sur les seuls points de la fenêtre", () => {
    const series = [
      point("2025-09-01", "800"),
      point("2026-08-10", "1000"),
      point("2026-08-20", "1200"),
    ];
    const periods = historyPeriods(series, TODAY);
    const recent = periods[0];

    // 1000 → 1200 sur la fenêtre courte, et non 800 → 1200 depuis le début.
    expect(recent?.change.absolute).toBe("200");
    expect(recent?.bounds.min).toBe("1000");
    expect(periods[periods.length - 1]?.change.absolute).toBe("400");
  });

  it("refuse une date d'ancrage invalide plutôt que de tout renvoyer", () => {
    const series = [point("2026-08-10", "1000"), point("2026-08-20", "1200")];
    expect(historyPeriods(series, "pas-une-date")).toEqual([]);
  });
});
