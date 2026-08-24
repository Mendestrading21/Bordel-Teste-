import { createServer, type Server } from "node:http";
import { type AddressInfo } from "node:net";

import WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMockProvider, type MockInstrument } from "@portfolio-lab/market-data";

import { createLogger } from "../logger.js";
import { CircuitBreaker, DEFAULT_BACKOFF } from "./backoff.js";
import { issueChannelToken } from "./channel-auth.js";
import { GatewayCore } from "./gateway.js";
import { DEFAULT_STALE_THRESHOLDS, QuoteCache } from "./quote-cache.js";
import { extractToken, createLiveChannel } from "./ws-server.js";
import type { ServerMessage } from "./protocol.js";
import { SubscriptionRegistry, DEFAULT_SUBSCRIPTION_LIMITS } from "./subscriptions.js";

/**
 * Canal temps réel de bout en bout, sur de vraies sockets.
 *
 * Ce qui est vérifié ici ne peut pas l'être autrement : la négociation du
 * sous-protocole, le refus avant upgrade, et le fait qu'un tick fournisseur
 * atteigne réellement un navigateur.
 */

const SECRET = "un-secret-partage-de-plus-de-32-caracteres";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";

const INSTRUMENTS: MockInstrument[] = [
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    assetType: "STOCK",
    currency: "USD",
    exchangeMic: "XNAS",
    isin: "US0378331005",
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corp.",
    assetType: "STOCK",
    currency: "USD",
    exchangeMic: "XNAS",
    isin: "US5949181045",
  },
];

describe("extractToken", () => {
  it("lit le jeton dans le sous-protocole", () => {
    expect(extractToken(["portfolio-lab.token.abc123"])).toBe("abc123");
  });

  it("ignore les autres sous-protocoles", () => {
    expect(extractToken(["json", "portfolio-lab.token.xyz"])).toBe("xyz");
  });

  it("renvoie null en l'absence de jeton", () => {
    expect(extractToken(["json"])).toBeNull();
    expect(extractToken([])).toBeNull();
    expect(extractToken(["portfolio-lab.token."])).toBeNull();
  });
});

describe("canal temps réel", () => {
  let httpServer: Server;
  let channel: ReturnType<typeof createLiveChannel>;
  let core: GatewayCore;
  let baseUrl: string;
  let clock = Date.parse("2026-06-15T14:00:00.000Z");

  beforeEach(async () => {
    clock = Date.parse("2026-06-15T14:00:00.000Z");
    httpServer = createServer((_request, response) => {
      response.writeHead(404);
      response.end();
    });

    const now = (): number => clock;
    const provider = createMockProvider({ instruments: INSTRUMENTS, now: () => new Date(clock) });
    const subscriptions = new SubscriptionRegistry({
      graceMs: 30_000,
      now,
      ...DEFAULT_SUBSCRIPTION_LIMITS,
    });
    const cache = new QuoteCache({ staleAfterMs: DEFAULT_STALE_THRESHOLDS, now });

    let deliver: ((clientId: string, message: ServerMessage) => void) | null = null;

    core = new GatewayCore({
      provider,
      cache,
      subscriptions,
      backoff: DEFAULT_BACKOFF,
      circuit: new CircuitBreaker({ failureThreshold: 5, openDurationMs: 60_000, now }),
      now,
      send: (clientId, message) => deliver?.(clientId, message),
      log: () => {},
    });

    channel = createLiveChannel({
      httpServer,
      core,
      provider,
      sharedSecret: SECRET,
      logger: createLogger("error", () => {}),
      now,
      maxConnectionsPerUser: 2,
    });
    deliver = channel.send;

    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address() as AddressInfo;
    baseUrl = `ws://127.0.0.1:${address.port}/live`;
  });

  afterEach(async () => {
    await channel.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function connect(token: string): WebSocket {
    return new WebSocket(baseUrl, [`portfolio-lab.token.${token}`]);
  }

  /** Attend le prochain message d'un type donné, ou échoue au bout du délai. */
  function waitFor(socket: WebSocket, type: ServerMessage["type"], timeoutMs = 3_000) {
    return new Promise<ServerMessage>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Aucun message « ${type} »`)), timeoutMs);
      socket.on("message", (raw: Buffer) => {
        const message = JSON.parse(raw.toString("utf8")) as ServerMessage;
        if (message.type === type) {
          clearTimeout(timer);
          resolve(message);
        }
      });
      socket.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function expectRejection(socket: WebSocket): Promise<Error> {
    return new Promise((resolve) => socket.on("error", resolve));
  }

  describe("authentification", () => {
    it("accepte une connexion avec un jeton valide", async () => {
      const socket = connect(issueChannelToken(USER, SECRET, clock));
      const welcome = await waitFor(socket, "welcome");
      expect(welcome).toMatchObject({ type: "welcome", provider: "mock" });
      socket.close();
    });

    it("refuse une connexion sans jeton", async () => {
      const socket = new WebSocket(baseUrl);
      await expect(expectRejection(socket)).resolves.toBeInstanceOf(Error);
    });

    it("refuse un jeton signé avec un autre secret", async () => {
      const forged = issueChannelToken(USER, "un-autre-secret-de-plus-de-32-caracteres!", clock);
      const socket = connect(forged);
      await expect(expectRejection(socket)).resolves.toBeInstanceOf(Error);
    });

    it("refuse un jeton expiré", async () => {
      const token = issueChannelToken(USER, SECRET, clock, 1_000);
      clock += 2_000;
      const socket = connect(token);
      await expect(expectRejection(socket)).resolves.toBeInstanceOf(Error);
    });

    it("limite le nombre de connexions par utilisateur", async () => {
      const token = issueChannelToken(USER, SECRET, clock);
      const first = connect(token);
      await waitFor(first, "welcome");
      const second = connect(token);
      await waitFor(second, "welcome");

      // La troisième dépasse la limite de 2.
      const third = connect(token);
      await expect(expectRejection(third)).resolves.toBeInstanceOf(Error);

      first.close();
      second.close();
    });

    it("compte les connexions par utilisateur, pas globalement", async () => {
      const a = connect(issueChannelToken(USER, SECRET, clock));
      await waitFor(a, "welcome");
      const b = connect(issueChannelToken(OTHER_USER, SECRET, clock));
      await waitFor(b, "welcome");
      const c = connect(issueChannelToken(OTHER_USER, SECRET, clock));
      await waitFor(c, "welcome");

      expect(channel.clientCount()).toBe(3);
      a.close();
      b.close();
      c.close();
    });
  });

  describe("flux de cours", () => {
    it("achemine un tick fournisseur jusqu'au client", async () => {
      // C'est le critère d'acceptation du Lot 05.
      const socket = connect(issueChannelToken(USER, SECRET, clock));
      await waitFor(socket, "welcome");

      const quotes = waitFor(socket, "quotes");
      socket.send(JSON.stringify({ type: "subscribe", symbols: ["AAPL"] }));

      const message = await quotes;
      expect(message).toMatchObject({ type: "quotes" });
      if (message.type === "quotes") {
        expect(message.quotes[0]?.providerSymbol).toBe("AAPL");
        // Une donnée simulée ne peut pas se présenter comme un cours de marché.
        expect(message.quotes[0]?.freshness).toBe("MANUAL");
      }
      socket.close();
    });

    it("répond pong à un ping", async () => {
      const socket = connect(issueChannelToken(USER, SECRET, clock));
      await waitFor(socket, "welcome");
      const pong = waitFor(socket, "pong");
      socket.send(JSON.stringify({ type: "ping" }));
      await expect(pong).resolves.toMatchObject({ type: "pong" });
      socket.close();
    });

    it("rejette un message malformé sans exposer la structure attendue", async () => {
      const socket = connect(issueChannelToken(USER, SECRET, clock));
      await waitFor(socket, "welcome");
      const error = waitFor(socket, "error");
      socket.send("ceci n'est pas du JSON");

      const message = await error;
      expect(message).toMatchObject({ type: "error", code: "MALFORMED" });
      if (message.type === "error") {
        expect(message.message).toBe("Message non reconnu.");
      }
      socket.close();
    });

    it("rejette un abonnement dont la forme est invalide", async () => {
      const socket = connect(issueChannelToken(USER, SECRET, clock));
      await waitFor(socket, "welcome");
      const error = waitFor(socket, "error");
      socket.send(JSON.stringify({ type: "subscribe", symbols: "AAPL" }));
      await expect(error).resolves.toMatchObject({ code: "MALFORMED" });
      socket.close();
    });
  });

  describe("étanchéité des secrets", () => {
    it("aucun message du canal ne contient le secret partagé", async () => {
      const socket = connect(issueChannelToken(USER, SECRET, clock));
      const received: string[] = [];
      socket.on("message", (raw: Buffer) => received.push(raw.toString("utf8")));

      await waitFor(socket, "welcome");
      socket.send(JSON.stringify({ type: "subscribe", symbols: ["AAPL", "MSFT"] }));
      await waitFor(socket, "quotes");

      for (const message of received) {
        expect(message).not.toContain(SECRET);
      }
      socket.close();
    });

    it("le message de bienvenue annonce la fraîcheur réellement disponible", async () => {
      const socket = connect(issueChannelToken(USER, SECRET, clock));
      const welcome = await waitFor(socket, "welcome");
      // L'interface doit le savoir avant d'afficher quoi que ce soit.
      expect(welcome).toMatchObject({ bestFreshness: "MANUAL" });
      socket.close();
    });
  });

  describe("cycle de vie", () => {
    it("décompte le client à sa déconnexion", async () => {
      const socket = connect(issueChannelToken(USER, SECRET, clock));
      await waitFor(socket, "welcome");
      expect(channel.clientCount()).toBe(1);

      socket.close();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(channel.clientCount()).toBe(0);
    });

    it("refuse une connexion sur un autre chemin que /live", async () => {
      const address = httpServer.address() as AddressInfo;
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}/autre`, [
        `portfolio-lab.token.${issueChannelToken(USER, SECRET, clock)}`,
      ]);
      await expect(expectRejection(socket)).resolves.toBeInstanceOf(Error);
    });
  });
});
