import { describe, expect, it } from "vitest";

import {
  BASE_CURRENCY,
  displayFractionDigits,
  isCurrencyCode,
  SUPPORTED_CURRENCIES,
} from "./currency.js";

describe("currency", () => {
  it("consolide en CHF", () => {
    expect(BASE_CURRENCY).toBe("CHF");
    expect(SUPPORTED_CURRENCIES).toContain("CHF");
  });

  it("reconnaît les devises supportées", () => {
    expect(isCurrencyCode("USD")).toBe(true);
    expect(isCurrencyCode("EUR")).toBe(true);
  });

  it("refuse un code inconnu ou mal casé", () => {
    expect(isCurrencyCode("XYZ")).toBe(false);
    expect(isCurrencyCode("chf")).toBe(false);
    expect(isCurrencyCode(840)).toBe(false);
  });

  it("expose 2 décimales par défaut et 0 pour le JPY", () => {
    expect(displayFractionDigits("CHF")).toBe(2);
    expect(displayFractionDigits("USD")).toBe(2);
    expect(displayFractionDigits("JPY")).toBe(0);
  });
});
