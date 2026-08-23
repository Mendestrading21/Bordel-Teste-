import { describe, expect, it } from "vitest";

import { describeAge } from "./offline-age.js";

const NOW = new Date("2026-05-04T17:35:00.000Z");

function ago(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

describe("describeAge", () => {
  it("évite la fausse précision sous la minute", () => {
    expect(describeAge(ago(0), NOW)).toBe("il y a moins d'une minute");
    expect(describeAge(ago(0.5), NOW)).toBe("il y a moins d'une minute");
  });

  it("accorde le singulier et le pluriel", () => {
    expect(describeAge(ago(1), NOW)).toBe("il y a 1 minute");
    expect(describeAge(ago(2), NOW)).toBe("il y a 2 minutes");
    expect(describeAge(ago(60), NOW)).toBe("il y a 1 heure");
    expect(describeAge(ago(120), NOW)).toBe("il y a 2 heures");
    expect(describeAge(ago(1_440), NOW)).toBe("il y a 1 jour");
    expect(describeAge(ago(2_880), NOW)).toBe("il y a 2 jours");
  });

  it("change d'unité au seuil, pas avant", () => {
    expect(describeAge(ago(59), NOW)).toBe("il y a 59 minutes");
    expect(describeAge(ago(1_439), NOW)).toBe("il y a 23 heures");
  });

  it("arrondit vers le bas", () => {
    expect(describeAge(ago(90), NOW)).toBe("il y a 1 heure");
  });

  it("ne produit pas de durée négative pour une horloge client en avance", () => {
    expect(describeAge(new Date(NOW.getTime() + 5_000), NOW)).toBe("il y a moins d'une minute");
  });
});
