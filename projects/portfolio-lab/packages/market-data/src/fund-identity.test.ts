import { describe, expect, it } from "vitest";

import type { CurrencyCode } from "@portfolio-lab/domain";

import type { InstrumentCandidate } from "./contract.js";
import {
  isinCountry,
  isValidIsin,
  parseShareClass,
  resolveFundCandidate,
} from "./fund-identity.js";

function candidate(overrides: Partial<InstrumentCandidate> = {}): InstrumentCandidate {
  return {
    provider: "test",
    providerSymbol: "FUND",
    name: "Fonds Test",
    assetType: "MUTUAL_FUND",
    currency: "EUR",
    exchangeMic: null,
    isin: "LU0104884860",
    figi: null,
    countryCode: "LU",
    confidence: 0.9,
    ...overrides,
  };
}

describe("isValidIsin", () => {
  it.each([
    ["US0378331005", "Apple"],
    ["CH0038863350", "Nestlé"],
    ["LU0104884860", "Pictet Water P"],
    ["IE00B4L5Y983", "iShares Core MSCI World"],
    ["NL0010273215", "ASML"],
  ])("accepte %s (%s)", (isin) => {
    expect(isValidIsin(isin)).toBe(true);
  });

  it("refuse une clé de contrôle fausse", () => {
    // Une faute de frappe envoyée telle quelle à un fournisseur pourrait
    // résoudre un AUTRE instrument — pire qu'une absence de résultat.
    expect(isValidIsin("US0378331006")).toBe(false);
  });

  it.each([
    ["trop court", "US037833100"],
    ["trop long", "US03783310055"],
    ["minuscules", "us0378331005"],
    ["pays numérique", "120378331005"],
    ["clé non numérique", "US037833100X"],
    ["vide", ""],
  ])("refuse un ISIN %s", (_label, isin) => {
    expect(isValidIsin(isin)).toBe(false);
  });
});

describe("isinCountry", () => {
  it("extrait le pays d'un ISIN valide", () => {
    expect(isinCountry("LU0104884860")).toBe("LU");
    expect(isinCountry("CH0038863350")).toBe("CH");
  });

  it("renvoie null pour un ISIN invalide", () => {
    expect(isinCountry("US0378331006")).toBeNull();
  });
});

describe("parseShareClass", () => {
  it("repère la classe en fin de nom", () => {
    expect(parseShareClass("Pictet - Water P EUR", "EUR").label).toBe("P");
    expect(parseShareClass("Pictet - Water I EUR", "EUR").label).toBe("I");
  });

  it("détecte la capitalisation et la distribution", () => {
    expect(parseShareClass("Fonds X P acc EUR", "EUR").accumulating).toBe(true);
    expect(parseShareClass("Fonds X P dist EUR", "EUR").accumulating).toBe(false);
  });

  it("ne se prononce pas quand rien ne l'indique", () => {
    // Une heuristique qui trancherait à la place de l'utilisateur finirait par
    // se tromper sur un fonds au nom inhabituel.
    expect(parseShareClass("Fonds sans indication", "EUR").accumulating).toBeNull();
  });

  it("conserve la devise fournie sans la déduire du nom", () => {
    expect(parseShareClass("Fonds X P EUR", "USD").currency).toBe("USD");
  });
});

describe("resolveFundCandidate", () => {
  const waterP = candidate({
    name: "Pictet - Water P EUR",
    isin: "LU0104884860",
    currency: "EUR",
  });
  const waterI = candidate({
    name: "Pictet - Water I EUR",
    isin: "LU0104884787",
    currency: "EUR",
    providerSymbol: "FUND-I",
  });

  it("ne trouve rien dans une liste vide", () => {
    expect(resolveFundCandidate([], { isin: "LU0104884860" })).toEqual({ kind: "NOT_FOUND" });
  });

  it("résout sur correspondance exacte d'ISIN", () => {
    const result = resolveFundCandidate([waterP, waterI], { isin: "LU0104884860" });
    expect(result.kind).toBe("RESOLVED");
    if (result.kind === "RESOLVED") {
      expect(result.candidate.name).toBe("Pictet - Water P EUR");
    }
  });

  it("ne substitue JAMAIS une classe de parts voisine", () => {
    /*
     * C'est le risque central des fonds : « Water P » et « Water I » ne
     * diffèrent que par une lettre, et leurs NAV s'écartent de plusieurs
     * pourcents. Renvoyer le « plus proche » produirait un portefeuille
     * plausible mais durablement faux.
     */
    const result = resolveFundCandidate([waterI], { isin: "LU0104884860" });
    expect(result).toEqual({ kind: "NOT_FOUND" });
  });

  it("reste ambigu si plusieurs candidats portent le même ISIN", () => {
    // Cas d'un fonds coté sur plusieurs places.
    const surAutrePlace = { ...waterP, providerSymbol: "FUND-XPAR", exchangeMic: "XPAR" };
    const result = resolveFundCandidate([waterP, surAutrePlace], { isin: "LU0104884860" });
    expect(result.kind).toBe("AMBIGUOUS");
    if (result.kind === "AMBIGUOUS") {
      expect(result.candidates).toHaveLength(2);
    }
  });

  it("signale une devise contredisant l'ISIN plutôt que de l'accepter", () => {
    const result = resolveFundCandidate([{ ...waterP, currency: "USD" as CurrencyCode }], {
      isin: "LU0104884860",
      currency: "EUR",
    });
    expect(result.kind).toBe("MISMATCH");
    if (result.kind === "MISMATCH") {
      expect(result.reason).toBe("CURRENCY");
    }
  });

  it("accepte une devise conforme", () => {
    expect(resolveFundCandidate([waterP], { isin: "LU0104884860", currency: "EUR" }).kind).toBe(
      "RESOLVED",
    );
  });

  it("reste ambigu sans ISIN quand plusieurs candidats subsistent", () => {
    // Sans ISIN, on ne devine jamais.
    expect(resolveFundCandidate([waterP, waterI], {}).kind).toBe("AMBIGUOUS");
  });

  it("résout sans ISIN si la devise ne laisse qu'un candidat", () => {
    const enDollar = { ...waterI, currency: "USD" as CurrencyCode };
    const result = resolveFundCandidate([waterP, enDollar], { currency: "USD" });
    expect(result.kind).toBe("RESOLVED");
    if (result.kind === "RESOLVED") {
      expect(result.candidate.currency).toBe("USD");
    }
  });

  it("ne trouve rien si la devise demandée n'existe pas", () => {
    expect(resolveFundCandidate([waterP, waterI], { currency: "JPY" })).toEqual({
      kind: "NOT_FOUND",
    });
  });
});
