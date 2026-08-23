import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  allocate,
  FIXTURE_PROVIDER,
  FixtureError,
  loadMarkFixture,
  valuePortfolio,
  type PositionInput,
} from "@portfolio-lab/portfolio-engine";
import { toDecimalString, type DecimalString } from "@portfolio-lab/domain";

const d = (value: string): DecimalString => toDecimalString(value);

const rawFixture: unknown = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/demo-marks.json", import.meta.url)), "utf8"),
);

/**
 * Valorisation du portefeuille de démonstration.
 *
 * C'est le critère d'acceptation du Lot 03 : « l'utilisateur peut créer
 * plusieurs comptes et obtenir un total CHF reproductible avec fixtures ». Les
 * positions reprennent exactement celles de `supabase/seed.sql`.
 */
const DEMO_POSITIONS: PositionInput[] = [
  {
    positionId: "d0000000-0000-4000-8000-00000000b001",
    accountId: "d0000000-0000-4000-8000-00000000a001",
    instrumentId: "d0000000-0000-4000-8000-000000000001",
    quantity: d("25"),
    averageCost: d("142.500000000000"),
    costCurrency: "CHF",
    multiplier: d("1"),
  },
  {
    positionId: "d0000000-0000-4000-8000-00000000b002",
    accountId: "d0000000-0000-4000-8000-00000000a001",
    instrumentId: "d0000000-0000-4000-8000-000000000002",
    quantity: d("40"),
    averageCost: d("88.250000000000"),
    costCurrency: "USD",
    multiplier: d("1"),
  },
  {
    positionId: "d0000000-0000-4000-8000-00000000b003",
    accountId: "d0000000-0000-4000-8000-00000000a001",
    instrumentId: "d0000000-0000-4000-8000-000000000003",
    quantity: d("12"),
    averageCost: d("310.000000000000"),
    costCurrency: "USD",
    multiplier: d("1"),
  },
  {
    positionId: "d0000000-0000-4000-8000-00000000b004",
    accountId: "d0000000-0000-4000-8000-00000000a003",
    instrumentId: "d0000000-0000-4000-8000-000000000004",
    quantity: d("150.750000000000"),
    averageCost: d("102.400000000000"),
    costCurrency: "CHF",
    multiplier: d("1"),
  },
  {
    positionId: "d0000000-0000-4000-8000-00000000b005",
    accountId: "d0000000-0000-4000-8000-00000000a002",
    instrumentId: "d0000000-0000-4000-8000-000000000006",
    quantity: d("2"),
    averageCost: d("4.750000000000"),
    costCurrency: "USD",
    // Multiplicateur lu sur option_contracts, jamais supposé.
    multiplier: d("100"),
  },
  {
    positionId: "d0000000-0000-4000-8000-00000000b006",
    accountId: "d0000000-0000-4000-8000-00000000a001",
    instrumentId: "d0000000-0000-4000-8000-000000000005",
    quantity: d("5000"),
    averageCost: d("1.000000000000"),
    costCurrency: "CHF",
    multiplier: d("1"),
  },
];

describe("loadMarkFixture", () => {
  it("charge les six cours de démonstration", () => {
    const fixture = loadMarkFixture(rawFixture);
    expect(fixture.marks.size).toBe(6);
    expect(fixture.asOf).toBe("2026-08-22T16:00:00.000Z");
  });

  it("déclare fixture comme fournisseur, visible dans l'interface", () => {
    const fixture = loadMarkFixture(rawFixture);
    for (const mark of fixture.marks.values()) {
      expect(mark.provider).toBe(FIXTURE_PROVIDER);
    }
  });

  it("ne présente aucune donnée fictive comme LIVE ou DELAYED", () => {
    // C'est l'invariant central : une valeur inventée ne doit jamais pouvoir
    // s'afficher comme un cours de marché.
    const fixture = loadMarkFixture(rawFixture);
    for (const [id, mark] of fixture.marks) {
      expect(["MANUAL", "NAV"], `${id} annonce ${mark.freshness}`).toContain(mark.freshness);
    }
  });

  it("laisse le fonds sans clôture précédente", () => {
    const fixture = loadMarkFixture(rawFixture);
    const fund = fixture.marks.get("d0000000-0000-4000-8000-000000000004");
    expect(fund?.priceType).toBe("NAV");
    // Un fonds n'a pas de clôture intraday.
    expect(fund?.previousClose).toBeUndefined();
  });

  it("rejette bruyamment une fixture mal formée", () => {
    expect(() => loadMarkFixture({ marks: [] })).toThrow(FixtureError);
    expect(() =>
      loadMarkFixture({
        asOf: "2026-08-22T16:00:00.000Z",
        marks: [
          {
            instrumentId: "pas-un-uuid",
            label: "x",
            price: "1",
            currency: "CHF",
            priceType: "MANUAL",
            freshness: "MANUAL",
          },
        ],
        fxRates: [],
      }),
    ).toThrow(FixtureError);
  });

  it("rejette une décimale envoyée sous forme de nombre", () => {
    // Un nombre JSON serait déjà passé par un flottant avant d'arriver ici.
    expect(() =>
      loadMarkFixture({
        asOf: "2026-08-22T16:00:00.000Z",
        marks: [
          {
            instrumentId: "d0000000-0000-4000-8000-000000000001",
            label: "x",
            price: 1.1,
            currency: "CHF",
            priceType: "MANUAL",
            freshness: "MANUAL",
          },
        ],
        fxRates: [],
      }),
    ).toThrow(FixtureError);
  });

  it("refuse deux cours pour le même instrument", () => {
    const duplicated = JSON.parse(JSON.stringify(rawFixture)) as {
      marks: unknown[];
    };
    duplicated.marks.push(duplicated.marks[0]);
    expect(() => loadMarkFixture(duplicated)).toThrow(/double/);
  });
});

describe("valorisation du portefeuille de démonstration", () => {
  const fixture = loadMarkFixture(rawFixture);
  const result = valuePortfolio(DEMO_POSITIONS, fixture.marks, fixture.fx, "CHF");

  it("valorise les six positions sans lacune", () => {
    expect(result.positions).toHaveLength(6);
    expect(result.unvalued).toEqual([]);
  });

  it("produit un total CHF exact et vérifiable à la main", () => {
    /*
     * Détail du calcul, entièrement reproductible :
     *   action CH : 25 × 148.60                    =  3 715.00 CHF
     *   action US : 40 × 91.40 = 3 656 USD × 0.89  =  3 253.84 CHF
     *   ETF US    : 12 × 324.75 = 3 897 USD × 0.89 =  3 468.33 CHF
     *   fonds     : 150.75 × 104.83                = 15 803.1225 CHF
     *   option    : 2 × 100 × 6.20 = 1 240 USD × 0.89 = 1 103.60 CHF
     *   cash      : 5 000 × 1                      =  5 000.00 CHF
     *                                              -------------------
     *                                                32 343.8925 CHF
     */
    expect(result.totalMarketValueBase).toBe("32343.8925");
  });

  it("donne le même total à chaque exécution", () => {
    const second = valuePortfolio(DEMO_POSITIONS, fixture.marks, fixture.fx, "CHF");
    expect(second.totalMarketValueBase).toBe(result.totalMarketValueBase);
    expect(second.totalCostBasisBase).toBe(result.totalCostBasisBase);
    expect(second.totalUnrealizedPnlBase).toBe(result.totalUnrealizedPnlBase);
  });

  it("réconcilie le P&L latent avec valeur moins coût", () => {
    const expected = Number(result.totalMarketValueBase) - Number(result.totalCostBasisBase);
    expect(Number(result.totalUnrealizedPnlBase)).toBeCloseTo(expected, 8);
  });

  it("signale que le portefeuille n'est pas en direct", () => {
    // La position la plus dégradée est saisie manuellement : le total ne peut
    // pas s'annoncer plus frais qu'elle.
    expect(result.worstFreshness).toBe("MANUAL");
  });

  it("applique le multiplicateur 100 à l'option et pas aux actions", () => {
    const option = result.positions.find((p) => p.positionId.endsWith("b005"));
    expect(option?.marketValueNative).toBe("1240");
    const action = result.positions.find((p) => p.positionId.endsWith("b001"));
    expect(action?.marketValueNative).toBe("3715");
  });

  it("répartit l'exposition par compte, parts sommant à 1", () => {
    const slices = allocate(
      result.positions.map((p) => ({ key: p.accountId, marketValueBase: p.marketValueBase })),
    );
    expect(slices).toHaveLength(3);
    const total = slices.reduce((sum, slice) => sum + Number(slice.grossPct), 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("n'annonce aucune variation du jour, le fonds n'ayant pas de clôture", () => {
    expect(result.totalDayPnlBase).toBeNull();
  });
});
