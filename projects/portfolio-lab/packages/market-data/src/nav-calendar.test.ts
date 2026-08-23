import { describe, expect, it } from "vitest";

import {
  businessDaysBetween,
  evaluateNavStatus,
  isBusinessDay,
  isWeekend,
  NAV_FREQUENCY_LABEL,
  NAV_FREQUENCIES,
  NO_HOLIDAYS,
  toleranceFor,
  type HolidayCalendar,
} from "./nav-calendar.js";

const utc = (iso: string): Date => new Date(`${iso}T12:00:00.000Z`);

/*
 * Repères de calendrier utilisés ci-dessous, tous vérifiables :
 *   2026-08-21 = vendredi   2026-08-24 = lundi
 *   2026-08-22 = samedi     2026-08-25 = mardi
 *   2026-08-23 = dimanche
 */

describe("isWeekend", () => {
  it("reconnaît samedi et dimanche", () => {
    expect(isWeekend(utc("2026-08-22"))).toBe(true);
    expect(isWeekend(utc("2026-08-23"))).toBe(true);
  });

  it("ne confond pas vendredi et lundi avec le week-end", () => {
    expect(isWeekend(utc("2026-08-21"))).toBe(false);
    expect(isWeekend(utc("2026-08-24"))).toBe(false);
  });
});

describe("isBusinessDay", () => {
  it("exclut les jours fériés fournis", () => {
    const holidays: HolidayCalendar = new Set(["2026-08-24"]);
    expect(isBusinessDay(utc("2026-08-24"), holidays)).toBe(false);
    expect(isBusinessDay(utc("2026-08-24"), NO_HOLIDAYS)).toBe(true);
  });
});

describe("businessDaysBetween", () => {
  it("compte un jour entre vendredi et lundi", () => {
    // C'est le cœur du problème : sans ce calcul, un fonds publié vendredi
    // paraîtrait vieux de trois jours le lundi.
    expect(businessDaysBetween(utc("2026-08-21"), utc("2026-08-24"))).toBe(1);
  });

  it("ne compte rien du vendredi au dimanche", () => {
    expect(businessDaysBetween(utc("2026-08-21"), utc("2026-08-23"))).toBe(0);
  });

  it("compte zéro pour un même jour", () => {
    expect(businessDaysBetween(utc("2026-08-24"), utc("2026-08-24"))).toBe(0);
  });

  it("exclut la borne de départ et inclut celle d'arrivée", () => {
    // « Publiée hier, évaluée aujourd'hui » vaut un jour ouvré, pas zéro.
    expect(businessDaysBetween(utc("2026-08-24"), utc("2026-08-25"))).toBe(1);
  });

  it("saute un jour férié en semaine", () => {
    const holidays: HolidayCalendar = new Set(["2026-08-25"]);
    expect(businessDaysBetween(utc("2026-08-24"), utc("2026-08-26"), holidays)).toBe(1);
  });

  it("compte une semaine complète comme cinq jours ouvrés", () => {
    expect(businessDaysBetween(utc("2026-08-17"), utc("2026-08-24"))).toBe(5);
  });

  it("renvoie une valeur négative pour un intervalle inversé", () => {
    // Signale une NAV datée dans le futur, anomalie que l'appelant doit traiter.
    expect(businessDaysBetween(utc("2026-08-25"), utc("2026-08-24"))).toBe(-1);
  });

  it("ignore l'heure et ne compare que les dates", () => {
    const soir = new Date("2026-08-24T23:59:00.000Z");
    const matin = new Date("2026-08-25T00:01:00.000Z");
    expect(businessDaysBetween(soir, matin)).toBe(1);
  });
});

describe("evaluateNavStatus", () => {
  it("signale une NAV absente", () => {
    expect(evaluateNavStatus(null, utc("2026-08-24"), "DAILY")).toEqual({ kind: "MISSING" });
  });

  it("considère à jour une NAV de vendredi évaluée le lundi", () => {
    // Sans calcul en jours ouvrés, tout le portefeuille clignoterait
    // « périmé » chaque week-end.
    const status = evaluateNavStatus(utc("2026-08-21"), utc("2026-08-24"), "DAILY");
    expect(status).toEqual({ kind: "CURRENT", businessDaysOld: 1 });
  });

  it("considère à jour une NAV de vendredi évaluée le dimanche", () => {
    expect(evaluateNavStatus(utc("2026-08-21"), utc("2026-08-23"), "DAILY").kind).toBe("CURRENT");
  });

  it("finit par signaler périmée une NAV quotidienne trop ancienne", () => {
    const status = evaluateNavStatus(utc("2026-08-10"), utc("2026-08-24"), "DAILY");
    expect(status.kind).toBe("STALE");
    if (status.kind === "STALE") {
      expect(status.businessDaysOld).toBeGreaterThan(status.toleranceDays);
    }
  });

  it("tolère beaucoup plus longtemps un fonds mensuel", () => {
    // Le même écart qui périme un fonds quotidien est normal pour un mensuel.
    const ecart = { from: utc("2026-07-24"), to: utc("2026-08-24") };
    expect(evaluateNavStatus(ecart.from, ecart.to, "DAILY").kind).toBe("STALE");
    expect(evaluateNavStatus(ecart.from, ecart.to, "MONTHLY").kind).toBe("CURRENT");
  });

  it("prolonge la tolérance quand des jours fériés s'intercalent", () => {
    const holidays: HolidayCalendar = new Set([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
    ]);
    // Quatre fériés consécutifs : la NAV de vendredi reste à jour le vendredi
    // suivant.
    expect(evaluateNavStatus(utc("2026-08-21"), utc("2026-08-28"), "DAILY", holidays).kind).toBe(
      "CURRENT",
    );
  });

  it("signale une NAV datée dans le futur", () => {
    // L'afficher comme fraîche masquerait un défaut de la source.
    expect(evaluateNavStatus(utc("2026-08-25"), utc("2026-08-24"), "DAILY")).toEqual({
      kind: "FUTURE_DATED",
    });
  });

  it("reste prudent sur une fréquence inconnue", () => {
    // Alarmer à tort sur un fonds dont on ignore le rythme serait pire que
    // d'attendre un peu.
    expect(toleranceFor("UNKNOWN")).toBeGreaterThan(toleranceFor("DAILY"));
  });

  it("ordonne les tolérances par fréquence", () => {
    expect(toleranceFor("DAILY")).toBeLessThan(toleranceFor("WEEKLY"));
    expect(toleranceFor("WEEKLY")).toBeLessThan(toleranceFor("BIWEEKLY"));
    expect(toleranceFor("BIWEEKLY")).toBeLessThan(toleranceFor("MONTHLY"));
  });
});

describe("libellés de fréquence", () => {
  it("libelle chaque fréquence", () => {
    for (const frequency of NAV_FREQUENCIES) {
      expect(NAV_FREQUENCY_LABEL[frequency]).toBeTruthy();
    }
  });
});
