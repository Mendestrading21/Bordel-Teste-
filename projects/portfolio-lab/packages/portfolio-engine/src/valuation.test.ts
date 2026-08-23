import { describe, expect, it } from "vitest";

import { toDecimalString, type CurrencyCode, type DecimalString } from "@portfolio-lab/domain";

import {
  allocate,
  buildFxTable,
  CALCULATION_VERSION,
  fxKey,
  resolveFxRate,
  valuePortfolio,
  valuePosition,
  worseFreshness,
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

const NO_FX = buildFxTable([]);
const FX = buildFxTable([fxRate("USD", "CHF", "0.89"), fxRate("EUR", "CHF", "0.94")]);

/** Extrait la valorisation ou fait échouer le test avec un message clair. */
function expectValued(
  result: ReturnType<typeof valuePosition>,
): Extract<ReturnType<typeof valuePosition>, { ok: true }>["value"] {
  if (!result.ok) {
    throw new Error(`Valorisation attendue, obtenu : ${JSON.stringify(result.reason)}`);
  }
  return result.value;
}

describe("worseFreshness", () => {
  it("retient toujours le niveau le plus dégradé", () => {
    expect(worseFreshness("LIVE", "DELAYED")).toBe("DELAYED");
    expect(worseFreshness("DELAYED", "LIVE")).toBe("DELAYED");
    expect(worseFreshness("EOD", "STALE")).toBe("STALE");
    expect(worseFreshness("NAV", "UNAVAILABLE")).toBe("UNAVAILABLE");
    expect(worseFreshness("LIVE", "LIVE")).toBe("LIVE");
  });
});

describe("resolveFxRate", () => {
  it("renvoie 1 pour une devise identique sans consulter la table", () => {
    // Convertir un montant déjà en CHF par un taux CHF/CHF de fournisseur
    // introduirait un arrondi parasite et pourrait le marquer périmé.
    const resolved = resolveFxRate("CHF", "CHF", NO_FX);
    expect(resolved?.rate.toString()).toBe("1");
    expect(resolved?.asOf).toBeNull();
  });

  it("utilise un taux direct", () => {
    expect(resolveFxRate("USD", "CHF", FX)?.rate.toString()).toBe("0.89");
  });

  it("inverse exactement un taux disponible dans l'autre sens", () => {
    const table = buildFxTable([fxRate("CHF", "USD", "1.25")]);
    const resolved = resolveFxRate("USD", "CHF", table);
    expect(resolved?.rate.toString()).toBe("0.8");
  });

  it("refuse d'inverser un taux nul plutôt que de produire l'infini", () => {
    const table = buildFxTable([fxRate("CHF", "USD", "0")]);
    expect(resolveFxRate("USD", "CHF", table)).toBeNull();
  });

  it("renvoie null quand aucun taux n'existe", () => {
    expect(resolveFxRate("JPY", "CHF", FX)).toBeNull();
  });

  it("construit une clé lisible", () => {
    expect(fxKey("USD", "CHF")).toBe("USD/CHF");
  });
});

describe("valuePosition — action en CHF", () => {
  it("calcule valeur, coût et P&L", () => {
    const value = expectValued(valuePosition(position(), mark(), NO_FX, "CHF"));
    expect(value.marketValueNative).toBe("1000");
    expect(value.marketValueBase).toBe("1000");
    expect(value.costBasisBase).toBe("900");
    expect(value.unrealizedPnlBase).toBe("100");
    expect(value.unrealizedPnlPct).toBe("0.1111111111111111111111111111111111");
  });

  it("propage la provenance et la fraîcheur sans les réinterpréter", () => {
    const value = expectValued(
      valuePosition(
        position(),
        mark({ priceType: "PREVIOUS_CLOSE", freshness: "EOD", provider: "twelvedata" }),
        NO_FX,
        "CHF",
      ),
    );
    expect(value.priceType).toBe("PREVIOUS_CLOSE");
    expect(value.freshness).toBe("EOD");
    expect(value.provider).toBe("twelvedata");
    expect(value.asOf).toBe(AS_OF);
    expect(value.calculationVersion).toBe(CALCULATION_VERSION);
  });

  it("calcule la variation du jour à partir de la clôture précédente", () => {
    const value = expectValued(
      valuePosition(position(), mark({ previousClose: d("97.5") }), NO_FX, "CHF"),
    );
    // 10 × 1 × (100 − 97.5) = 25
    expect(value.dayPnlBase).toBe("25");
  });

  it("renvoie null et non zéro quand la clôture précédente manque", () => {
    // Zéro se lirait comme « stable aujourd'hui », ce qui est faux.
    expect(expectValued(valuePosition(position(), mark(), NO_FX, "CHF")).dayPnlBase).toBeNull();
  });
});

describe("valuePosition — conversion de devise", () => {
  it("convertit un titre en USD vers le CHF", () => {
    const value = expectValued(
      valuePosition(position({ costCurrency: "USD" }), mark({ currency: "USD" }), FX, "CHF"),
    );
    expect(value.marketValueNative).toBe("1000");
    expect(value.marketValueBase).toBe("890");
    expect(value.costBasisBase).toBe("801");
    expect(value.unrealizedPnlBase).toBe("89");
    expect(value.fxRate).toBe("0.89");
    expect(value.fxAsOf).toBe(AS_OF);
  });

  it("convertit un titre en EUR vers le CHF", () => {
    const value = expectValued(
      valuePosition(position({ costCurrency: "EUR" }), mark({ currency: "EUR" }), FX, "CHF"),
    );
    expect(value.marketValueBase).toBe("940");
  });

  it("utilise le taux de la devise du coût, distinct de celle du prix", () => {
    // Un titre acheté en USD peut être coté sur une place en EUR ; réutiliser
    // le taux du prix pour le coût fausserait le P&L.
    const value = expectValued(
      valuePosition(position({ costCurrency: "USD" }), mark({ currency: "EUR" }), FX, "CHF"),
    );
    expect(value.marketValueBase).toBe("940"); // 1000 EUR × 0.94
    expect(value.costBasisBase).toBe("801"); // 900 USD × 0.89
    expect(value.unrealizedPnlBase).toBe("139");
  });

  it("ne convertit pas deux fois un instrument déjà en devise de base", () => {
    const value = expectValued(valuePosition(position(), mark(), FX, "CHF"));
    expect(value.fxRate).toBe("1");
    expect(value.marketValueBase).toBe(value.marketValueNative);
  });

  it("retient la fraîcheur la plus dégradée du couple prix / taux", () => {
    // Un prix en direct converti par un taux de la veille n'est pas une valeur
    // en direct.
    const staleFx = buildFxTable([{ ...fxRate("USD", "CHF", "0.89"), freshness: "STALE" }]);
    const value = expectValued(
      valuePosition(position({ costCurrency: "USD" }), mark({ currency: "USD" }), staleFx, "CHF"),
    );
    expect(value.freshness).toBe("STALE");
  });
});

describe("valuePosition — options et multiplicateur", () => {
  it("applique le multiplicateur du contrat", () => {
    const value = expectValued(
      valuePosition(
        position({ quantity: d("2"), averageCost: d("4.75"), multiplier: d("100") }),
        mark({ price: d("6.20") }),
        NO_FX,
        "CHF",
      ),
    );
    // 2 contrats × 100 × 6.20 = 1240
    expect(value.marketValueNative).toBe("1240");
    expect(value.costBasisNative).toBe("950");
    expect(value.unrealizedPnlBase).toBe("290");
  });

  it("respecte un multiplicateur non standard sans supposer 100", () => {
    const value = expectValued(
      valuePosition(
        position({ quantity: d("1"), averageCost: d("10"), multiplier: d("112") }),
        mark({ price: d("12") }),
        NO_FX,
        "CHF",
      ),
    );
    // Un contrat ajusté après split : 112, pas 100.
    expect(value.marketValueNative).toBe("1344");
  });

  it("valorise une option en USD avec multiplicateur et conversion", () => {
    const value = expectValued(
      valuePosition(
        position({
          quantity: d("3"),
          averageCost: d("2.50"),
          costCurrency: "USD",
          multiplier: d("100"),
        }),
        mark({ price: d("3.10"), currency: "USD" }),
        FX,
        "CHF",
      ),
    );
    // 3 × 100 × 3.10 = 930 USD → 827.70 CHF
    expect(value.marketValueNative).toBe("930");
    expect(value.marketValueBase).toBe("827.7");
    // 3 × 100 × 2.50 = 750 USD → 667.50 CHF
    expect(value.costBasisBase).toBe("667.5");
    expect(value.unrealizedPnlBase).toBe("160.2");
  });
});

describe("valuePosition — positions vendeuses", () => {
  it("produit une valeur et un coût négatifs", () => {
    const value = expectValued(
      valuePosition(
        position({ quantity: d("-10"), averageCost: d("90") }),
        mark({ price: d("100") }),
        NO_FX,
        "CHF",
      ),
    );
    expect(value.marketValueBase).toBe("-1000");
    expect(value.costBasisBase).toBe("-900");
    // Le titre a monté : la position vendeuse perd.
    expect(value.unrealizedPnlBase).toBe("-100");
  });

  it("gagne quand le titre baisse", () => {
    const value = expectValued(
      valuePosition(
        position({ quantity: d("-10"), averageCost: d("90") }),
        mark({ price: d("80") }),
        NO_FX,
        "CHF",
      ),
    );
    expect(value.unrealizedPnlBase).toBe("100");
  });

  it("n'inverse pas le signe du pourcentage sur une position vendeuse", () => {
    // Diviser par un coût négatif retournerait le signe et afficherait une
    // perte comme un gain.
    const perdante = expectValued(
      valuePosition(
        position({ quantity: d("-10"), averageCost: d("90") }),
        mark({ price: d("100") }),
        NO_FX,
        "CHF",
      ),
    );
    expect(perdante.unrealizedPnlPct?.startsWith("-")).toBe(true);

    const gagnante = expectValued(
      valuePosition(
        position({ quantity: d("-10"), averageCost: d("90") }),
        mark({ price: d("80") }),
        NO_FX,
        "CHF",
      ),
    );
    expect(gagnante.unrealizedPnlPct?.startsWith("-")).toBe(false);
  });

  it("calcule une variation du jour négative quand le titre monte", () => {
    const value = expectValued(
      valuePosition(
        position({ quantity: d("-10") }),
        mark({ price: d("100"), previousClose: d("95") }),
        NO_FX,
        "CHF",
      ),
    );
    expect(value.dayPnlBase).toBe("-50");
  });
});

describe("valuePosition — données manquantes", () => {
  it("refuse de valoriser sans cours plutôt que de compter zéro", () => {
    const result = valuePosition(position(), undefined, NO_FX, "CHF");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason.kind).toBe("NO_MARK");
  });

  it("refuse un cours marqué indisponible", () => {
    const result = valuePosition(position(), mark({ freshness: "UNAVAILABLE" }), NO_FX, "CHF");
    expect(result.ok === false && result.reason.kind).toBe("MARK_UNAVAILABLE");
  });

  it("accepte un cours périmé mais conserve le statut", () => {
    // Une donnée périmée reste exploitable ; elle doit être signalée, pas
    // masquée ni écartée.
    const value = expectValued(
      valuePosition(position(), mark({ freshness: "STALE" }), NO_FX, "CHF"),
    );
    expect(value.freshness).toBe("STALE");
    expect(value.marketValueBase).toBe("1000");
  });

  it("refuse de valoriser sans taux de change du prix", () => {
    const result = valuePosition(position(), mark({ currency: "JPY" }), FX, "CHF");
    expect(result.ok === false && result.reason.kind).toBe("NO_FX_RATE");
  });

  it("refuse de valoriser sans taux de change du coût", () => {
    const result = valuePosition(position({ costCurrency: "JPY" }), mark(), FX, "CHF");
    expect(result.ok === false && result.reason.kind).toBe("COST_FX_MISSING");
  });
});

describe("valuePosition — valeurs limites", () => {
  it("renvoie null et non 0 % quand le coût de revient est nul", () => {
    // « Aucun rendement calculable » et « rendement de zéro » sont deux
    // informations différentes.
    const value = expectValued(
      valuePosition(position({ averageCost: d("0") }), mark(), NO_FX, "CHF"),
    );
    expect(value.unrealizedPnlPct).toBeNull();
    expect(value.unrealizedPnlBase).toBe("1000");
  });

  it("valorise une très petite quantité fractionnaire sans perte", () => {
    const value = expectValued(
      valuePosition(
        position({ quantity: d("0.000000000001"), averageCost: d("0") }),
        mark({ price: d("100") }),
        NO_FX,
        "CHF",
      ),
    );
    expect(value.marketValueNative).toBe("0.0000000001");
  });

  it("valorise une très grande position sans notation exponentielle", () => {
    const value = expectValued(
      valuePosition(
        position({ quantity: d("1000000000"), averageCost: d("1000") }),
        mark({ price: d("999999") }),
        NO_FX,
        "CHF",
      ),
    );
    expect(value.marketValueNative).toBe("999999000000000");
    expect(value.marketValueNative).not.toContain("e");
  });

  it("additionne exactement là où le flottant dériverait", () => {
    const value = expectValued(
      valuePosition(
        position({ quantity: d("3"), averageCost: d("0.1") }),
        mark({ price: d("0.2") }),
        NO_FX,
        "CHF",
      ),
    );
    // 3 × 0.2 = 0.6 exact, et non 0.6000000000000001.
    expect(value.marketValueNative).toBe("0.6");
    expect(value.costBasisNative).toBe("0.3");
    expect(value.unrealizedPnlBase).toBe("0.3");
  });

  it("valorise du cash au pair", () => {
    const value = expectValued(
      valuePosition(
        position({ quantity: d("5000"), averageCost: d("1"), multiplier: d("1") }),
        mark({ price: d("1"), priceType: "MANUAL", freshness: "MANUAL" }),
        NO_FX,
        "CHF",
      ),
    );
    expect(value.marketValueBase).toBe("5000");
    expect(value.unrealizedPnlBase).toBe("0");
    expect(value.freshness).toBe("MANUAL");
  });

  it("valorise un fonds par sa NAV en conservant le statut NAV", () => {
    const value = expectValued(
      valuePosition(
        position({ quantity: d("150.75"), averageCost: d("102.40") }),
        mark({ price: d("104.83"), priceType: "NAV", freshness: "NAV" }),
        NO_FX,
        "CHF",
      ),
    );
    expect(value.priceType).toBe("NAV");
    expect(value.freshness).toBe("NAV");
    expect(value.marketValueNative).toBe("15803.1225");
  });
});

describe("valuePortfolio", () => {
  const marks = new Map<string, Mark>([
    ["stock-chf", mark({ price: d("142.80"), previousClose: d("141.00") })],
    ["stock-usd", mark({ price: d("91.40"), currency: "USD", previousClose: d("90.00") })],
    ["fund-chf", mark({ price: d("104.83"), priceType: "NAV", freshness: "NAV" })],
  ]);

  const positions: PositionInput[] = [
    position({
      positionId: "p1",
      instrumentId: "stock-chf",
      quantity: d("25"),
      averageCost: d("142.50"),
    }),
    position({
      positionId: "p2",
      instrumentId: "stock-usd",
      quantity: d("40"),
      averageCost: d("88.25"),
      costCurrency: "USD",
      accountId: "a2",
    }),
    position({
      positionId: "p3",
      instrumentId: "fund-chf",
      quantity: d("150.75"),
      averageCost: d("102.40"),
      accountId: "a3",
    }),
  ];

  it("consolide un portefeuille multi-devises en CHF", () => {
    const result = valuePortfolio(positions, marks, FX, "CHF");
    expect(result.positions).toHaveLength(3);
    expect(result.unvalued).toHaveLength(0);

    // 25 × 142.80 = 3570 CHF
    // 40 × 91.40 = 3656 USD × 0.89 = 3253.84 CHF
    // 150.75 × 104.83 = 15803.1225 CHF
    expect(result.totalMarketValueBase).toBe("22626.9625");
  });

  it("produit un total reproductible à partir des mêmes composants", () => {
    const first = valuePortfolio(positions, marks, FX, "CHF");
    const second = valuePortfolio(positions, marks, FX, "CHF");
    expect(first.totalMarketValueBase).toBe(second.totalMarketValueBase);
    expect(first.totalUnrealizedPnlBase).toBe(second.totalUnrealizedPnlBase);
  });

  it("réconcilie le total avec la somme des positions", () => {
    const result = valuePortfolio(positions, marks, FX, "CHF");
    const sum = result.positions.reduce((total, value) => total + Number(value.marketValueBase), 0);
    expect(Number(result.totalMarketValueBase)).toBeCloseTo(sum, 6);
    expect(Number(result.totalUnrealizedPnlBase)).toBeCloseTo(
      Number(result.totalMarketValueBase) - Number(result.totalCostBasisBase),
      6,
    );
  });

  it("retient la fraîcheur la plus dégradée du portefeuille", () => {
    // Annoncer « en direct » un total dont une ligne est une NAV serait un
    // mensonge par agrégation.
    expect(valuePortfolio(positions, marks, FX, "CHF").worstFreshness).toBe("NAV");
  });

  it("écarte les positions non valorisables du total et les liste à part", () => {
    const withUnknown = [
      ...positions,
      position({ positionId: "p4", instrumentId: "inconnu", accountId: "a1" }),
    ];
    const result = valuePortfolio(withUnknown, marks, FX, "CHF");

    expect(result.positions).toHaveLength(3);
    expect(result.unvalued).toHaveLength(1);
    expect(result.unvalued[0]?.positionId).toBe("p4");
    expect(result.unvalued[0]?.reason.kind).toBe("NO_MARK");
    // Le total ne bouge pas : une position manquante ne pèse pas zéro.
    expect(result.totalMarketValueBase).toBe("22626.9625");
  });

  it("renvoie un total du jour null dès qu'une clôture précédente manque", () => {
    // Additionner les seules variations connues donnerait un chiffre partiel
    // présenté comme complet.
    expect(valuePortfolio(positions, marks, FX, "CHF").totalDayPnlBase).toBeNull();
  });

  it("calcule le total du jour quand toutes les clôtures sont connues", () => {
    const complete = new Map(marks);
    complete.set("fund-chf", mark({ price: d("104.83"), previousClose: d("104.83") }));
    const result = valuePortfolio(positions, complete, FX, "CHF");
    // 25 × 1.80 = 45 ; 40 × 1.40 × 0.89 = 49.84 ; fonds inchangé = 0
    expect(result.totalDayPnlBase).toBe("94.84");
  });

  it("gère un portefeuille vide sans produire de faux zéro de fraîcheur", () => {
    const result = valuePortfolio([], marks, FX, "CHF");
    expect(result.totalMarketValueBase).toBe("0");
    expect(result.totalUnrealizedPnlBase).toBe("0");
    expect(result.worstFreshness).toBe("UNAVAILABLE");
  });

  it("compense exactement une position longue et une position vendeuse", () => {
    const opposees: PositionInput[] = [
      position({
        positionId: "l",
        instrumentId: "stock-chf",
        quantity: d("10"),
        averageCost: d("142.80"),
      }),
      position({
        positionId: "s",
        instrumentId: "stock-chf",
        quantity: d("-10"),
        averageCost: d("142.80"),
        accountId: "a2",
      }),
    ];
    const result = valuePortfolio(opposees, marks, FX, "CHF");
    expect(result.totalMarketValueBase).toBe("0");
    expect(result.totalUnrealizedPnlBase).toBe("0");
  });
});

describe("allocate", () => {
  it("répartit l'exposition en parts sommant à 1", () => {
    const slices = allocate([
      { key: "STOCK", marketValueBase: d("6000") },
      { key: "ETF", marketValueBase: d("3000") },
      { key: "CASH", marketValueBase: d("1000") },
    ]);
    expect(slices.map((s) => s.key)).toEqual(["STOCK", "ETF", "CASH"]);
    expect(slices.map((s) => s.grossPct)).toEqual(["0.6", "0.3", "0.1"]);
  });

  it("agrège plusieurs entrées d'une même clé", () => {
    const slices = allocate([
      { key: "a1", marketValueBase: d("100") },
      { key: "a1", marketValueBase: d("300") },
      { key: "a2", marketValueBase: d("100") },
    ]);
    expect(slices).toHaveLength(2);
    expect(slices[0]).toMatchObject({ key: "a1", marketValueBase: "400", grossPct: "0.8" });
  });

  it("utilise l'exposition brute comme dénominateur", () => {
    // Avec une somme algébrique proche de zéro, un dénominateur net produirait
    // des parts aberrantes voire une division par zéro.
    const slices = allocate([
      { key: "long", marketValueBase: d("1000") },
      { key: "short", marketValueBase: d("-1000") },
    ]);
    expect(slices.map((s) => s.grossPct)).toEqual(["0.5", "0.5"]);
    expect(slices.find((s) => s.key === "short")?.marketValueBase).toBe("-1000");
  });

  it("renvoie des parts nulles plutôt que de diviser par zéro", () => {
    const slices = allocate([{ key: "vide", marketValueBase: d("0") }]);
    expect(slices[0]?.grossPct).toBe("0");
  });

  it("renvoie une liste vide pour aucune entrée", () => {
    expect(allocate([])).toEqual([]);
  });

  it("trie par part décroissante puis par clé", () => {
    const slices = allocate([
      { key: "zebre", marketValueBase: d("100") },
      { key: "alpha", marketValueBase: d("100") },
      { key: "gros", marketValueBase: d("500") },
    ]);
    expect(slices.map((s) => s.key)).toEqual(["gros", "alpha", "zebre"]);
  });
});
