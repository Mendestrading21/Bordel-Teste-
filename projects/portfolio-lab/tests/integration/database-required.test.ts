import { describe, expect, it } from "vitest";

import { hasTestDatabase } from "../helpers/database.js";

/**
 * Garde-fou contre un succès silencieux.
 *
 * Les suites base de données s'ignorent quand `DATABASE_URL_TEST` est absent —
 * c'est voulu pour qu'un développeur sans PostgreSQL puisse lancer le reste.
 * Mais en CI, un saut silencieux ferait passer la vérification RLS pour verte
 * alors qu'elle n'a jamais tourné. Ce test transforme ce cas en échec.
 */
describe("prérequis des tests d'intégration", () => {
  it("exige une base PostgreSQL de test en intégration continue", () => {
    if (process.env["CI"] === undefined || process.env["CI"] === "") {
      // Hors CI, on se contente de signaler l'état.
      expect(typeof hasTestDatabase).toBe("boolean");
      return;
    }
    expect(
      hasTestDatabase,
      "DATABASE_URL_TEST doit être défini en CI, sinon les tests RLS sont ignorés " +
        "et la vérification d'isolation ne prouve rien.",
    ).toBe(true);
  });
});
