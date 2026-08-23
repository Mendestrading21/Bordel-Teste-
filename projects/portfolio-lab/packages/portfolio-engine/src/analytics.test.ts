import { describe, expect, it } from "vitest";

import { toDecimalString, type CurrencyCode, type DecimalString } from "@portfolio-lab/domain";

import {
  canonicalComponents,
  civilDay,
  componentsFingerprint,
  dailyHistory,
  historyBounds,
  isComparableSeries,
  optionExposure,
  pnlContributions,
  portfolioReturn,
  reconcile,
  verifySnapshot,
  wealthChange,
  type OptionPositionInput,
  type SnapshotRecord,
  type WealthPoint,
} from "./analytics.js";
import {
  buildFxTable,
  CALCULATION_VERSION,
  valuePortfolio,
  type FxRate,
  type Mark,
  type PositionInput,
} from "./valuation.js";

const d = (value: string): DecimalString => toDecimalString(value);

const AS_OF = "2026-05-04T15:30:00.000Z";

function mark(overrides: Partial<Mark> = {}): Mark {
  return {
    price: d("100"),
    currency: "CHF",
    priceType: "LAST_TRADE",
    freshness: "LIVE",
    asOf: AS_OF,
    provider: "fixture",
    ...overrides,
  };
}

function position(overrides: Partial<PositionInput> = {}): PositionInput {
  return {
    positionId: "p1",
    accountId: "a1",
    instrumentId: "i1",
    quantity: d("10"),
    averageCost: d("90"),
    costCurrency: "CHF",
    multiplier: d("1"),
    ...overrides,
  };
}

function fxRate(from: CurrencyCode, to: CurrencyCode, rate: string): FxRate {
  return { from, to, rate: d(rate), asOf: AS_OF, provider: "fixture", freshness: "LIVE" };
}

const FX = buildFxTable([fxRate("USD", "CHF", "0.89"), fxRate("EUR", "CHF", "0.94")]);

/** Portefeuille de référence : un gagnant en CHF, un perdant en USD. */
function samplePortfolio() {
  const positions = [
    position({ positionId: "p1", instrumentId: "i1", quantity: d("10"), averageCost: d("90") }),
    position({
      positionId: "p2",
      instrumentId: "i2",
      accountId: "a2",
      quantity: d("5"),
      averageCost: d("300"),
      costCurrency: "USD",
    }),
  ];
  const marks = new Map<string, Mark>([
    ["i1", mark({ price: d("100") })],
    ["i2", mark({ price: d("250"), currency: "USD" })],
  ]);
  return valuePortfolio(positions, marks, FX, "CHF");
}

describe("portfolioReturn", () => {
  it("rapporte le P&L au capital investi, en décimal exact", () => {
    // 10 × (100 − 90) = 100 de P&L pour 900 investis.
    const valuation = valuePortfolio([position()], new Map([["i1", mark()]]), FX, "CHF");
    expect(portfolioReturn(valuation)).toBe("0.1111111111111111111111111111111111");
  });

  it("renvoie null plutôt que 0 % quand aucun capital n'est investi", () => {
    const valuation = valuePortfolio(
      [position({ averageCost: d("0") })],
      new Map([["i1", mark()]]),
      FX,
      "CHF",
    );
    expect(valuation.totalCostBasisBase).toBe("0");
    expect(portfolioReturn(valuation)).toBeNull();
  });

  it("ne s'inverse pas quand le capital investi est négatif", () => {
    // Position vendeuse : coût −900, valeur de marché −1 000 → perte de 100.
    const valuation = valuePortfolio(
      [position({ quantity: d("-10") })],
      new Map([["i1", mark()]]),
      FX,
      "CHF",
    );
    expect(valuation.totalUnrealizedPnlBase).toBe("-100");
    // Le rendement reste négatif : diviser par −900 l'aurait rendu positif.
    expect(portfolioReturn(valuation)?.startsWith("-")).toBe(true);
  });

  it("évite l'erreur de flottant que produirait un calcul en Number", () => {
    // 0.1 + 0.2 en flottant vaut 0.30000000000000004 ; le ratio ci-dessous
    // exhibe la même famille d'erreur si l'on passe par Number.
    const valuation = valuePortfolio(
      [position({ quantity: d("1"), averageCost: d("0.3") })],
      new Map([["i1", mark({ price: d("0.6") })]]),
      FX,
      "CHF",
    );
    expect(portfolioReturn(valuation)).toBe("1");
  });
});

describe("pnlContributions", () => {
  it("trie par valeur absolue : la plus grosse perte devance un petit gain", () => {
    const valuation = samplePortfolio();
    const contributions = pnlContributions(valuation);

    expect(contributions).toHaveLength(2);
    // p2 perd 5 × (250 − 300) × 0.89 = −222.5 ; p1 gagne 100.
    expect(contributions[0]?.positionId).toBe("p2");
    expect(contributions[1]?.positionId).toBe("p1");
  });

  it("somme des contributions égale exactement le P&L total", () => {
    const valuation = samplePortfolio();
    const sum = pnlContributions(valuation).reduce(
      (total, contribution) => total + Number(contribution.unrealizedPnlBase),
      0,
    );
    expect(sum).toBeCloseTo(Number(valuation.totalUnrealizedPnlBase), 9);
  });

  it("les parts somment à 1 quand le P&L total n'est pas nul", () => {
    const valuation = samplePortfolio();
    const shares = pnlContributions(valuation).map((contribution) => contribution.share);
    expect(shares.every((share) => share !== null)).toBe(true);

    const total = shares.reduce((sum, share) => sum + Number(share), 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it("renvoie null plutôt que 0 % quand les gains compensent exactement les pertes", () => {
    const positions = [
      position({ positionId: "p1", instrumentId: "i1", quantity: d("1"), averageCost: d("90") }),
      position({ positionId: "p2", instrumentId: "i2", quantity: d("1"), averageCost: d("110") }),
    ];
    const marks = new Map<string, Mark>([
      ["i1", mark({ price: d("100") })],
      ["i2", mark({ price: d("100") })],
    ]);
    const valuation = valuePortfolio(positions, marks, FX, "CHF");

    expect(valuation.totalUnrealizedPnlBase).toBe("0");
    // Chaque ligne a bougé de ±10 : afficher « 0 % de contribution » serait faux.
    for (const contribution of pnlContributions(valuation)) {
      expect(contribution.share).toBeNull();
      expect(Number(contribution.unrealizedPnlBase)).not.toBe(0);
    }
  });

  it("ignore les positions non valorisées plutôt que de les compter à zéro", () => {
    const positions = [
      position({ positionId: "p1" }),
      position({ positionId: "p9", instrumentId: "absent" }),
    ];
    const valuation = valuePortfolio(positions, new Map([["i1", mark()]]), FX, "CHF");

    expect(valuation.unvalued).toHaveLength(1);
    expect(pnlContributions(valuation).map((c) => c.positionId)).toEqual(["p1"]);
  });
});

describe("optionExposure", () => {
  const call = (overrides: Partial<OptionPositionInput> = {}): OptionPositionInput => ({
    positionId: "o1",
    underlyingId: "u1",
    quantity: d("2"),
    multiplier: d("100"),
    strike: d("200"),
    marketValueBase: d("1000"),
    fxRate: d("1"),
    ...overrides,
  });

  it("distingue valeur de marché et notionnel", () => {
    const [exposure] = optionExposure([call()]);

    expect(exposure?.marketValueBase).toBe("1000");
    // 2 × 100 × 200 = 40 000 : quarante fois la valeur de marché.
    expect(exposure?.notionalBase).toBe("40000");
  });

  it("agrège par sous-jacent et compte les contrats", () => {
    const exposures = optionExposure([
      call({ positionId: "o1", underlyingId: "u1" }),
      call({ positionId: "o2", underlyingId: "u1", strike: d("210") }),
      call({ positionId: "o3", underlyingId: "u2", strike: d("50") }),
    ]);

    expect(exposures).toHaveLength(2);
    const first = exposures[0];
    expect(first?.underlyingId).toBe("u1");
    expect(first?.contractCount).toBe(2);
    expect(first?.notionalBase).toBe("82000");
  });

  it("n'applique jamais un multiplicateur supposé : celui fourni est utilisé tel quel", () => {
    // Contrat ajusté après split — multiplicateur 112, pas 100.
    const [exposure] = optionExposure([call({ quantity: d("1"), multiplier: d("112") })]);
    expect(exposure?.notionalBase).toBe("22400");
  });

  it("convertit le notionnel dans la devise de consolidation", () => {
    const [exposure] = optionExposure([call({ quantity: d("1"), fxRate: d("0.89") })]);
    // 1 × 100 × 200 × 0.89
    expect(exposure?.notionalBase).toBe("17800");
  });

  it("trie par notionnel absolu, une vente courte n'étant pas reléguée en fin de liste", () => {
    const exposures = optionExposure([
      call({ underlyingId: "petit", quantity: d("1"), strike: d("10") }),
      call({ underlyingId: "vendu", quantity: d("-5"), strike: d("300") }),
    ]);
    expect(exposures[0]?.underlyingId).toBe("vendu");
    expect(exposures[0]?.notionalBase).toBe("-150000");
  });
});

describe("dailyHistory", () => {
  const snapshot = (snapshotAt: string, marketValue: string): SnapshotRecord => ({
    snapshotAt,
    marketValueBase: d(marketValue),
    costBasisBase: d("900"),
    unrealizedPnlBase: d("0"),
    baseCurrency: "CHF",
    calculationVersion: CALCULATION_VERSION,
  });

  it("retient le dernier snapshot de chaque journée", () => {
    const points = dailyHistory([
      snapshot("2026-05-04T09:00:00.000Z", "1000"),
      snapshot("2026-05-04T21:00:00.000Z", "1100"),
      snapshot("2026-05-05T09:00:00.000Z", "1200"),
    ]);

    expect(points).toHaveLength(2);
    // Le point du 4 mai porte la valeur de 21 h : la modification de la journée
    // est intégrée, celle du matin est périmée.
    expect(points[0]).toMatchObject({ date: "2026-05-04", marketValueBase: "1100" });
    expect(points[1]).toMatchObject({ date: "2026-05-05", marketValueBase: "1200" });
  });

  it("rend les points par date croissante quel que soit l'ordre d'entrée", () => {
    const points = dailyHistory([
      snapshot("2026-05-06T10:00:00.000Z", "3"),
      snapshot("2026-05-04T10:00:00.000Z", "1"),
      snapshot("2026-05-05T10:00:00.000Z", "2"),
    ]);
    expect(points.map((point) => point.date)).toEqual(["2026-05-04", "2026-05-05", "2026-05-06"]);
  });

  it("rattache un snapshot de fin de soirée au bon jour civil suisse", () => {
    // 22 h 30 UTC le 4 mai = 00 h 30 le 5 mai à Zurich (heure d'été).
    // Un découpage en UTC l'aurait rangé le 4, créant deux points ce jour-là
    // puis un trou le 5.
    const points = dailyHistory([snapshot("2026-05-04T22:30:00.000Z", "1000")]);
    expect(points[0]?.date).toBe("2026-05-05");
  });

  it("accepte un fuseau explicite", () => {
    expect(civilDay("2026-05-04T22:30:00.000Z", "UTC")).toBe("2026-05-04");
    expect(civilDay("2026-05-04T22:30:00.000Z", "Europe/Zurich")).toBe("2026-05-05");
  });

  it("refuse un horodatage invalide plutôt que de produire une date NaN", () => {
    expect(() => civilDay("pas une date")).toThrow(TypeError);
  });

  it("rend une liste vide sans snapshot", () => {
    expect(dailyHistory([])).toEqual([]);
  });
});

describe("historyBounds", () => {
  const point = (date: string, value: string): WealthPoint => ({
    date,
    marketValueBase: d(value),
    costBasisBase: d("0"),
    unrealizedPnlBase: d("0"),
    baseCurrency: "CHF",
    calculationVersion: CALCULATION_VERSION,
  });

  it("encadre la série", () => {
    const bounds = historyBounds([
      point("2026-05-04", "1000"),
      point("2026-05-05", "1500"),
      point("2026-05-06", "900"),
    ]);
    expect(bounds).toEqual({ min: "900", max: "1500", flat: false });
  });

  it("signale une série plate au lieu de laisser diviser par zéro", () => {
    const bounds = historyBounds([point("2026-05-04", "1000"), point("2026-05-05", "1000")]);
    expect(bounds?.flat).toBe(true);
  });

  it("renvoie null sur une série vide", () => {
    expect(historyBounds([])).toBeNull();
  });
});

describe("wealthChange", () => {
  const point = (date: string, value: string, version = CALCULATION_VERSION): WealthPoint => ({
    date,
    marketValueBase: d(value),
    costBasisBase: d("900"),
    unrealizedPnlBase: d("0"),
    baseCurrency: "CHF",
    calculationVersion: version,
  });

  it("mesure la variation entre le premier et le dernier point", () => {
    const change = wealthChange([point("2026-05-04", "1000"), point("2026-05-06", "1250")]);
    expect(change?.absolute).toBe("250");
    expect(change?.relative).toBe("0.25");
  });

  it("refuse de comparer deux versions différentes du moteur", () => {
    const change = wealthChange([
      point("2026-05-04", "1000"),
      point("2026-05-06", "1250", "2.0.0"),
    ]);
    expect(change).toBeNull();
  });

  it("refuse aussi quand seul un point intermédiaire change de version", () => {
    const change = wealthChange([
      point("2026-05-04", "1000"),
      point("2026-05-05", "1100", "0.9.0"),
      point("2026-05-06", "1250"),
    ]);
    expect(change).toBeNull();
  });

  it("refuse de comparer deux devises de consolidation", () => {
    const eur: WealthPoint = { ...point("2026-05-06", "1250"), baseCurrency: "EUR" };
    expect(wealthChange([point("2026-05-04", "1000"), eur])).toBeNull();
  });

  it("renvoie null avec moins de deux points", () => {
    expect(wealthChange([point("2026-05-04", "1000")])).toBeNull();
    expect(wealthChange([])).toBeNull();
  });

  it("renvoie une variation absolue mais pas de pourcentage depuis zéro", () => {
    const change = wealthChange([point("2026-05-04", "0"), point("2026-05-06", "500")]);
    expect(change?.absolute).toBe("500");
    expect(change?.relative).toBeNull();
  });
});

describe("reconcile", () => {
  it("confirme l'identité comptable du moteur", () => {
    const result = reconcile(samplePortfolio());
    expect(result).toEqual({
      consistent: true,
      marketValueDelta: "0",
      costBasisDelta: "0",
      pnlDelta: "0",
    });
  });

  it("réconcilie un portefeuille vide", () => {
    expect(reconcile(valuePortfolio([], new Map(), FX, "CHF")).consistent).toBe(true);
  });

  it("réconcilie même quand des positions ne sont pas valorisables", () => {
    const valuation = valuePortfolio(
      [position({ positionId: "p1" }), position({ positionId: "p9", instrumentId: "absent" })],
      new Map([["i1", mark()]]),
      FX,
      "CHF",
    );
    expect(valuation.unvalued).toHaveLength(1);
    expect(reconcile(valuation).consistent).toBe(true);
  });

  it("détecte un total falsifié — le test prouve que l'assertion n'est pas vide", () => {
    const valuation = samplePortfolio();
    const falsified = { ...valuation, totalMarketValueBase: d("999999") };

    const result = reconcile(falsified);
    expect(result.consistent).toBe(false);
    expect(Number(result.marketValueDelta)).not.toBe(0);
  });

  it("détecte un écart d'un millionième, sans tolérance d'arrondi", () => {
    const valuation = samplePortfolio();
    const drifted = {
      ...valuation,
      totalMarketValueBase: d(`${Number(valuation.totalMarketValueBase) + 0.000001}`),
    };
    expect(reconcile(drifted).consistent).toBe(false);
  });
});

describe("componentsFingerprint", () => {
  it("est stable entre deux calculs identiques", () => {
    expect(componentsFingerprint(samplePortfolio())).toBe(componentsFingerprint(samplePortfolio()));
  });

  it("rend 16 caractères hexadécimaux", () => {
    expect(componentsFingerprint(samplePortfolio())).toMatch(/^[0-9a-f]{16}$/);
  });

  it("ne dépend pas de l'ordre de lecture des positions", () => {
    const marks = new Map<string, Mark>([
      ["i1", mark({ price: d("100") })],
      ["i2", mark({ price: d("250"), currency: "USD" })],
    ]);
    const a = valuePortfolio(
      [
        position({ positionId: "p1", instrumentId: "i1" }),
        position({ positionId: "p2", instrumentId: "i2", costCurrency: "USD" }),
      ],
      marks,
      FX,
      "CHF",
    );
    const b = valuePortfolio(
      [
        position({ positionId: "p2", instrumentId: "i2", costCurrency: "USD" }),
        position({ positionId: "p1", instrumentId: "i1" }),
      ],
      marks,
      FX,
      "CHF",
    );

    expect(componentsFingerprint(a)).toBe(componentsFingerprint(b));
  });

  it("change quand le taux de change change, à valeur inchangée par ailleurs", () => {
    const positions = [position({ instrumentId: "i2", costCurrency: "USD" })];
    const marks = new Map([["i2", mark({ currency: "USD" })]]);

    const at089 = valuePortfolio(positions, marks, FX, "CHF");
    const at090 = valuePortfolio(
      positions,
      marks,
      buildFxTable([fxRate("USD", "CHF", "0.90")]),
      "CHF",
    );

    expect(componentsFingerprint(at089)).not.toBe(componentsFingerprint(at090));
  });

  it("change quand une position devient non valorisable", () => {
    const complete = valuePortfolio(
      [position({ positionId: "p1" }), position({ positionId: "p2", instrumentId: "i2" })],
      new Map([
        ["i1", mark()],
        ["i2", mark()],
      ]),
      FX,
      "CHF",
    );
    const partial = valuePortfolio(
      [position({ positionId: "p1" }), position({ positionId: "p2", instrumentId: "i2" })],
      new Map([["i1", mark()]]),
      FX,
      "CHF",
    );

    expect(componentsFingerprint(complete)).not.toBe(componentsFingerprint(partial));
  });

  it("change quand la fraîcheur change, à prix identique", () => {
    const live = valuePortfolio([position()], new Map([["i1", mark()]]), FX, "CHF");
    const stale = valuePortfolio(
      [position()],
      new Map([["i1", mark({ freshness: "STALE" })]]),
      FX,
      "CHF",
    );

    expect(live.totalMarketValueBase).toBe(stale.totalMarketValueBase);
    expect(componentsFingerprint(live)).not.toBe(componentsFingerprint(stale));
  });

  it("liste les composants réellement utilisés par le calcul", () => {
    const canonical = canonicalComponents(samplePortfolio());
    expect(canonical).toContain(`v=${CALCULATION_VERSION}`);
    expect(canonical).toContain("base=CHF");
    expect(canonical).toContain("0.89");
    expect(canonical).toContain("fixture");
  });
});

describe("verifySnapshot", () => {
  it("confirme un snapshot dont les composants n'ont pas bougé", () => {
    const valuation = samplePortfolio();
    expect(verifySnapshot(componentsFingerprint(valuation), valuation)).toEqual({
      status: "MATCHES",
    });
  });

  it("signale une divergence en donnant les deux empreintes", () => {
    const result = verifySnapshot("0000000000000000", samplePortfolio());
    expect(result.status).toBe("DIVERGED");
    if (result.status === "DIVERGED") {
      expect(result.stored).toBe("0000000000000000");
      expect(result.recomputed).not.toBe(result.stored);
    }
  });

  it("distingue « pas d'empreinte » d'une divergence", () => {
    expect(verifySnapshot(null, samplePortfolio()).status).toBe("UNFINGERPRINTED");
    expect(verifySnapshot("", samplePortfolio()).status).toBe("UNFINGERPRINTED");
  });
});

describe("isComparableSeries", () => {
  const point = (version: string, currency: CurrencyCode = "CHF"): WealthPoint => ({
    date: "2026-05-04",
    marketValueBase: d("1"),
    costBasisBase: d("1"),
    unrealizedPnlBase: d("0"),
    baseCurrency: currency,
    calculationVersion: version,
  });

  it("accepte une série vide ou homogène", () => {
    expect(isComparableSeries([])).toBe(true);
    expect(isComparableSeries([point("1.0.0"), point("1.0.0")])).toBe(true);
  });

  it("refuse un mélange de versions ou de devises", () => {
    expect(isComparableSeries([point("1.0.0"), point("2.0.0")])).toBe(false);
    expect(isComparableSeries([point("1.0.0"), point("1.0.0", "EUR")])).toBe(false);
  });
});
