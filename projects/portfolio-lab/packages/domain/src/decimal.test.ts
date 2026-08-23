import { describe, expect, it } from "vitest";

import {
  decimal,
  Decimal,
  fromDecimal,
  InvalidDecimalError,
  isDecimalString,
  sumDecimals,
  toDecimalString,
  ZERO,
  type DecimalString,
} from "./decimal.js";

const d = (value: string): DecimalString => toDecimalString(value);

describe("isDecimalString", () => {
  it.each(["0", "-0", "12", "-12", "0.5", "-3.14159", "1234567890.000000000001"])(
    "accepte %s",
    (value) => {
      expect(isDecimalString(value)).toBe(true);
    },
  );

  it.each(["", " ", "1e5", "1E5", ".5", "5.", "NaN", "Infinity", "1,5", "0x10", "--1"])(
    "refuse %s",
    (value) => {
      expect(isDecimalString(value)).toBe(false);
    },
  );

  it("refuse les valeurs non textuelles", () => {
    expect(isDecimalString(1)).toBe(false);
    expect(isDecimalString(null)).toBe(false);
    expect(isDecimalString(undefined)).toBe(false);
  });
});

describe("toDecimalString", () => {
  it("renvoie la chaîne inchangée quand elle est valide", () => {
    expect(toDecimalString("42.50")).toBe("42.50");
  });

  it("lève InvalidDecimalError sur une notation exponentielle", () => {
    expect(() => toDecimalString("1e10")).toThrow(InvalidDecimalError);
  });
});

describe("decimal / fromDecimal", () => {
  it("effectue une addition exacte là où le flottant échoue", () => {
    // 0.1 + 0.2 === 0.30000000000000004 en IEEE-754.
    expect(fromDecimal(decimal(d("0.1")).plus(decimal(d("0.2"))))).toBe("0.3");
  });

  it("préserve une très petite valeur sans notation exponentielle", () => {
    expect(fromDecimal(decimal(d("0.000000000001")))).toBe("0.000000000001");
  });

  it("préserve une très grande valeur sans notation exponentielle", () => {
    const huge = d("123456789012345678901.123456789");
    expect(fromDecimal(decimal(huge))).toBe("123456789012345678901.123456789");
  });

  it("accepte une Decimal déjà construite", () => {
    expect(fromDecimal(decimal(new Decimal("7.25")))).toBe("7.25");
  });

  it("refuse une valeur non finie", () => {
    expect(() => fromDecimal(new Decimal(Infinity))).toThrow(InvalidDecimalError);
    expect(() => fromDecimal(new Decimal(NaN))).toThrow(InvalidDecimalError);
  });

  it("utilise l'arrondi bancaire au-delà de la précision configurée", () => {
    // 34 chiffres significatifs : le 35e est arrondi, pas tronqué.
    const result = decimal(d("1")).div(decimal(d("3")));
    expect(result.toFixed(34)).toBe("0.3333333333333333333333333333333333");
  });
});

describe("sumDecimals", () => {
  it("renvoie zéro pour une liste vide", () => {
    expect(sumDecimals([])).toBe(ZERO);
  });

  it("additionne exactement des centimes", () => {
    const cents = Array.from({ length: 100 }, () => d("0.01"));
    expect(sumDecimals(cents)).toBe("1");
  });

  it("gère les valeurs négatives", () => {
    expect(sumDecimals([d("10.5"), d("-3.25"), d("-7.25")])).toBe("0");
  });
});
