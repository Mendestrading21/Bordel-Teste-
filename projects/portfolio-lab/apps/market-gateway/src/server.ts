import { createServer, type Server } from "node:http";

import type { GatewayConfig } from "./config.js";
import type { Logger } from "./logger.js";

/**
 * Charge utile de l'endpoint de santé.
 *
 * Volontairement pauvre : elle expose l'état du processus, jamais la
 * configuration détaillée ni le nom d'une clé.
 */
export type HealthPayload = {
  readonly status: "ok";
  readonly service: "market-gateway";
  readonly provider: GatewayConfig["provider"];
  readonly uptimeSeconds: number;
  /**
   * État du canal temps réel.
   *
   * `disabled` quand aucun secret partagé n'est configuré : le canal refuse
   * alors toute connexion, ce qui doit être visible sans avoir à lire les
   * journaux.
   */
  readonly liveChannel: "ready" | "disabled";
  readonly connectedClients: number;
};

export function buildHealthPayload(
  config: GatewayConfig,
  uptimeSeconds: number,
  connectedClients = 0,
): HealthPayload {
  return {
    status: "ok",
    service: "market-gateway",
    provider: config.provider,
    uptimeSeconds: Math.floor(uptimeSeconds),
    liveChannel: config.sharedSecret === undefined ? "disabled" : "ready",
    connectedClients,
  };
}

export function createGatewayServer(
  config: GatewayConfig,
  logger: Logger,
  uptime: () => number = () => process.uptime(),
  connectedClients: () => number = () => 0,
): Server {
  return createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      const body = JSON.stringify(buildHealthPayload(config, uptime(), connectedClients()));
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(body);
      return;
    }

    logger.debug("requête non routée", { method: request.method, url: request.url });
    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "not_found" }));
  });
}
