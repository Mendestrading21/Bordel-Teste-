import { describe, expect, it } from "vitest";

import { ConflictError, ForbiddenError, NotFoundError, translateDatabaseError } from "./errors.js";

/** Reproduit la forme d'une erreur du pilote `pg`. */
function pgError(code: string, detail: string): Error & { code: string } {
  return Object.assign(new Error(detail), { code });
}

describe("translateDatabaseError", () => {
  it("traduit une violation d'unicité", () => {
    expect(() =>
      translateDatabaseError(
        pgError("23505", 'duplicate key value violates unique constraint "portfolios_unique"'),
        "Le portefeuille",
      ),
    ).toThrow(ConflictError);
  });

  it("traduit une violation de clé étrangère", () => {
    expect(() => translateDatabaseError(pgError("23503", "fk"), "La position")).toThrow(
      /référence une ressource inexistante/,
    );
  });

  it("traduit une violation de contrainte de validation", () => {
    expect(() => translateDatabaseError(pgError("23514", "check"), "La position")).toThrow(
      /règles de validation/,
    );
  });

  it("ne recopie pas le détail PostgreSQL dans le message utilisateur", () => {
    try {
      translateDatabaseError(
        pgError("23505", "Key (user_id, name)=(11111111-...., Secret) already exists"),
        "Le portefeuille",
      );
      expect.unreachable("translateDatabaseError aurait dû lever");
    } catch (error) {
      // Un message de contrainte expose des noms de colonnes et des valeurs
      // réelles : il ne doit jamais atteindre l'interface.
      expect((error as Error).message).toBe("Le portefeuille existe déjà");
      expect((error as Error).message).not.toContain("user_id");
    }
  });

  it("relance telle quelle une erreur inconnue", () => {
    const unknown = pgError("XX000", "erreur interne inattendue");
    expect(() => translateDatabaseError(unknown, "La position")).toThrow(unknown);
  });

  it("relance une valeur qui n'est pas une erreur PostgreSQL", () => {
    // Avaler ce cas masquerait un vrai défaut derrière un message générique.
    expect(() => translateDatabaseError(new TypeError("bug applicatif"), "X")).toThrow(TypeError);
  });
});

describe("erreurs applicatives", () => {
  it("portent un nom exploitable et un message en français", () => {
    expect(new NotFoundError("Le portefeuille").name).toBe("NotFoundError");
    expect(new NotFoundError("Le portefeuille").message).toBe("Le portefeuille introuvable");
    expect(new ForbiddenError("ce compte").message).toBe("Accès refusé à ce compte");
    expect(new ConflictError("déjà pris").name).toBe("ConflictError");
  });
});
