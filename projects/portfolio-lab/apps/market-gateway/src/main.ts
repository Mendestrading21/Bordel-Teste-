import {
  createMockProvider,
  DEMO_FX_RATES,
  DEMO_INSTRUMENTS,
  type MarketDataProvider,
} from "@portfolio-lab/market-data";

import { loadConfig, type GatewayConfig } from "./config.js";
import { createLogger, type Logger } from "./logger.js";
import { CircuitBreaker, DEFAULT_BACKOFF } from "./live/backoff.js";
import { GatewayCore } from "./live/gateway.js";
import { DEFAULT_STALE_THRESHOLDS, QuoteCache } from "./live/quote-cache.js";
import { SubscriptionRegistry, DEFAULT_SUBSCRIPTION_LIMITS } from "./live/subscriptions.js";
import type { ServerMessage } from "./live/protocol.js";
import { createLiveChannel } from "./live/ws-server.js";
import { createGatewayServer } from "./server.js";

/**
 * Point d'entrée de la passerelle de marché.
 *
 * Le processus est séparé de la PWA pour une raison unique et non négociable :
 * maintenir des connexions WebSocket vers les fournisseurs sans jamais exposer
 * leurs clés au navigateur.
 */

/**
 * Instancie le fournisseur configuré.
 *
 * Seul `mock` est disponible : aucun adaptateur réel n'est implémenté, faute de
 * clé et d'accès réseau aux fournisseurs. Demander un fournisseur non
 * implémenté échoue au démarrage plutôt que de retomber silencieusement sur des
 * données simulées — une application qui affiche du simulé en croyant afficher
 * du réel est pire qu'une application qui refuse de démarrer.
 */
function createProvider(config: GatewayConfig, logger: Logger): MarketDataProvider {
  if (config.provider !== "mock") {
    throw new Error(
      `Fournisseur « ${config.provider} » demandé mais son adaptateur n'est pas implémenté. ` +
        "Voir docs/market-data-integration.md.",
    );
  }
  logger.warn("fournisseur simulé actif", {
    note: "Aucune donnée n'est un cours de marché ; toutes sont marquées MANUAL ou NAV.",
  });
  // Sans instruments, la passerelle démarrerait mais ne résoudrait jamais rien :
  // les positions de démonstration resteraient sans cours.
  return createMockProvider({ instruments: DEMO_INSTRUMENTS, fxRates: DEMO_FX_RATES });
}

function main(): void {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const provider = createProvider(config, logger);

  const now = (): number => Date.now();
  const subscriptions = new SubscriptionRegistry({
    graceMs: 30_000,
    now,
    ...DEFAULT_SUBSCRIPTION_LIMITS,
  });
  const cache = new QuoteCache({ staleAfterMs: DEFAULT_STALE_THRESHOLDS, now });

  let channelClientCount = (): number => 0;

  /*
   * Le cœur et le canal se référencent mutuellement : le cœur émet vers le
   * canal, le canal délègue au cœur. On casse le cycle par une indirection
   * explicite plutôt qu'en laissant un stub silencieux, qui avalerait tous les
   * messages si le canal n'était jamais créé.
   */
  let deliver: ((clientId: string, message: ServerMessage) => void) | null = null;

  const core = new GatewayCore({
    provider,
    cache,
    subscriptions,
    backoff: DEFAULT_BACKOFF,
    circuit: new CircuitBreaker({ failureThreshold: 5, openDurationMs: 60_000, now }),
    now,
    send: (clientId, message) => {
      if (deliver === null) {
        logger.warn("message ignoré : canal temps réel inactif", { type: message.type });
        return;
      }
      deliver(clientId, message);
    },
    log: (level, message, context) => logger[level](message, context),
  });

  const server = createGatewayServer(
    config,
    logger,
    () => process.uptime(),
    () => channelClientCount(),
  );

  if (config.sharedSecret === undefined) {
    // Un canal sans secret accepterait n'importe quel jeton : le refus est la
    // seule position sûre.
    logger.warn("canal temps réel désactivé", {
      reason: "MARKET_GATEWAY_SHARED_SECRET n'est pas défini",
    });
  } else {
    const channel = createLiveChannel({
      httpServer: server,
      core,
      provider,
      sharedSecret: config.sharedSecret,
      logger,
      now,
      maxConnectionsPerUser: config.maxConnectionsPerUser,
    });
    channelClientCount = channel.clientCount;
    deliver = channel.send;

    process.on("beforeExit", () => {
      void channel.close();
    });
  }

  server.listen(config.port, () => {
    logger.info("passerelle de marché démarrée", {
      port: config.port,
      provider: config.provider,
      liveChannel: config.sharedSecret === undefined ? "disabled" : "ready",
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
