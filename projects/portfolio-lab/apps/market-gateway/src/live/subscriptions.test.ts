import { beforeEach, describe, expect, it } from "vitest";

import {
  SubscriptionRegistry,
  SubscriptionLimitError,
  DEFAULT_SUBSCRIPTION_LIMITS,
} from "./subscriptions.js";

describe("SubscriptionRegistry", () => {
  let clock = 0;
  let registry: SubscriptionRegistry;

  beforeEach(() => {
    clock = 1_000_000;
    registry = new SubscriptionRegistry({
      graceMs: 30_000,
      now: () => clock,
      ...DEFAULT_SUBSCRIPTION_LIMITS,
    });
  });

  describe("déduplication", () => {
    it("n'ouvre qu'une souscription amont pour deux clients sur le même symbole", () => {
      const first = registry.setClientSymbols("c1", ["AAPL"]);
      expect(first.toSubscribe).toEqual(["AAPL"]);

      // Le deuxième client réutilise la souscription existante.
      const second = registry.setClientSymbols("c2", ["AAPL"]);
      expect(second.toSubscribe).toEqual([]);
      expect(registry.activeSymbols()).toEqual(["AAPL"]);
    });

    it("n'ouvre qu'une souscription si un client redemande le même symbole", () => {
      registry.setClientSymbols("c1", ["AAPL"]);
      expect(registry.setClientSymbols("c1", ["AAPL"]).toSubscribe).toEqual([]);
    });

    it("ouvre uniquement les symboles réellement nouveaux", () => {
      registry.setClientSymbols("c1", ["AAPL", "MSFT"]);
      const delta = registry.setClientSymbols("c2", ["MSFT", "NESN"]);
      expect(delta.toSubscribe).toEqual(["NESN"]);
    });

    it("suit les clients intéressés par chaque symbole", () => {
      registry.setClientSymbols("c1", ["AAPL"]);
      registry.setClientSymbols("c2", ["AAPL"]);
      registry.setClientSymbols("c3", ["MSFT"]);
      expect(registry.clientsFor("AAPL")).toEqual(["c1", "c2"]);
      expect(registry.clientsFor("MSFT")).toEqual(["c3"]);
      expect(registry.clientsFor("INCONNU")).toEqual([]);
    });
  });

  describe("nature déclarative des abonnements", () => {
    it("remplace la liste du client plutôt que de l'accumuler", () => {
      registry.setClientSymbols("c1", ["AAPL", "MSFT"]);
      registry.setClientSymbols("c1", ["MSFT"]);
      // AAPL n'est plus demandé par personne.
      expect(registry.demandedSymbols()).toEqual(["MSFT"]);
    });

    it("est idempotent : rejouer la même liste ne change rien", () => {
      registry.setClientSymbols("c1", ["AAPL", "MSFT"]);
      const before = registry.activeSymbols();
      registry.setClientSymbols("c1", ["AAPL", "MSFT"]);
      expect(registry.activeSymbols()).toEqual(before);
    });

    it("permet à un client reconnecté de retrouver le bon état sans différentiel", () => {
      registry.setClientSymbols("c1", ["AAPL", "MSFT", "NESN"]);
      registry.removeClient("c1");
      // Reconnexion : le client renvoie simplement sa liste complète.
      const delta = registry.setClientSymbols("c1", ["AAPL", "MSFT", "NESN"]);
      expect(delta.toSubscribe).toEqual([]);
      expect(registry.demandedSymbols()).toEqual(["AAPL", "MSFT", "NESN"]);
    });
  });

  describe("période de grâce", () => {
    it("ne ferme pas immédiatement une souscription devenue inutilisée", () => {
      registry.setClientSymbols("c1", ["AAPL"]);
      registry.removeClient("c1");
      // Une navigation entre deux écrans ne doit pas fermer puis rouvrir.
      expect(registry.collectExpired().toUnsubscribe).toEqual([]);
      expect(registry.activeSymbols()).toEqual(["AAPL"]);
    });

    it("ferme la souscription une fois le délai écoulé", () => {
      registry.setClientSymbols("c1", ["AAPL"]);
      registry.removeClient("c1");
      clock += 30_001;
      expect(registry.collectExpired().toUnsubscribe).toEqual(["AAPL"]);
      expect(registry.activeSymbols()).toEqual([]);
    });

    it("annule la fermeture si un client redemande le symbole entre-temps", () => {
      registry.setClientSymbols("c1", ["AAPL"]);
      registry.removeClient("c1");
      clock += 20_000;
      registry.setClientSymbols("c2", ["AAPL"]);
      clock += 20_000;
      // Le sursis a été annulé par la nouvelle demande.
      expect(registry.collectExpired().toUnsubscribe).toEqual([]);
    });

    it("ne ferme pas un symbole encore demandé par un autre client", () => {
      registry.setClientSymbols("c1", ["AAPL"]);
      registry.setClientSymbols("c2", ["AAPL"]);
      registry.removeClient("c1");
      clock += 60_000;
      expect(registry.collectExpired().toUnsubscribe).toEqual([]);
      expect(registry.clientsFor("AAPL")).toEqual(["c2"]);
    });
  });

  describe("reconnexion", () => {
    it("rejoue tous les symboles actifs, période de grâce comprise", () => {
      registry.setClientSymbols("c1", ["AAPL", "MSFT"]);
      registry.setClientSymbols("c2", ["NESN"]);
      registry.removeClient("c2");

      // NESN est en sursis : un client peut le redemander d'un instant à
      // l'autre, et une reconnexion perd l'état amont.
      expect(registry.symbolsForResubscription()).toEqual(["AAPL", "MSFT", "NESN"]);
    });

    it("ne rejoue rien après collecte des expirés", () => {
      registry.setClientSymbols("c1", ["AAPL"]);
      registry.removeClient("c1");
      clock += 60_000;
      registry.collectExpired();
      expect(registry.symbolsForResubscription()).toEqual([]);
    });
  });
});

describe("plafonds d'abonnement", () => {
  const symbols = (n: number, prefix = "SYM") =>
    Array.from({ length: n }, (_, index) => `${prefix}${index}`);

  it("refuse une demande au-delà du plafond par client", () => {
    /*
     * Sans plafond, un client bogué peut demander des dizaines de milliers de
     * symboles : la mémoire croît sans limite et le quota du fournisseur part
     * en une requête.
     */
    const limited = new SubscriptionRegistry({
      graceMs: 30_000,
      now: () => 0,
      maxSymbolsPerClient: 3,
      maxTotalSymbols: 100,
    });

    expect(() => limited.setClientSymbols("c1", symbols(4))).toThrow(SubscriptionLimitError);
  });

  it("refuse plutôt que de tronquer", () => {
    /*
     * Le point central. Tronquer laisserait le client convaincu d'être abonné
     * à tout, avec une moitié de sa liste définitivement muette —
     * indiscernable d'un marché sans transaction.
     */
    const limited = new SubscriptionRegistry({
      graceMs: 30_000,
      now: () => 0,
      maxSymbolsPerClient: 3,
      maxTotalSymbols: 100,
    });

    expect(() => limited.setClientSymbols("c1", symbols(4))).toThrow();
    // Rien n'a été enregistré : le refus est total.
    expect(limited.activeSymbols()).toEqual([]);
    expect(limited.metrics().activeSymbols).toBe(0);
  });

  it("accepte exactement le plafond", () => {
    const limited = new SubscriptionRegistry({
      graceMs: 30_000,
      now: () => 0,
      maxSymbolsPerClient: 3,
      maxTotalSymbols: 100,
    });
    expect(() => limited.setClientSymbols("c1", symbols(3))).not.toThrow();
  });

  it("compte les doublons une seule fois", () => {
    // Une liste avec répétitions ne doit pas consommer le plafond deux fois.
    const limited = new SubscriptionRegistry({
      graceMs: 30_000,
      now: () => 0,
      maxSymbolsPerClient: 2,
      maxTotalSymbols: 100,
    });
    expect(() => limited.setClientSymbols("c1", ["AAPL", "AAPL", "MSFT"])).not.toThrow();
  });

  it("plafonne aussi le total, que mille clients d'un symbole atteindraient", () => {
    /*
     * Compter seulement la demande du client courant laisserait passer mille
     * clients demandant chacun un symbole différent.
     */
    const limited = new SubscriptionRegistry({
      graceMs: 30_000,
      now: () => 0,
      maxSymbolsPerClient: 10,
      maxTotalSymbols: 3,
    });

    limited.setClientSymbols("c1", ["A", "B"]);
    limited.setClientSymbols("c2", ["C"]);
    expect(() => limited.setClientSymbols("c3", ["D"])).toThrow(SubscriptionLimitError);
  });

  it("laisse un client réduire sa liste malgré un total saturé", () => {
    // Un client déjà compté ne doit pas être bloqué en se désabonnant.
    const limited = new SubscriptionRegistry({
      graceMs: 30_000,
      now: () => 0,
      maxSymbolsPerClient: 10,
      maxTotalSymbols: 2,
    });
    limited.setClientSymbols("c1", ["A", "B"]);
    expect(() => limited.setClientSymbols("c1", ["A"])).not.toThrow();
  });

  it("nomme la limite atteinte et les valeurs en jeu", () => {
    const limited = new SubscriptionRegistry({
      graceMs: 30_000,
      now: () => 0,
      maxSymbolsPerClient: 2,
      maxTotalSymbols: 100,
    });
    try {
      limited.setClientSymbols("c1", symbols(5));
      expect.unreachable("le plafond aurait dû être refusé");
    } catch (error) {
      expect(error).toBeInstanceOf(SubscriptionLimitError);
      const limit = error as SubscriptionLimitError;
      expect(limit.limit).toBe("PER_CLIENT");
      expect(limit.requested).toBe(5);
      expect(limit.maximum).toBe(2);
    }
  });
});

describe("métriques", () => {
  let clock = 0;
  let registry: SubscriptionRegistry;

  beforeEach(() => {
    clock = 0;
    registry = new SubscriptionRegistry({
      graceMs: 30_000,
      now: () => clock,
      ...DEFAULT_SUBSCRIPTION_LIMITS,
    });
  });

  it("ne rapporte que des nombres", () => {
    /*
     * La liste des symboles suivis décrit la composition des portefeuilles des
     * utilisateurs : elle n'a rien à faire dans une sonde de santé publique.
     */
    registry.setClientSymbols("c1", ["AAPL", "MSFT"]);
    const metrics = registry.metrics();

    expect(metrics).toEqual({ activeSymbols: 2, expiringSymbols: 0, clients: 1 });
    expect(JSON.stringify(metrics)).not.toContain("AAPL");
  });

  it("compte les souscriptions en sursis séparément", () => {
    registry.setClientSymbols("c1", ["AAPL", "MSFT"]);
    registry.setClientSymbols("c1", ["AAPL"]);
    expect(registry.metrics()).toMatchObject({ activeSymbols: 2, expiringSymbols: 1 });
  });
});
