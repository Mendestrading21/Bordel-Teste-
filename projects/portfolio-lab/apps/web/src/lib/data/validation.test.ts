import { describe, expect, it } from "vitest";

import { createAccountSchema, createInstrumentSchema, createPositionSchema, toFieldErrors } from "./validation";

const validPosition = {
  accountId: "11111111-1111-4111-8111-111111111111",
  instrumentId: "22222222-2222-4222-8222-222222222222",
  quantity: "10",
  averageCost: "142.50",
  costCurrency: "CHF",
};

describe("createPositionSchema", () => {
  it("accepte une position valide", () => {
    expect(createPositionSchema.safeParse(validPosition).success).toBe(true);
  });

  it("accepte la virgule décimale, usage courant en Suisse romande", () => {
    const parsed = createPositionSchema.parse({ ...validPosition, averageCost: "142,50" });
    expect(parsed.averageCost).toBe("142.50");
  });

  it("refuse une quantité nulle", () => {
    // Une position à zéro est une position fermée, qui se supprime.
    const result = createPositionSchema.safeParse({ ...validPosition, quantity: "0" });
    expect(result.success).toBe(false);
  });

  it("accepte une quantité négative pour une position vendeuse", () => {
    expect(createPositionSchema.safeParse({ ...validPosition, quantity: "-10" }).success).toBe(
      true,
    );
  });

  it("refuse un coût moyen négatif", () => {
    // Le sens de la position est porté par le signe de la quantité, pas par
    // celui du prix payé.
    expect(createPositionSchema.safeParse({ ...validPosition, averageCost: "-1" }).success).toBe(
      false,
    );
  });

  it("accepte un coût moyen nul", () => {
    expect(createPositionSchema.safeParse({ ...validPosition, averageCost: "0" }).success).toBe(
      true,
    );
  });

  it("refuse la notation exponentielle", () => {
    // Elle contournerait la validation décimale du domaine.
    expect(createPositionSchema.safeParse({ ...validPosition, quantity: "1e5" }).success).toBe(
      false,
    );
  });

  it("refuse une devise non supportée", () => {
    expect(createPositionSchema.safeParse({ ...validPosition, costCurrency: "XYZ" }).success).toBe(
      false,
    );
  });

  it("refuse un identifiant de compte qui n'est pas un UUID", () => {
    expect(createPositionSchema.safeParse({ ...validPosition, accountId: "1" }).success).toBe(
      false,
    );
  });

  it("conserve la quantité en chaîne, sans conversion en nombre", () => {
    // Une conversion en `number` détruirait la précision avant même que la
    // valeur atteigne la couche métier.
    const parsed = createPositionSchema.parse({
      ...validPosition,
      quantity: "150.750000000000",
    });
    expect(parsed.quantity).toBe("150.750000000000");
    expect(typeof parsed.quantity).toBe("string");
  });

  it("normalise des notes vides en null", () => {
    expect(createPositionSchema.parse({ ...validPosition, notes: "   " }).notes).toBeNull();
  });

  it("refuse des notes trop longues", () => {
    expect(
      createPositionSchema.safeParse({ ...validPosition, notes: "x".repeat(2001) }).success,
    ).toBe(false);
  });
});

describe("createAccountSchema", () => {
  it("accepte un nom simple", () => {
    expect(createAccountSchema.parse({ name: "Swissquote Actions" }).name).toBe(
      "Swissquote Actions",
    );
  });

  it("refuse un nom vide ou uniquement des espaces", () => {
    expect(createAccountSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("normalise un libellé d'établissement vide en null", () => {
    expect(
      createAccountSchema.parse({ name: "X", institutionLabel: "" }).institutionLabel,
    ).toBeNull();
  });

  it("ne demande aucun identifiant bancaire", () => {
    // Le schéma n'a délibérément aucun champ de credentials : il n'existe pas
    // de chemin de code capable d'en recevoir.
    const keys = Object.keys(createAccountSchema.shape);
    expect(keys).toEqual(["name", "institutionLabel"]);
  });
});

describe("toFieldErrors", () => {
  it("produit un message par champ", () => {
    const result = createPositionSchema.safeParse({ ...validPosition, quantity: "abc" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toFieldErrors(result.error)).toHaveProperty("quantity");
    }
  });

  it("conserve le premier message quand un champ cumule les erreurs", () => {
    const result = createPositionSchema.safeParse({ quantity: "", averageCost: "" });
    if (!result.success) {
      const fields = toFieldErrors(result.error);
      expect(Object.values(fields).every((message) => typeof message === "string")).toBe(true);
    }
  });
});

describe("createInstrumentSchema", () => {
  const base = { name: "Apple Inc", assetType: "STOCK", currency: "USD" };

  it("accepte un instrument sans identifiant", () => {
    const result = createInstrumentSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("accepte un ticker avec sa place", () => {
    const result = createInstrumentSchema.safeParse({
      ...base,
      exchangeMic: "xnas",
      identifierType: "TICKER",
      identifierValue: "AAPL",
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("saisie attendue valide");
    // Le code de place est normalisé : « xnas » et « XNAS » sont la même place.
    expect(result.data.exchangeMic).toBe("XNAS");
  });

  /*
   * Un type sans valeur, ou une valeur sans type, produirait une ligne
   * d'identifiant inutilisable : l'instrument paraîtrait coté automatiquement
   * et resterait muet. Mieux vaut un instrument franchement manuel.
   */
  it("refuse un identifiant à moitié rempli", () => {
    const sansValeur = createInstrumentSchema.safeParse({ ...base, identifierType: "TICKER" });
    expect(sansValeur.success).toBe(false);

    const sansType = createInstrumentSchema.safeParse({ ...base, identifierValue: "AAPL" });
    expect(sansType.success).toBe(false);
  });

  /*
   * Un ISIN mal formé serait envoyé tel quel au fournisseur et pourrait
   * résoudre un autre titre — la base le refuse aussi, mais bien plus tard et
   * par un message incompréhensible.
   */
  it("refuse un ISIN mal formé", () => {
    const result = createInstrumentSchema.safeParse({
      ...base,
      identifierType: "ISIN",
      identifierValue: "PAS-UN-ISIN",
    });
    expect(result.success).toBe(false);
  });

  it("accepte un ISIN valide", () => {
    const result = createInstrumentSchema.safeParse({
      ...base,
      identifierType: "ISIN",
      identifierValue: "US0378331005",
    });
    expect(result.success).toBe(true);
  });

  /*
   * Un symbole propriétaire n'existe que dans le référentiel de celui qui l'a
   * émis : sans son nom, il ne désigne rien.
   */
  it("exige le nom du fournisseur pour un symbole propriétaire", () => {
    const sans = createInstrumentSchema.safeParse({
      ...base,
      identifierType: "PROVIDER_SYMBOL",
      identifierValue: "AAPL.US",
    });
    expect(sans.success).toBe(false);

    const avec = createInstrumentSchema.safeParse({
      ...base,
      identifierType: "PROVIDER_SYMBOL",
      identifierValue: "AAPL.US",
      identifierProvider: "eodhd",
    });
    expect(avec.success).toBe(true);
  });

  /*
   * L'alphabet est celui du périmètre du jeton temps réel. Un symbole qui en
   * sortirait serait accepté ici puis silencieusement écarté du canal, et la
   * ligne ne serait jamais cotée sans que rien ne le dise.
   */
  it("refuse un symbole hors de l'alphabet du canal temps réel", () => {
    for (const bad of ["AAPL,TSLA", "AA PL", "AAPL/US"]) {
      const result = createInstrumentSchema.safeParse({
        ...base,
        identifierType: "TICKER",
        identifierValue: bad,
      });
      expect(result.success, `« ${bad} » devrait être refusé`).toBe(false);
    }
  });

  it("refuse un code de place qui n'a pas quatre caractères", () => {
    const result = createInstrumentSchema.safeParse({ ...base, exchangeMic: "XNA" });
    expect(result.success).toBe(false);
  });

  it("refuse un nom vide", () => {
    expect(createInstrumentSchema.safeParse({ ...base, name: "   " }).success).toBe(false);
  });
});
