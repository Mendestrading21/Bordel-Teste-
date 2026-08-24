import { describe, expect, it } from "vitest";

import { toDecimalString, type DecimalString } from "@portfolio-lab/domain";

import { unitPriceFromValue } from "./unit-price";

const d = (value: string): DecimalString => toDecimalString(value);

describe("unitPriceFromValue", () => {
  it("retrouve le cours d'une position simple", () => {
    expect(unitPriceFromValue(d("1250.00"), d("10"), d("1"))).toBe("125");
  });

  it("tient compte du multiplicateur d'une option", () => {
    // 2 contrats × 100 × 3.25 = 650 : sans le multiplicateur, on afficherait
    // un cours de 325, cent fois trop élevé.
    expect(unitPriceFromValue(d("650"), d("2"), d("100"))).toBe("3.25");
  });

  it("garde un cours positif sur une position vendue à découvert", () => {
    expect(unitPriceFromValue(d("-500"), d("-4"), d("1"))).toBe("125");
  });

  it("refuse de diviser par une quantité nulle", () => {
    expect(unitPriceFromValue(d("0"), d("0"), d("1"))).toBeNull();
  });

  it("refuse de diviser par un multiplicateur nul", () => {
    expect(unitPriceFromValue(d("100"), d("10"), d("0"))).toBeNull();
  });

  it("garde la précision configurée du moteur sur un quotient non fini", () => {
    // 33 chiffres significatifs : la précision de `decimal.js` fixée par le
    // domaine, et non un arrondi d'affichage décidé ici.
    expect(unitPriceFromValue(d("1000.000000"), d("3"), d("1"))).toBe(
      "333.3333333333333333333333333333333",
    );
  });
});
