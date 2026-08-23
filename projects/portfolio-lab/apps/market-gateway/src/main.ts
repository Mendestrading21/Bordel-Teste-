import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createGatewayServer } from "./server.js";

/**
 * Point d'entrée de la passerelle de marché.
 *
 * Au Lot 01, le processus n'ouvre aucune connexion fournisseur : il valide sa
 * configuration, expose `/health` et s'arrête proprement. Les WebSockets
 * fournisseurs arrivent au Lot 05.
 */
function main(): void {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const server = createGatewayServer(config, logger);

  server.listen(config.port, () => {
    logger.info("passerelle de marché démarrée", {
      port: config.port,
      provider: config.provider,
    });
  });

  const shutdown = (signal: string): void => {
    logger.info("arrêt demandé", { signal });
    server.close(() => process.exit(0));
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main();
