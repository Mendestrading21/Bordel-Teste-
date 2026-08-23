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
  /** Les connexions fournisseurs arrivent au Lot 05. */
  readonly liveChannel: "not-implemented";
};

export function buildHealthPayload(config: GatewayConfig, uptimeSeconds: number): HealthPayload {
  return {
    status: "ok",
    service: "market-gateway",
    provider: config.provider,
    uptimeSeconds: Math.floor(uptimeSeconds),
    liveChannel: "not-implemented",
  };
}

export function createGatewayServer(
  config: GatewayConfig,
  logger: Logger,
  uptime: () => number = () => process.uptime(),
): Server {
  return createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      const body = JSON.stringify(buildHealthPayload(config, uptime()));
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
