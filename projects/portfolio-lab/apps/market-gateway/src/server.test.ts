import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { buildHealthPayload, createGatewayServer } from "./server.js";

const config = loadConfig({});
const logger = createLogger("error", () => {});

describe("buildHealthPayload", () => {
  it("annonce l'état sans exposer la configuration détaillée", () => {
    const payload = buildHealthPayload(config, 12.9, 3);
    expect(payload).toEqual({
      status: "ok",
      service: "market-gateway",
      provider: "mock",
      uptimeSeconds: 12,
      liveChannel: "disabled",
      connectedClients: 3,
    });
  });

  it("annonce le canal désactivé quand aucun secret partagé n'est configuré", () => {
    // Un canal sans secret accepterait n'importe quel jeton ; l'état doit être
    // visible sans avoir à lire les journaux.
    expect(buildHealthPayload(config, 0).liveChannel).toBe("disabled");
  });

  it("annonce le canal prêt dès qu'un secret est configuré", () => {
    const withSecret = loadConfig({
      MARKET_GATEWAY_SHARED_SECRET: "un-secret-partage-de-plus-de-32-caracteres",
    });
    expect(buildHealthPayload(withSecret, 0).liveChannel).toBe("ready");
  });

  it("n'expose ni le secret ni le nom des variables de configuration", () => {
    const withSecret = loadConfig({
      MARKET_GATEWAY_SHARED_SECRET: "un-secret-partage-de-plus-de-32-caracteres",
    });
    const serialized = JSON.stringify(buildHealthPayload(withSecret, 0));
    expect(serialized).not.toContain("un-secret-partage");
    expect(serialized).not.toContain("SHARED_SECRET");
  });
});

describe("createGatewayServer", () => {
  async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
    const server = createGatewayServer(config, logger, () => 5);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("adresse d'écoute inattendue");
    }
    try {
      return await run(`http://127.0.0.1:${address.port}`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it("répond 200 sur /health, sans cache", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({ status: "ok", service: "market-gateway" });
    });
  });

  it("répond 404 sur une route inconnue", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/quotes`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    });
  });
});
