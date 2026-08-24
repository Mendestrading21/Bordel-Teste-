import { describe, expect, it } from "vitest";

import { classifyQuery, isValidCusip, referenceFromQuery } from "./query-classification.js";

describe("isValidCusip", () => {
  it("accepte des CUSIP réels", () => {
    // Apple, Microsoft, Tesla.
    for (const cusip of ["037833100", "594918104", "88160R101"]) {
      expect(isValidCusip(cusip), cusip).toBe(true);
    }
  });

  it("refuse un CUSIP dont la clé de contrôle est fausse", () => {
    /*
     * Sans la clé, un ticker de neuf caractères serait pris pour un CUSIP et
     * envoyé comme identifiant, ce qui résoudrait un autre titre ou rien.
     */
    expect(isValidCusip("037833101")).toBe(false);
    expect(isValidCusip("037833109")).toBe(false);
  });

  it("refuse une longueur ou des caractères invalides", () => {
    for (const bad of ["03783310", "0378331000", "037833 10", "", "AAPL"]) {
      expect(isValidCusip(bad), bad).toBe(false);
    }
  });
});

describe("classifyQuery", () => {
  it("reconnaît un ISIN valide", () => {
    const result = classifyQuery("US0378331005");
    expect(result.kind).toBe("ISIN");
    expect(result.normalized).toBe("US0378331005");
  });

  it("ne prend pas un ISIN fauté pour un ISIN", () => {
    // Envoyer un ISIN fauté peut résoudre un AUTRE instrument, ce qui est pire
    // qu'une absence de résultat.
    expect(classifyQuery("US0378331006").kind).not.toBe("ISIN");
  });

  it("tolère les espaces dans un identifiant recopié", () => {
    expect(classifyQuery("US 0378 3310 05").kind).toBe("ISIN");
  });

  it("reconnaît un CUSIP validé par sa clé", () => {
    expect(classifyQuery("037833100").kind).toBe("CUSIP");
  });

  it("reconnaît un FIGI", () => {
    const result = classifyQuery("BBG000B9XRY4");
    expect(result.kind).toBe("FIGI");
    expect(result.normalized).toBe("BBG000B9XRY4");
  });

  it("reconnaît un symbole d'option OSI avant d'y voir un ticker", () => {
    /*
     * Un symbole OSI désigne un contrat précis. Le classer comme ticker
     * perdrait l'échéance, le strike et le sens du contrat.
     */
    const result = classifyQuery("AAPL  260116C00150000");
    expect(result.kind).toBe("OPTION_OSI");
  });

  it("reconnaît un future avant d'y voir un ticker", () => {
    // `ESZ26` classé comme action perdrait l'échéance de décembre 2026.
    expect(classifyQuery("ESZ26").kind).toBe("FUTURES");
    expect(classifyQuery("NQH27").kind).toBe("FUTURES");
  });

  it("reconnaît un ticker ordinaire", () => {
    for (const ticker of ["AAPL", "NESN", "BTC", "BRK.B"]) {
      expect(classifyQuery(ticker).kind, ticker).toBe("TICKER");
    }
  });

  it("traite un texte avec espace comme un nom", () => {
    // « Pictet Water » n'est pas un ticker.
    for (const name of ["Pictet Water", "Apple Inc", "S&P 500", "Nestlé SA"]) {
      expect(classifyQuery(name).kind, name).toBe("NAME");
    }
  });

  it("traite une saisie vide sans planter", () => {
    expect(classifyQuery("   ").kind).toBe("NAME");
    expect(classifyQuery("   ").normalized).toBe("");
  });

  it("donne une raison affichable", () => {
    // « on a reconnu un ISIN valide » aide l'utilisateur à comprendre pourquoi
    // la recherche n'a pas fait ce qu'il attendait.
    expect(classifyQuery("US0378331005").reason).toMatch(/ISIN/);
    expect(classifyQuery("037833100").reason).toMatch(/CUSIP/);
    expect(classifyQuery("Pictet Water").reason).toMatch(/libre/);
  });

  it("classe chaque saisie une seule fois, sans chevauchement", () => {
    /*
     * Garde-fou d'ordre : la spécificité doit décroître. Si le ticker était
     * testé en premier, ISIN, CUSIP, FIGI et futures tomberaient tous dans
     * « TICKER », leur forme s'y prêtant.
     */
    const cases: Record<string, string> = {
      US0378331005: "ISIN",
      "037833100": "CUSIP",
      BBG000B9XRY4: "FIGI",
      ESZ26: "FUTURES",
      AAPL: "TICKER",
      "Apple Inc": "NAME",
    };
    for (const [input, expected] of Object.entries(cases)) {
      expect(classifyQuery(input).kind, input).toBe(expected);
    }
  });
});

describe("referenceFromQuery", () => {
  it("transforme un identifiant unique en référence directe", () => {
    expect(referenceFromQuery(classifyQuery("US0378331005"))).toEqual({
      kind: "ISIN",
      isin: "US0378331005",
    });
    expect(referenceFromQuery(classifyQuery("BBG000B9XRY4"))).toEqual({
      kind: "FIGI",
      figi: "BBG000B9XRY4",
    });
  });

  it("laisse ticker et nom passer par la recherche", () => {
    /*
     * Un ticker ou un nom peut désigner plusieurs titres : ils doivent
     * traverser la recherche, qui rend des candidats, et non une résolution
     * qui en choisirait un.
     */
    expect(referenceFromQuery(classifyQuery("AAPL"))).toBeNull();
    expect(referenceFromQuery(classifyQuery("Apple Inc"))).toBeNull();
  });
});
