import { describe, expect, it } from "vitest";

import { createLogger } from "./logger.js";

const FIXED_NOW = (): Date => new Date("2026-03-02T10:15:00.000Z");

function capture(level: Parameters<typeof createLogger>[0]) {
  const lines: string[] = [];
  const logger = createLogger(level, (line) => lines.push(line), FIXED_NOW);
  return { lines, logger };
}

describe("createLogger", () => {
  it("émet du JSON horodaté", () => {
    const { lines, logger } = capture("info");
    logger.info("démarré", { port: 4100 });
    expect(JSON.parse(lines[0] ?? "{}")).toEqual({
      ts: "2026-03-02T10:15:00.000Z",
      level: "info",
      message: "démarré",
      port: 4100,
    });
  });

  it("filtre les niveaux sous le seuil", () => {
    const { lines, logger } = capture("warn");
    logger.debug("invisible");
    logger.info("invisible");
    logger.warn("visible");
    logger.error("visible aussi");
    expect(lines).toHaveLength(2);
  });

  it("expurge un secret présent dans le contexte", () => {
    const previous = process.env["MASSIVE_API_KEY"];
    process.env["MASSIVE_API_KEY"] = "mv_live_secret_998877";
    try {
      const { lines, logger } = capture("debug");
      logger.error("échec fournisseur", { url: "wss://x/?key=mv_live_secret_998877" });
      expect(lines[0]).not.toContain("mv_live_secret_998877");
      expect(lines[0]).toContain("[expurgé]");
    } finally {
      if (previous === undefined) {
        delete process.env["MASSIVE_API_KEY"];
      } else {
        process.env["MASSIVE_API_KEY"] = previous;
      }
    }
  });
});
