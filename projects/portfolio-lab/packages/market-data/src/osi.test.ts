import { describe, expect, it } from "vitest";

import { toDecimalString, type DecimalString } from "@portfolio-lab/domain";

import { buildOsiSymbol, isSameContract, OsiFormatError, parseOsiSymbol } from "./osi.js";

const d = (value: string): DecimalString => toDecimalString(value);

describe("buildOsiSymbol", () => {
  it("construit un symbole canonique de 21 caractères", () => {
    const symbol = buildOsiSymbol({
      underlying: "AAPL",
      expiration: "2027-01-15",
      optionType: "CALL",
      strike: d("200"),
    });
    expect(symbol).toBe("AAPL  270115C00200000");
    expect(symbol).toHaveLength(21);
  });

  it("complète la racine par des espaces à droite", () => {
    expect(
      buildOsiSymbol({
        underlying: "F",
        expiration: "2027-01-15",
        optionType: "PUT",
        strike: d("12.5"),
      }),
    ).toBe("F     270115P00012500");
  });

  it("gère une racine de six caractères sans espace", () => {
    const symbol = buildOsiSymbol({
      underlying: "ABCDEF",
      expiration: "2027-06-18",
      optionType: "CALL",
      strike: d("50"),
    });
    expect(symbol.slice(0, 6)).toBe("ABCDEF");
  });

  it("encode le strike en millièmes exacts", () => {
    // Passer par un flottant produirait 199999 au lieu de 200000 sur certaines
    // valeurs, et le contrat résultant n'existerait pas.
    expect(
      buildOsiSymbol({
        underlying: "X",
        expiration: "2027-01-15",
        optionType: "CALL",
        strike: d("0.001"),
      }).slice(-8),
    ).toBe("00000001");

    expect(
      buildOsiSymbol({
        underlying: "X",
        expiration: "2027-01-15",
        optionType: "CALL",
        strike: d("1234.567"),
      }).slice(-8),
    ).toBe("01234567");
  });

  it("refuse un strike plus fin que le millième", () => {
    expect(() =>
      buildOsiSymbol({
        underlying: "X",
        expiration: "2027-01-15",
        optionType: "CALL",
        strike: d("0.0001"),
      }),
    ).toThrow(OsiFormatError);
  });

  it("refuse un strike nul ou négatif", () => {
    for (const strike of ["0", "-10"]) {
      expect(() =>
        buildOsiSymbol({
          underlying: "X",
          expiration: "2027-01-15",
          optionType: "CALL",
          strike: d(strike),
        }),
      ).toThrow(OsiFormatError);
    }
  });

  it("refuse une racine invalide ou trop longue", () => {
    for (const underlying of ["", "TROPLONG", "aapl", "AA PL"]) {
      expect(() =>
        buildOsiSymbol({
          underlying,
          expiration: "2027-01-15",
          optionType: "CALL",
          strike: d("100"),
        }),
      ).toThrow(OsiFormatError);
    }
  });

  it("refuse une échéance hors format ISO", () => {
    expect(() =>
      buildOsiSymbol({
        underlying: "X",
        expiration: "15/01/2027",
        optionType: "CALL",
        strike: d("100"),
      }),
    ).toThrow(OsiFormatError);
  });
});

describe("parseOsiSymbol", () => {
  it("relit un symbole construit", () => {
    const components = {
      underlying: "AAPL",
      expiration: "2027-01-15",
      optionType: "CALL" as const,
      strike: d("200"),
    };
    const parsed = parseOsiSymbol(buildOsiSymbol(components));
    expect(parsed).toEqual({ ...components, strike: "200" });
  });

  it("relit un strike fractionnaire", () => {
    expect(parseOsiSymbol("F     270115P00012500")?.strike).toBe("12.5");
  });

  it("distingue call et put", () => {
    expect(parseOsiSymbol("AAPL  270115C00200000")?.optionType).toBe("CALL");
    expect(parseOsiSymbol("AAPL  270115P00200000")?.optionType).toBe("PUT");
  });

  it("refuse une date inexistante que le motif laisserait passer", () => {
    // `270230` a la bonne forme mais le 30 février n'existe pas.
    expect(parseOsiSymbol("AAPL  270230C00200000")).toBeNull();
  });

  it.each([
    ["chaîne vide", ""],
    ["trop court", "AAPL  270115C0020000"],
    ["type invalide", "AAPL  270115X00200000"],
    ["strike non numérique", "AAPL  270115CXXXXXXXX"],
    ["date non numérique", "AAPL  27O115C00200000"],
  ])("renvoie null pour un symbole %s", (_label, symbol) => {
    // Un symbole illisible reçu d'un fournisseur est une donnée à écarter,
    // pas une erreur de programmation.
    expect(parseOsiSymbol(symbol)).toBeNull();
  });

  it("accepte les minuscules en les normalisant", () => {
    expect(parseOsiSymbol("aapl  270115c00200000")?.underlying).toBe("AAPL");
  });
});

describe("isSameContract", () => {
  it("reconnaît deux écritures du même contrat", () => {
    expect(isSameContract("AAPL  270115C00200000", "AAPL  270115C00200000")).toBe(true);
  });

  it("distingue deux strikes différents", () => {
    // Deux contrats qui ne diffèrent que par le strike ont des valeurs sans
    // rapport.
    expect(isSameContract("AAPL  270115C00200000", "AAPL  270115C00210000")).toBe(false);
  });

  it("distingue call et put", () => {
    expect(isSameContract("AAPL  270115C00200000", "AAPL  270115P00200000")).toBe(false);
  });

  it("distingue deux échéances", () => {
    expect(isSameContract("AAPL  270115C00200000", "AAPL  270618C00200000")).toBe(false);
  });

  it("distingue deux sous-jacents", () => {
    expect(isSameContract("AAPL  270115C00200000", "MSFT  270115C00200000")).toBe(false);
  });

  it("refuse de comparer un symbole illisible", () => {
    expect(isSameContract("AAPL  270115C00200000", "n'importe quoi")).toBe(false);
  });
});
