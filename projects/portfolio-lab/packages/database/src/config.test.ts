import { describe, expect, it } from "vitest";

import { DatabaseConfigError, loadDatabaseConfig, redactConnectionString } from "./config.js";

const VALID_URL = "postgresql://user:motdepasse@db.example.com:5432/portfolio";

describe("loadDatabaseConfig", () => {
  it("lit DATABASE_URL et applique les valeurs par défaut", () => {
    const config = loadDatabaseConfig({ DATABASE_URL: VALID_URL });
    expect(config.connectionString).toBe(VALID_URL);
    expect(config.poolSize).toBe(10);
    expect(config.statementTimeoutMs).toBe(10_000);
  });

  it("échoue si DATABASE_URL est absent", () => {
    expect(() => loadDatabaseConfig({})).toThrow(DatabaseConfigError);
  });

  it("refuse une taille de pool hors plage", () => {
    expect(() => loadDatabaseConfig({ DATABASE_URL: VALID_URL, DATABASE_POOL_SIZE: "0" })).toThrow(
      DatabaseConfigError,
    );
    expect(() =>
      loadDatabaseConfig({ DATABASE_URL: VALID_URL, DATABASE_POOL_SIZE: "500" }),
    ).toThrow(DatabaseConfigError);
  });

  it("ne recopie jamais le mot de passe dans le message d'erreur", () => {
    try {
      loadDatabaseConfig({ DATABASE_URL: "pas-une-url-avec-motdepasse-secret" });
      expect.unreachable("loadDatabaseConfig aurait dû échouer");
    } catch (error) {
      expect((error as Error).message).not.toContain("motdepasse-secret");
      expect((error as Error).message).toContain("connectionString");
    }
  });
});

describe("redactConnectionString", () => {
  it("masque le mot de passe", () => {
    const redacted = redactConnectionString(VALID_URL);
    expect(redacted).not.toContain("motdepasse");
    expect(redacted).toContain("***");
    // L'hôte et la base restent lisibles : c'est ce qui rend le journal utile.
    expect(redacted).toContain("db.example.com");
    expect(redacted).toContain("portfolio");
  });

  it("laisse intacte une URL sans mot de passe", () => {
    const url = "postgresql://user@localhost:5432/portfolio";
    expect(redactConnectionString(url)).not.toContain("***");
  });

  it("renvoie une chaîne neutre si l'URL est illisible", () => {
    // Ne jamais renvoyer l'entrée brute : elle pourrait contenir un secret sous
    // une forme que le parseur n'a pas su lire.
    const result = redactConnectionString("://cassé:motdepasse@@@");
    expect(result).toBe("[chaîne de connexion illisible]");
    expect(result).not.toContain("motdepasse");
  });
});
