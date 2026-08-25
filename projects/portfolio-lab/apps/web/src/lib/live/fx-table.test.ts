import { describe, expect, it } from "vitest";

import { fxKey } from "@portfolio-lab/portfolio-engine";
import type { FxRefreshReport } from "@portfolio-lab/market-data";

import { fxTableFromReport } from "./fx-table";

const resolved = (base: string, rate: string, freshness = "DELAYED") =>
  ({
    kind: "RESOLVED",
    base,
    fx: {
      base,
      quote: "CHF",
      rate,
      provider: "eodhd",
      asOf: "2026-08-25T06:00:00.000Z",
      freshness,
    },
  }) as FxRefreshReport["outcomes"][number];

const missing = (base: string) =>
  ({
    kind: "MISSING",
    base,
    quote: "CHF",
    reason: "Cours indisponible : fournisseur injoignable.",
  }) as FxRefreshReport["outcomes"][number];

const report = (outcomes: FxRefreshReport["outcomes"]): FxRefreshReport => ({
  outcomes,
  resolved: outcomes.filter((outcome) => outcome.kind === "RESOLVED").length,
  missing: outcomes.filter((outcome) => outcome.kind === "MISSING").length,
});

describe("fxTableFromReport", () => {
  it("retient les taux obtenus, avec leur date et leur source", () => {
    const table = fxTableFromReport(report([resolved("USD", "0.8037")]));

    const rate = table.get(fxKey("USD", "CHF"));
    expect(rate?.rate).toBe("0.8037");
    expect(rate?.provider).toBe("eodhd");
    expect(rate?.asOf).toBe("2026-08-25T06:00:00.000Z");
  });

  /*
   * La règle centrale de ce module. Une devise sans taux doit être **absente**
   * de la table : le moteur rendra alors ses positions non valorisées, avec
   * leur motif. Y placer 1, ou un taux de fixture, produirait un total
   * plausible et faux que rien à l'écran ne distinguerait d'un total correct.
   */
  it("omet une devise sans taux au lieu d'en fabriquer un", () => {
    const table = fxTableFromReport(report([resolved("USD", "0.8037"), missing("GBP")]));

    expect(table.has(fxKey("USD", "CHF"))).toBe(true);
    expect(table.has(fxKey("GBP", "CHF"))).toBe(false);
    expect(table.size).toBe(1);
  });

  it("rend une table vide quand aucun taux n'a été obtenu", () => {
    const table = fxTableFromReport(report([missing("USD"), missing("EUR")]));
    expect(table.size).toBe(0);
  });

  it("ne promeut pas la fraîcheur du taux", () => {
    const table = fxTableFromReport(report([resolved("USD", "0.8037", "EOD")]));
    expect(table.get(fxKey("USD", "CHF"))?.freshness).toBe("EOD");
  });
});
