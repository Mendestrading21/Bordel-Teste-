import { describe, expect, it } from "vitest";

import { createAccountSchema, createPositionSchema, toFieldErrors } from "./validation";

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
