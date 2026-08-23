import { describe, expect, it } from "vitest";

import { toDecimalString, type DecimalString } from "@portfolio-lab/domain";

import type { NormalizedQuote } from "./contract.js";
import {
  DEFAULT_MARK_OPTIONS,
  daysToExpiration,
  isExpired,
  MARK_METHOD_LABEL,
  MARK_REJECTION_LABEL,
  markOption,
  type MarkMethod,
  type MarkRejection,
} from "./option-mark.js";

const d = (value: string): DecimalString => toDecimalString(value);

const NOW = new Date("2026-08-21T20:00:00.000Z");
const FRESH = "2026-08-21T19:55:00.000Z";
const OLD = "2026-08-21T10:00:00.000Z";

const options = { ...DEFAULT_MARK_OPTIONS, now: NOW };

function quote(overrides: Partial<NormalizedQuote> = {}): NormalizedQuote {
  return {
    instrumentId: "opt",
    provider: "test",
    providerSymbol: "DEMOT 270115C00100000",
    currency: "USD",
    price: d("6.20"),
    priceType: "LAST_TRADE",
    freshness: "DELAYED",
    asOf: FRESH,
    receivedAt: FRESH,
    ...overrides,
  };
}

function expectMark(result: ReturnType<typeof markOption>) {
  if (!result.ok) {
    throw new Error(`Mark attendu, obtenu : ${JSON.stringify(result.failure)}`);
  }
  return result.mark;
}

describe("markOption — contrat liquide", () => {
  it("retient le midpoint quand la fourchette est serrée et fraîche", () => {
    const mark = expectMark(markOption(quote({ bid: d("6.10"), ask: d("6.30") }), options));
    expect(mark.method).toBe("MID");
    expect(mark.price).toBe("6.2");
    expect(mark.priceType).toBe("MID");
    // Aucun rejet à expliquer quand la première méthode passe.
    expect(mark.rejections).toEqual([]);
  });

  it("calcule le midpoint exactement", () => {
    const mark = expectMark(markOption(quote({ bid: d("0.05"), ask: d("0.07") }), options));
    // 0.06 exact, et non 0.060000000000000005.
    expect(mark.price).toBe("0.06");
  });

  it("propage la fraîcheur annoncée par le fournisseur", () => {
    const mark = expectMark(
      markOption(quote({ bid: d("6.10"), ask: d("6.30"), freshness: "LIVE" }), options),
    );
    expect(mark.freshness).toBe("LIVE");
  });
});

describe("markOption — fourchette inexploitable", () => {
  function rejectionsFor(overrides: Partial<NormalizedQuote>): readonly MarkRejection[] {
    return expectMark(markOption(quote(overrides), options)).rejections;
  }

  it("retombe sur le dernier échange sans fourchette", () => {
    const mark = expectMark(markOption(quote(), options));
    expect(mark.method).toBe("LAST_TRADE");
    expect(mark.rejections).toContain("NO_BID_ASK");
  });

  it("refuse le midpoint sur une fourchette inversée", () => {
    // Un bid supérieur à l'ask signale une donnée corrompue.
    expect(rejectionsFor({ bid: d("6.50"), ask: d("6.10") })).toContain("CROSSED_SPREAD");
  });

  it("refuse le midpoint quand le bid est à zéro", () => {
    // Courant sur une option très hors de la monnaie ; le midpoint qui en
    // résulterait n'aurait aucun sens.
    expect(rejectionsFor({ bid: d("0"), ask: d("1.90") })).toContain("ZERO_QUOTE");
  });

  it("refuse le midpoint sur une fourchette aberrante", () => {
    // bid 0.05 / ask 1.90 donne un midpoint de 0.975 qu'aucune transaction ne
    // validerait.
    const mark = expectMark(
      markOption(quote({ bid: d("0.05"), ask: d("1.90"), price: d("0.15") }), options),
    );
    expect(mark.rejections).toContain("SPREAD_TOO_WIDE");
    expect(mark.method).toBe("LAST_TRADE");
    expect(mark.price).toBe("0.15");
  });

  it("refuse le midpoint sur une fourchette trop ancienne", () => {
    // Une option peu liquide peut afficher un bid/ask vieux de plusieurs
    // heures ; en tirer un midpoint donnerait une précision illusoire.
    const result = markOption(quote({ bid: d("6.10"), ask: d("6.30"), asOf: OLD }), options);
    const mark = expectMark(result);
    expect(mark.rejections).toContain("STALE_QUOTE");
    expect(mark.method).toBe("STALE_MARK");
  });
});

describe("markOption — contrat illiquide", () => {
  it("conserve le dernier prix connu en le marquant périmé", () => {
    const mark = expectMark(markOption(quote({ asOf: OLD, freshness: "DELAYED" }), options));
    expect(mark.method).toBe("STALE_MARK");
    // Le statut est dégradé quoi qu'annonce le fournisseur.
    expect(mark.freshness).toBe("STALE");
    expect(mark.rejections).toContain("STALE_QUOTE");
  });

  it("échoue explicitement quand rien n'est exploitable", () => {
    // Un prix de repli inventé serait pire qu'une position non valorisée : le
    // moteur du Lot 03 sait exposer la lacune.
    const result = markOption(quote({ price: d("0") }), options);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("NO_USABLE_PRICE");
      expect(result.failure.rejections).toContain("NO_BID_ASK");
    }
  });

  it("échoue quand la fourchette est nulle et le dernier prix aussi", () => {
    const result = markOption(quote({ bid: d("0"), ask: d("0"), price: d("0") }), options);
    expect(result.ok).toBe(false);
  });
});

describe("markOption — traçabilité", () => {
  it("explique chaque méthode et chaque rejet", () => {
    const methods: MarkMethod[] = ["MID", "LAST_TRADE", "STALE_MARK"];
    for (const method of methods) {
      expect(MARK_METHOD_LABEL[method]).toBeTruthy();
    }
    const rejections: MarkRejection[] = [
      "NO_BID_ASK",
      "CROSSED_SPREAD",
      "ZERO_QUOTE",
      "SPREAD_TOO_WIDE",
      "STALE_QUOTE",
    ];
    for (const rejection of rejections) {
      expect(MARK_REJECTION_LABEL[rejection]).toBeTruthy();
    }
  });

  it("conserve l'horodatage de la source", () => {
    expect(expectMark(markOption(quote({ bid: d("6.10"), ask: d("6.30") }), options)).asOf).toBe(
      FRESH,
    );
  });
});

describe("daysToExpiration", () => {
  it("compte les jours calendaires, week-ends compris", () => {
    // Une option expire à une date fixe, week-end ou non.
    expect(daysToExpiration("2026-08-24", NOW)).toBe(3);
  });

  it("renvoie zéro le jour de l'échéance", () => {
    expect(daysToExpiration("2026-08-21", NOW)).toBe(0);
  });

  it("renvoie une valeur négative pour un contrat expiré", () => {
    expect(daysToExpiration("2026-06-19", NOW)).toBeLessThan(0);
  });

  it("renvoie NaN sur une date illisible", () => {
    expect(Number.isNaN(daysToExpiration("pas-une-date", NOW))).toBe(true);
  });

  it("ignore l'heure de l'instant d'évaluation", () => {
    const matin = new Date("2026-08-21T00:01:00.000Z");
    const soir = new Date("2026-08-21T23:59:00.000Z");
    expect(daysToExpiration("2026-08-24", matin)).toBe(daysToExpiration("2026-08-24", soir));
  });
});

describe("isExpired", () => {
  it("reconnaît un contrat échu", () => {
    expect(isExpired("2026-06-19", NOW)).toBe(true);
  });

  it("ne considère pas expiré un contrat expirant aujourd'hui", () => {
    // Le contrat reste négociable le jour de son échéance.
    expect(isExpired("2026-08-21", NOW)).toBe(false);
  });

  it("ne considère pas expirée une date illisible", () => {
    // Faute d'information, on ne prononce pas un verdict aussi lourd.
    expect(isExpired("pas-une-date", NOW)).toBe(false);
  });
});
