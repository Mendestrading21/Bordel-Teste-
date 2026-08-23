import { describe, expect, it } from "vitest";

import { createLogger, type LogLevel } from "./logger.js";

const ENV = {
  TWELVE_DATA_API_KEY: "cle-fictive-twelve-data-123456",
  DATABASE_URL: "postgresql://user:motdepasse@hote:5432/base",
};

const AT = new Date("2026-05-04T17:35:00.000Z");

function capture(level: LogLevel = "debug") {
  const lines: string[] = [];
  const logger = createLogger(
    level,
    (line) => lines.push(line),
    () => AT,
    ENV,
  );
  return { logger, lines, parsed: () => lines.map((line) => JSON.parse(line) as unknown) };
}

describe("createLogger", () => {
  it("émet une ligne JSON horodatée", () => {
    const { logger, parsed } = capture();
    logger.info("valorisation terminée", { route: "/analyse", durationMs: 12 });

    expect(parsed()[0]).toEqual({
      ts: "2026-05-04T17:35:00.000Z",
      level: "info",
      message: "valorisation terminée",
      route: "/analyse",
      durationMs: 12,
    });
  });

  it("respecte le seuil de niveau", () => {
    const { logger, lines } = capture("warn");
    logger.debug("bruit");
    logger.info("bruit");
    logger.warn("à voir");
    logger.error("grave");

    expect(lines).toHaveLength(2);
  });

  it("n'écrit jamais un montant, même nommé innocemment", () => {
    const { logger, lines } = capture();
    logger.info("total calculé", { totalMarketValueBase: "32343.8925" });

    expect(lines[0]).not.toContain("32343");
    expect(lines[0]).toContain("[expurgé]");
  });

  it("expurge une clé présente dans le message lui-même", () => {
    const { logger, lines } = capture();
    logger.error(`appel refusé : apikey=${ENV.TWELVE_DATA_API_KEY}`);

    expect(lines[0]).not.toContain("twelve-data-123456");
    expect(lines[0]).toContain("[expurgé]");
  });

  it("expurge la chaîne de connexion et donc le mot de passe", () => {
    const { logger, lines } = capture();
    logger.error(`connexion impossible : ${ENV.DATABASE_URL}`);

    expect(lines[0]).not.toContain("motdepasse");
  });

  it("réduit les identifiants du message comme du contexte", () => {
    const { logger, parsed } = capture();
    logger.info("position d0000000-0000-4000-8000-00000000b001 supprimée", {
      userId: "11111111-1111-4111-8111-111111111111",
    });

    expect(parsed()[0]).toMatchObject({
      message: "position d0000000… supprimée",
      userId: "11111111…",
    });
  });

  it("produit une ligne parsable même quand tout est expurgé", () => {
    const { logger, lines } = capture();
    logger.error(ENV.TWELVE_DATA_API_KEY, { valeur: ENV.TWELVE_DATA_API_KEY });

    expect(() => JSON.parse(lines[0] as string)).not.toThrow();
  });

  it("écrit sur stdout par défaut sans que les tests en dépendent", () => {
    // Le journal par défaut existe ; les tests fournissent le leur pour ne pas
    // polluer la sortie de la suite.
    expect(() => createLogger("error")).not.toThrow();
  });
});
