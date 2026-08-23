import { describe, expect, it } from "vitest";

import { toDecimalString, type DecimalString } from "@portfolio-lab/domain";

import {
  decimalSeparator,
  formatAmount,
  formatMoney,
  formatPercent,
  formatQuantity,
  NUMERIC_LOCALE,
  signOf,
} from "./format.js";

const d = (value: string): DecimalString => toDecimalString(value);

/** Normalise les espaces insécables (U+00A0, U+202F) produits par Intl. */
const normalize = (value: string): string => value.replace(/[\u00a0\u202f]/g, " ");

describe("formatMoney", () => {
  it("formate un montant CHF à la suisse : apostrophe de milliers, point décimal", () => {
    expect(normalize(formatMoney(d("1234.5"), "CHF"))).toBe("CHF 1'234.50");
  });

  it("formate le JPY sans décimale", () => {
    const output = normalize(formatMoney(d("1234.56"), "JPY"));
    expect(output).toContain("1'235");
    expect(output).not.toContain(".");
  });

  it("n'altère pas la précision au-delà de l'affichage", () => {
    const value = d("0.005");
    formatMoney(value, "CHF");
    expect(value).toBe("0.005");
  });

  it("formate une valeur négative", () => {
    expect(normalize(formatMoney(d("-42.1"), "USD"))).toContain("42.10");
  });

  it("formate une très grande valeur sans perte de séparateurs", () => {
    expect(normalize(formatMoney(d("9876543210.99"), "CHF"))).toBe("CHF 9'876'543'210.99");
  });
});

describe("formatPercent", () => {
  it("affiche un tiret pour une variation inconnue", () => {
    expect(formatPercent(null)).toBe("—");
  });

  it("affiche un signe explicite pour une hausse", () => {
    expect(normalize(formatPercent(d("0.0123")))).toBe("+1.23%");
  });

  it("affiche un signe explicite pour une baisse", () => {
    expect(normalize(formatPercent(d("-0.0456")))).toBe("-4.56%");
  });

  it("n'affiche pas de signe pour zéro", () => {
    expect(normalize(formatPercent(d("0")))).toBe("0.00%");
  });
});

describe("cohérence de la locale numérique", () => {
  /*
   * Garde-fou contre une régression subtile : `fr-CH` formate la devise avec un
   * point décimal mais les pourcentages avec une virgule. Une valeur et sa
   * variation apparaîtraient alors avec deux conventions différentes sur le
   * même écran. Ce test échoue si la locale retenue réintroduit ce mélange.
   */
  function separatorOf(formatted: string): string {
    const match = /\d([.,])\d/.exec(formatted);
    return match?.[1] ?? "";
  }

  it("utilise le même séparateur décimal pour les montants et les pourcentages", () => {
    const money = separatorOf(formatMoney(d("1234.56"), "CHF"));
    const percent = separatorOf(formatPercent(d("0.0123")));
    expect(money).toBe(percent);
    expect(money).toBe(decimalSeparator());
  });

  it("documente fr-CH comme incohérent, ce qui justifie le choix de de-CH", () => {
    const frMoney = separatorOf(formatMoney(d("1234.56"), "CHF", "fr-CH"));
    const frPercent = separatorOf(formatPercent(d("0.0123"), "fr-CH"));
    expect(frMoney).not.toBe(frPercent);
    expect(NUMERIC_LOCALE).toBe("de-CH");
  });
});

describe("signOf", () => {
  it("classe correctement les trois cas", () => {
    expect(signOf(d("1"))).toBe("positive");
    expect(signOf(d("-1"))).toBe("negative");
    expect(signOf(d("0"))).toBe("neutral");
    expect(signOf(d("-0"))).toBe("neutral");
  });
});

describe("formatQuantity", () => {
  it("retire les zéros de queue d'un numeric(30, 12)", () => {
    // PostgreSQL renvoie « 2.000000000000 » pour une quantité de 2.
    expect(normalize(formatQuantity(d("2.000000000000")))).toBe("2");
  });

  it("conserve la précision réellement significative", () => {
    expect(normalize(formatQuantity(d("150.750000000000")))).toBe("150.75");
  });

  it("conserve une très petite fraction", () => {
    expect(normalize(formatQuantity(d("0.000000000001")))).toBe("0.000000000001");
  });

  it("groupe les milliers à la suisse", () => {
    expect(normalize(formatQuantity(d("5000.000000000000")))).toBe("5'000");
  });

  it("gère une quantité négative", () => {
    expect(normalize(formatQuantity(d("-10.000000000000")))).toBe("-10");
  });

  it("gère zéro", () => {
    expect(normalize(formatQuantity(d("0")))).toBe("0");
  });

  it("ne produit jamais de notation exponentielle", () => {
    expect(formatQuantity(d("0.000000000001"))).not.toContain("e");
  });
});

describe("formatAmount", () => {
  it("garde les décimales de la devise sans en afficher le code", () => {
    expect(formatAmount(d("17800"), "CHF")).toBe("17'800.00");
    expect(formatAmount(d("1103.6"), "CHF")).toBe("1'103.60");
  });

  it("suit le nombre de décimales de la devise", () => {
    // Le yen n'a pas de subdivision courante.
    expect(formatAmount(d("17800"), "JPY")).toBe("17'800");
  });

  it("conserve le signe des montants négatifs", () => {
    expect(formatAmount(d("-250.5"), "CHF")).toBe("-250.50");
  });

  it("produit la même chose que formatMoney, code de devise en moins", () => {
    const withCode = formatMoney(d("17800"), "CHF");
    expect(withCode).toContain(formatAmount(d("17800"), "CHF"));
    expect(withCode).toContain("CHF");
  });
});
