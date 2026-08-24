import { describe, expect, it } from "vitest";

import { toDecimalString } from "@portfolio-lab/domain";

import { ProviderError } from "./contract.js";
import {
  bondPositionValue,
  parseTraceTrade,
  traceFreshness,
  traceQuote,
  TRACE_AGE_THRESHOLDS,
} from "./finra-trace.js";

const NOW = new Date("2026-08-24T12:00:00.000Z");

const validTrade = {
  cusip: "037833100",
  price: "98.750",
  quantity: "10000",
  executionDate: "2026-08-24",
  executionTime: "09:45:12",
  venue: "TRACE",
};

describe("fraîcheur d'un prix obligataire", () => {
  it("n'annonce jamais LIVE, même sur une transaction de la minute", () => {
    /*
     * TRACE est un registre de transactions déclarées, pas un carnet d'ordres.
     * Aucun prix n'y engage qui que ce soit à traiter maintenant, quelle que
     * soit sa fraîcheur.
     */
    const justNow = new Date(NOW.getTime() - 60_000);
    expect(traceFreshness(justNow, NOW)).not.toBe("LIVE");
    expect(traceFreshness(justNow, NOW)).toBe("DELAYED");
  });

  it("dégrade la fraîcheur avec l'âge de la transaction", () => {
    const hours = (n: number) => new Date(NOW.getTime() - n * 3_600_000);
    expect(traceFreshness(hours(2), NOW)).toBe("DELAYED");
    expect(traceFreshness(hours(48), NOW)).toBe("EOD");
    expect(traceFreshness(hours(24 * 30), NOW)).toBe("STALE");
  });

  it("bascule exactement aux seuils déclarés", () => {
    const at = (ms: number) => new Date(NOW.getTime() - ms);
    expect(traceFreshness(at(TRACE_AGE_THRESHOLDS.recentMs), NOW)).toBe("DELAYED");
    expect(traceFreshness(at(TRACE_AGE_THRESHOLDS.recentMs + 1), NOW)).toBe("EOD");
    expect(traceFreshness(at(TRACE_AGE_THRESHOLDS.staleMs), NOW)).toBe("EOD");
    expect(traceFreshness(at(TRACE_AGE_THRESHOLDS.staleMs + 1), NOW)).toBe("STALE");
  });

  it("refuse une transaction datée du futur au lieu de la croire fraîche", () => {
    /*
     * Une horloge fausse ou un fuseau mal interprété. La traiter comme récente
     * masquerait le problème — et un prix daté du futur ne périmerait jamais.
     */
    const future = new Date(NOW.getTime() + 3_600_000);
    expect(traceFreshness(future, NOW)).toBe("UNAVAILABLE");
  });

  it("finit par déclarer périmée une obligation qui ne s'échange plus", () => {
    // Une obligation d'entreprise peut ne pas s'échanger pendant des semaines.
    // Présenter indéfiniment son dernier prix comme un cours valoriserait le
    // portefeuille sur une transaction qui n'a plus cours.
    const sixMonths = new Date(NOW.getTime() - 180 * 24 * 3_600_000);
    expect(traceFreshness(sixMonths, NOW)).toBe("STALE");
  });
});

describe("normalisation d'une transaction", () => {
  it("conserve identifiant, prix, taille, horodatage et source", () => {
    const trade = parseTraceTrade(validTrade);
    expect(trade.identifier).toBe("037833100");
    expect(trade.pricePer100).toBe("98.75");
    expect(trade.size).toBe("10000");
    expect(trade.tradedAt).toBe("2026-08-24T09:45:12.000Z");
    expect(trade.venue).toBe("TRACE");
  });

  it("laisse la taille inconnue quand FINRA la plafonne", () => {
    /*
     * FINRA masque la taille exacte des gros blocs derrière « 5MM+ ».
     * L'interpréter comme un nombre donnerait une quantité que FINRA a
     * justement refusé de publier.
     */
    for (const capped of ["5MM+", "1MM+", "100K"]) {
      expect(parseTraceTrade({ ...validTrade, quantity: capped }).size, capped).toBeNull();
    }
  });

  it("laisse la taille nulle plutôt que zéro quand elle est absente", () => {
    // Zéro dirait « rien n'a été échangé », ce qui est faux.
    expect(parseTraceTrade({ ...validTrade, quantity: undefined }).size).toBeNull();
  });

  it("accepte un ISIN à défaut de CUSIP", () => {
    const { cusip, ...withoutCusip } = validTrade;
    void cusip;
    expect(parseTraceTrade({ ...withoutCusip, isin: "US0378331005" }).identifier).toBe(
      "US0378331005",
    );
  });

  it("refuse une transaction sans identifiant", () => {
    const { cusip, ...orphan } = validTrade;
    void cusip;
    // Un prix obligataire sans titre n'est rien.
    expect(() => parseTraceTrade(orphan)).toThrow(/sans identifiant/);
  });

  it("refuse un prix nul ou négatif", () => {
    for (const price of ["0", "-98.75"]) {
      expect(() => parseTraceTrade({ ...validTrade, price }), price).toThrow(ProviderError);
    }
  });

  it("refuse une date d'exécution illisible", () => {
    for (const executionDate of ["24/08/2026", "2026-08", "", null]) {
      expect(
        () => parseTraceTrade({ ...validTrade, executionDate, tradeReportDate: undefined }),
        String(executionDate),
      ).toThrow(/Date d'exécution illisible/);
    }
  });

  it("se rabat sur la date de déclaration quand l'exécution manque", () => {
    const trade = parseTraceTrade({
      ...validTrade,
      executionDate: undefined,
      tradeReportDate: "2026-08-23",
    });
    expect(trade.tradedAt.slice(0, 10)).toBe("2026-08-23");
  });

  it("suppose minuit quand l'heure manque, sans échouer", () => {
    const trade = parseTraceTrade({ ...validTrade, executionTime: undefined });
    expect(trade.tradedAt).toBe("2026-08-24T00:00:00.000Z");
  });
});

describe("cotation obligataire", () => {
  it("est toujours un dernier échange, jamais une fourchette", () => {
    /*
     * `BID`, `ASK` ou `MID` affirmeraient l'existence d'une contrepartie prête
     * à traiter. TRACE ne dit rien de tel.
     */
    const quote = traceQuote(parseTraceTrade(validTrade), "bond-1", NOW);
    expect(quote.priceType).toBe("LAST_TRADE");
    expect(quote).not.toHaveProperty("bid");
    expect(quote).not.toHaveProperty("ask");
  });

  it("porte l'horodatage de la transaction et non celui de la réception", () => {
    const quote = traceQuote(parseTraceTrade(validTrade), "bond-1", NOW);
    expect(quote.asOf).toBe("2026-08-24T09:45:12.000Z");
    expect(quote.receivedAt).toBe(NOW.toISOString());
  });
});

describe("valeur d'une position obligataire", () => {
  it("traite le prix comme un pourcentage du nominal", () => {
    /*
     * Les obligations se cotent en pourcentage du nominal. Traiter 98.75 comme
     * un prix unitaire surévaluerait la position d'un facteur cent — une
     * erreur d'autant plus facile à laisser passer qu'elle produit un nombre
     * parfaitement plausible.
     */
    expect(bondPositionValue(toDecimalString("98.75"), toDecimalString("10000"))).toBe("9875");
    expect(bondPositionValue(toDecimalString("100"), toDecimalString("10000"))).toBe("10000");
    expect(bondPositionValue(toDecimalString("101.5"), toDecimalString("250000"))).toBe("253750");
  });

  it("reste exact sur des valeurs qui piègent les flottants", () => {
    // 0.1 + 0.2 en flottant vaut 0.30000000000000004.
    expect(bondPositionValue(toDecimalString("0.1"), toDecimalString("3"))).toBe("0.003");
    expect(bondPositionValue(toDecimalString("99.999"), toDecimalString("1000000"))).toBe("999990");
  });
});
