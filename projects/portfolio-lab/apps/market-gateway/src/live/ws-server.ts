import { randomUUID } from "node:crypto";
import type { Server } from "node:http";

import { WebSocketServer, type WebSocket } from "ws";

import type { MarketDataProvider, ResolvedInstrument } from "@portfolio-lab/market-data";

import type { Logger } from "../logger.js";
import { verifyChannelToken } from "./channel-auth.js";
import type { GatewayCore } from "./gateway.js";
import {
  BROADCAST_THROTTLE_MS,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  parseClientMessage,
  type ServerMessage,
} from "./protocol.js";

/**
 * Canal WebSocket authentifié.
 *
 * Le jeton est transmis dans le **sous-protocole** WebSocket plutôt que dans la
 * chaîne de requête : une URL atterrit dans les journaux d'accès du serveur et
 * des proxies intermédiaires, un en-tête non.
 *
 * Le navigateur ne reçoit jamais de clé fournisseur ; il présente un jeton de
 * courte durée émis par son propre backend.
 */

export type WsServerOptions = {
  readonly httpServer: Server;
  readonly core: GatewayCore;
  readonly provider: MarketDataProvider;
  readonly sharedSecret: string;
  readonly logger: Logger;
  readonly now: () => number;
  /** Nombre maximal de connexions simultanées par utilisateur. */
  readonly maxConnectionsPerUser: number;
};

type ClientState = {
  readonly id: string;
  readonly userId: string;
  readonly socket: WebSocket;
  /** Dernier signe de vie, pour détecter une connexion morte. */
  lastSeenAt: number;
};

const TOKEN_PROTOCOL_PREFIX = "portfolio-lab.token.";

/** Extrait le jeton du sous-protocole annoncé par le client. */
export function extractToken(protocols: readonly string[]): string | null {
  for (const protocol of protocols) {
    if (protocol.startsWith(TOKEN_PROTOCOL_PREFIX)) {
      const token = protocol.slice(TOKEN_PROTOCOL_PREFIX.length);
      return token === "" ? null : token;
    }
  }
  return null;
}

export function createLiveChannel(options: WsServerOptions): {
  readonly close: () => Promise<void>;
  readonly clientCount: () => number;
  /** Émetteur à brancher sur `GatewayCore.send`. */
  readonly send: (clientId: string, message: ServerMessage) => void;
} {
  const clients = new Map<string, ClientState>();
  const wss = new WebSocketServer({ noServer: true });

  function send(clientId: string, message: ServerMessage): void {
    const client = clients.get(clientId);
    // `readyState === 1` correspond à OPEN ; écrire sur une socket fermée
    // lèverait plutôt que d'échouer silencieusement.
    if (client !== undefined && client.socket.readyState === 1) {
      client.socket.send(JSON.stringify(message));
    }
  }

  function connectionsOf(userId: string): number {
    let count = 0;
    for (const client of clients.values()) {
      if (client.userId === userId) {
        count += 1;
      }
    }
    return count;
  }

  options.httpServer.on("upgrade", (request, socket, head) => {
    if (request.url !== "/live") {
      socket.destroy();
      return;
    }

    const protocols = (request.headers["sec-websocket-protocol"] ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "");

    const token = extractToken(protocols);
    if (token === null) {
      // 401 avant l'upgrade : ouvrir la socket pour la refermer aussitôt
      // gaspillerait un aller-retour et brouillerait les journaux.
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const verification = verifyChannelToken(token, options.sharedSecret, options.now());
    if (!verification.valid) {
      // Le motif n'est pas renvoyé au client : distinguer « expiré » de « mal
      // signé » renseignerait un attaquant sur la validité de sa signature.
      options.logger.warn("connexion refusée", { reason: verification.reason });
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    if (connectionsOf(verification.userId) >= options.maxConnectionsPerUser) {
      options.logger.warn("trop de connexions simultanées", { userId: verification.userId });
      socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      const client: ClientState = {
        id: randomUUID(),
        userId: verification.userId,
        socket: ws,
        lastSeenAt: options.now(),
      };
      clients.set(client.id, client);
      options.logger.info("client connecté", { clients: clients.size });

      options.core.onClientConnected(client.id);

      ws.on("message", (raw: Buffer) => {
        client.lastSeenAt = options.now();
        const message = parseClientMessage(raw.toString("utf8"));

        if (message === null) {
          send(client.id, {
            type: "error",
            code: "MALFORMED",
            message: "Message non reconnu.",
          });
          return;
        }

        if (message.type === "ping") {
          send(client.id, { type: "pong" });
          return;
        }

        const toSubscribe = options.core.onClientSubscribe(client.id, message.symbols);
        if (toSubscribe.length > 0) {
          void subscribeUpstream(toSubscribe);
        }
      });

      ws.on("close", () => {
        clients.delete(client.id);
        options.core.onClientDisconnected(client.id);
        options.logger.info("client déconnecté", { clients: clients.size });
      });

      ws.on("error", (error: Error) => {
        options.logger.warn("erreur de socket client", { message: error.message });
      });
    });
  });

  /**
   * Ouvre les souscriptions amont manquantes.
   *
   * Le fournisseur simulé n'expose que `getSnapshot` ; un adaptateur réel
   * fournira `subscribe`. Les deux chemins passent par `onProviderQuote`, si
   * bien que le reste de la passerelle ne distingue pas les deux cas.
   */
  async function subscribeUpstream(symbols: readonly string[]): Promise<void> {
    const instruments: ResolvedInstrument[] = [];
    for (const symbol of symbols) {
      const resolved = await options.provider.resolve({
        kind: "PROVIDER_SYMBOL",
        provider: options.provider.id,
        symbol,
      });
      if (resolved !== null) {
        instruments.push(resolved);
      }
    }

    if (instruments.length === 0) {
      return;
    }

    try {
      if (options.provider.subscribe !== undefined) {
        await options.provider.subscribe(instruments, (quote) => {
          options.core.onProviderQuote(quote);
        });
        return;
      }
      for (const instrument of instruments) {
        options.core.onProviderQuote(await options.provider.getSnapshot(instrument));
      }
    } catch (error) {
      // Le message d'erreur amont peut contenir une clé recopiée ; le logger
      // l'expurge avant écriture.
      options.logger.error("échec de souscription amont", {
        message: (error as Error).message,
      });
      options.core.notifyProviderDown([...clients.keys()]);
    }
  }

  const broadcastTimer = setInterval(() => options.core.flush(), BROADCAST_THROTTLE_MS);

  const heartbeatTimer = setInterval(() => {
    const now = options.now();
    for (const client of clients.values()) {
      if (now - client.lastSeenAt > HEARTBEAT_TIMEOUT_MS) {
        // Une connexion morte qui n'est jamais fermée retient ses abonnements
        // et fausse le compte de connexions par utilisateur.
        options.logger.info("connexion silencieuse fermée", { clientId: client.id });
        client.socket.terminate();
        clients.delete(client.id);
        options.core.onClientDisconnected(client.id);
      }
    }
    options.core.collectGarbage();
  }, HEARTBEAT_INTERVAL_MS);

  // `unref` empêche ces minuteries de maintenir le processus en vie à elles
  // seules, ce qui bloquerait un arrêt propre.
  broadcastTimer.unref();
  heartbeatTimer.unref();

  return {
    send,
    clientCount: () => clients.size,
    close: async (): Promise<void> => {
      clearInterval(broadcastTimer);
      clearInterval(heartbeatTimer);
      for (const client of clients.values()) {
        client.socket.close(1001, "Arrêt de la passerelle");
      }
      clients.clear();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}
