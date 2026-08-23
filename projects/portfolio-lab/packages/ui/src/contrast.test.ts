import { describe, expect, it } from "vitest";

import { contrastRatio, parseHex, relativeLuminance, WCAG_AA_NORMAL_TEXT } from "./contrast.js";
import { colorTokens } from "./tokens.js";

describe("contrastRatio", () => {
  it("vaut 21 entre noir et blanc", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  });

  it("vaut 1 pour une couleur avec elle-même", () => {
    expect(contrastRatio("#C87F4A", "#C87F4A")).toBeCloseTo(1, 10);
  });

  it("est symétrique", () => {
    expect(contrastRatio("#0B0E11", "#ECEFF3")).toBeCloseTo(
      contrastRatio("#ECEFF3", "#0B0E11"),
      10,
    );
  });

  it("refuse une couleur mal formée", () => {
    expect(() => parseHex("#FFF")).toThrow();
    expect(() => relativeLuminance("rouge")).toThrow();
  });
});

describe("tokens — accessibilité AA sur le fond obsidienne", () => {
  const readableOnCanvas = [
    "textPrimary",
    "textSecondary",
    "accentCopper",
    "positive",
    "negative",
    "warning",
    "stale",
  ] as const;

  it.each(readableOnCanvas)("%s atteint AA texte normal sur backgroundCanvas", (token) => {
    const ratio = contrastRatio(colorTokens[token], colorTokens.backgroundCanvas);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it.each(readableOnCanvas)("%s atteint AA texte normal sur backgroundElevated", (token) => {
    const ratio = contrastRatio(colorTokens[token], colorTokens.backgroundElevated);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("distingue positive et negative autrement que par la seule teinte", () => {
    // Garde-fou : les deux couleurs doivent rester nettement différentes pour
    // que le daltonisme rouge/vert ne rende pas la lecture ambiguë. Le signe
    // textuel reste de toute façon obligatoire dans l'interface.
    expect(colorTokens.positive).not.toBe(colorTokens.negative);
    const gap = Math.abs(
      relativeLuminance(colorTokens.positive) - relativeLuminance(colorTokens.negative),
    );
    expect(gap).toBeGreaterThan(0.05);
  });
});
