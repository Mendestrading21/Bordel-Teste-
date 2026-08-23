import { beforeEach, describe, expect, it } from "vitest";

import { toDecimalString, type DecimalString } from "@portfolio-lab/domain";
import { createMockProvider, type NormalizedQuote } from "@portfolio-lab/market-data";

import { CircuitBreaker, DEFAULT_BACKOFF } from "./backoff.js";
import { GatewayCore } from "./gateway.js";
import type { ServerMessage } from "./protocol.js";
import { DEFAULT_STALE_THRESHOLDS, QuoteCache } from "./quote-cache.js";
import { SubscriptionRegistry } from "./subscriptions.js";

const BASE_TIME = Date.parse("2026-06-15T14:00:00.000Z");

const d = (value: string): DecimalString => toDecimalString(value);

function quote(symbol: string, price: string, asOf = "2026-06-15T14:00:00.000Z"): NormalizedQuote {
  return {
    instrumentId: symbol,
    provider: "mock",
    providerSymbol: symbol,
    currency: "USD",
    price: d(price),
    priceType: "LAST_TRADE",
    freshness: "MANUAL",
    asOf,
    receivedAt: asOf,
  };
}

describe("GatewayCore", () => {
  let clock = BASE_TIME;
  let sent: { clientId: string; message: ServerMessage }[];
  let core: GatewayCore;
  let subscriptions: SubscriptionRegistry;
  let cache: QuoteCache;

  beforeEach(() => {
    clock = BASE_TIME;
    sent = [];
    subscriptions = new SubscriptionRegistry({ graceMs: 30_000, now: () => clock });
    cache = new QuoteCache({ staleAfterMs: DEFAULT_STALE_THRESHOLDS, now: () => clock });
    core = new GatewayCore({
      provider: createMockProvider({ instruments: [] }),
      cache,
      subscriptions,
      backoff: DEFAULT_BACKOFF,
      circuit: new CircuitBreaker({
        failureThreshold: 3,
        openDurationMs: 30_000,
        now: () => clock,
      }),
      now: () => clock,
      send: (clientId, message) => sent.push({ clientId, message }),
      log: () => {},
    });
  });

  function messagesFor(clientId: string, type: ServerMessage["type"]): ServerMessage[] {
    return sent
      .filter((e) => e.clientId === clientId && e.message.type === type)
      .map((e) => e.message);
  }

  describe("connexion", () => {
    it("annonce le fournisseur et sa meilleure fraîcheur réelle", () => {
      core.onClientConnected("c1");
      const welcome = messagesFor("c1", "welcome")[0];
      expect(welcome).toMatchObject({ type: "welcome", provider: "mock" });
      // Le fournisseur simulé ne peut pas servir mieux que MANUAL ; l'interface
      // doit le savoir avant d'afficher quoi que ce soit.
      expect(welcome).toMatchObject({ bestFreshness: "MANUAL" });
    });
  });

  describe("abonnement", () => {
    it("renvoie les symboles à souscrire chez le fournisseur", () => {
      expect(core.onClientSubscribe("c1", ["AAPL", "MSFT"])).toEqual(["AAPL", "MSFT"]);
    });

    it("ne redemande pas au fournisseur un symbole déjà suivi", () => {
      core.onClientSubscribe("c1", ["AAPL"]);
      expect(core.onClientSubscribe("c2", ["AAPL"])).toEqual([]);
    });

    it("envoie immédiatement le dernier cours connu", () => {
      // Un symbole peu liquide peut rester muet des heures ; attendre son
      // prochain tick laisserait l'écran vide sans raison.
      cache.accept(quote("AAPL", "150.00"));
      core.onClientSubscribe("c1", ["AAPL"]);
      const quotes = messagesFor("c1", "quotes");
      expect(quotes).toHaveLength(1);
      expect(quotes[0]).toMatchObject({ quotes: [expect.objectContaining({ price: "150.00" })] });
    });

    it("n'envoie rien si aucun cours n'est connu, plutôt qu'un tableau vide", () => {
      core.onClientSubscribe("c1", ["INCONNU"]);
      expect(messagesFor("c1", "quotes")).toHaveLength(0);
    });
  });

  describe("diffusion des ticks", () => {
    it("ne diffuse rien avant le flush", () => {
      core.onClientSubscribe("c1", ["AAPL"]);
      sent = [];
      core.onProviderQuote(quote("AAPL", "151.00"));
      // Diffuser chaque tick saturerait un téléphone pour un affichage arrondi
      // au centime qui ne change pas visiblement.
      expect(sent).toHaveLength(0);
    });

    it("diffuse au flush", () => {
      core.onClientSubscribe("c1", ["AAPL"]);
      sent = [];
      core.onProviderQuote(quote("AAPL", "151.00"));
      core.flush();
      expect(messagesFor("c1", "quotes")).toHaveLength(1);
    });

    it("regroupe plusieurs ticks du même symbole en une seule valeur", () => {
      core.onClientSubscribe("c1", ["AAPL"]);
      sent = [];
      core.onProviderQuote(quote("AAPL", "151.00", "2026-06-15T14:00:01.000Z"));
      core.onProviderQuote(quote("AAPL", "152.00", "2026-06-15T14:00:02.000Z"));
      core.onProviderQuote(quote("AAPL", "153.00", "2026-06-15T14:00:03.000Z"));
      core.flush();

      const quotes = messagesFor("c1", "quotes");
      expect(quotes).toHaveLength(1);
      // Seule la dernière valeur compte.
      expect(quotes[0]).toMatchObject({
        quotes: [expect.objectContaining({ price: "153.00" })],
      });
    });

    it("n'envoie à chaque client que ses propres symboles", () => {
      // Envoyer à tous les ticks de tous ferait fuiter la composition des
      // portefeuilles des autres utilisateurs.
      core.onClientSubscribe("c1", ["AAPL"]);
      core.onClientSubscribe("c2", ["MSFT"]);
      sent = [];

      core.onProviderQuote(quote("AAPL", "151.00", "2026-06-15T14:00:01.000Z"));
      core.onProviderQuote(quote("MSFT", "401.00", "2026-06-15T14:00:01.000Z"));
      core.flush();

      const forC1 = messagesFor("c1", "quotes")[0];
      const forC2 = messagesFor("c2", "quotes")[0];
      expect(forC1).toMatchObject({
        quotes: [expect.objectContaining({ providerSymbol: "AAPL" })],
      });
      expect(forC2).toMatchObject({
        quotes: [expect.objectContaining({ providerSymbol: "MSFT" })],
      });
    });

    it("diffuse le même symbole à tous ses abonnés", () => {
      core.onClientSubscribe("c1", ["AAPL"]);
      core.onClientSubscribe("c2", ["AAPL"]);
      sent = [];
      core.onProviderQuote(quote("AAPL", "151.00", "2026-06-15T14:00:01.000Z"));
      core.flush();
      expect(messagesFor("c1", "quotes")).toHaveLength(1);
      expect(messagesFor("c2", "quotes")).toHaveLength(1);
    });

    it("ignore un tick hors ordre", () => {
      core.onClientSubscribe("c1", ["AAPL"]);
      core.onProviderQuote(quote("AAPL", "151.00", "2026-06-15T14:00:05.000Z"));
      core.flush();
      sent = [];

      core.onProviderQuote(quote("AAPL", "149.00", "2026-06-15T14:00:01.000Z"));
      core.flush();
      expect(sent).toHaveLength(0);
      expect(cache.get("AAPL")?.price).toBe("151.00");
    });

    it("ne diffuse rien pour un symbole sans abonné", () => {
      core.onProviderQuote(quote("ORPHELIN", "10.00"));
      core.flush();
      expect(sent).toHaveLength(0);
    });

    it("flush sans ticks en attente ne produit aucun message", () => {
      core.onClientSubscribe("c1", ["AAPL"]);
      sent = [];
      core.flush();
      expect(sent).toHaveLength(0);
    });
  });

  describe("déconnexion et collecte", () => {
    it("cesse de diffuser à un client déconnecté", () => {
      core.onClientSubscribe("c1", ["AAPL"]);
      core.onClientDisconnected("c1");
      sent = [];
      core.onProviderQuote(quote("AAPL", "151.00", "2026-06-15T14:00:01.000Z"));
      core.flush();
      expect(sent).toHaveLength(0);
    });

    it("ferme la souscription et purge le cache après la période de grâce", () => {
      core.onClientSubscribe("c1", ["AAPL"]);
      core.onProviderQuote(quote("AAPL", "151.00", "2026-06-15T14:00:01.000Z"));
      core.flush();
      core.onClientDisconnected("c1");

      expect(core.collectGarbage()).toEqual([]);
      clock += 31_000;
      expect(core.collectGarbage()).toEqual(["AAPL"]);
      // Conserver indéfiniment un cours que plus personne ne suit ferait
      // croître la mémoire sans limite.
      expect(cache.get("AAPL")).toBeUndefined();
    });
  });

  describe("reconnexion au fournisseur", () => {
    it("calcule un délai croissant à chaque perte", () => {
      const first = core.onProviderDisconnected(() => 0.5);
      const second = core.onProviderDisconnected(() => 0.5);
      expect(first).toBe(1_000);
      expect(second).toBe(2_000);
    });

    it("suspend les tentatives quand le disjoncteur s'ouvre", () => {
      core.onProviderDisconnected(() => 0.5);
      core.onProviderDisconnected(() => 0.5);
      // Troisième échec : seuil atteint.
      expect(core.onProviderDisconnected(() => 0.5)).toBeNull();
    });

    it("rejoue tous les symboles actifs à la reconnexion", () => {
      core.onClientSubscribe("c1", ["AAPL", "MSFT"]);
      core.onProviderDisconnected(() => 0.5);
      expect(core.onProviderReconnected()).toEqual(["AAPL", "MSFT"]);
    });

    it("réinitialise le backoff après une reconnexion réussie", () => {
      core.onProviderDisconnected(() => 0.5);
      core.onProviderDisconnected(() => 0.5);
      core.onProviderReconnected();
      expect(core.onProviderDisconnected(() => 0.5)).toBe(1_000);
    });
  });

  describe("panne fournisseur", () => {
    it("prévient explicitement les clients", () => {
      // Continuer d'afficher les derniers cours sans dire que le flux est coupé
      // serait mentir par omission.
      core.onClientConnected("c1");
      core.notifyProviderDown(["c1"]);
      const errors = messagesFor("c1", "error");
      expect(errors[0]).toMatchObject({ type: "error", code: "PROVIDER_DOWN" });
      expect(errors[0]).toMatchObject({ message: expect.stringContaining("dernières connues") });
    });
  });
});
