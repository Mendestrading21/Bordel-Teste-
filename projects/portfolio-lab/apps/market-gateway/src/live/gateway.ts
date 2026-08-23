import type { MarketDataProvider, NormalizedQuote } from "@portfolio-lab/market-data";

import { type CircuitBreaker, backoffDelayMs, type BackoffOptions } from "./backoff.js";
import { type QuoteCache } from "./quote-cache.js";
import { type SubscriptionRegistry } from "./subscriptions.js";
import type { ServerMessage } from "./protocol.js";

/**
 * Cœur de la passerelle temps réel, sans dépendance au transport.
 *
 * Le module ne connaît ni WebSocket ni HTTP : il reçoit des identifiants de
 * clients et rend des messages à diffuser. C'est ce qui permet de tester
 * intégralement la déduplication, la reconnexion, la limitation de débit et la
 * péremption sans ouvrir une seule socket — donc de façon déterministe.
 */

export type ClientId = string;

export type GatewayCoreOptions = {
  readonly provider: MarketDataProvider;
  readonly cache: QuoteCache;
  readonly subscriptions: SubscriptionRegistry;
  readonly backoff: BackoffOptions;
  readonly circuit: CircuitBreaker;
  readonly now: () => number;
  /** Diffuse un message à un client précis. */
  readonly send: (clientId: ClientId, message: ServerMessage) => void;
  /** Journalise sans jamais transporter de secret. */
  readonly log: (
    level: "info" | "warn" | "error",
    message: string,
    context?: Readonly<Record<string, unknown>>,
  ) => void;
};

export class GatewayCore {
  /** Ticks reçus mais pas encore diffusés, par symbole. */
  private readonly pending = new Map<string, NormalizedQuote>();
  private reconnectAttempt = 0;

  constructor(private readonly options: GatewayCoreOptions) {}

  /**
   * Accueille un client authentifié.
   *
   * Le message de bienvenue annonce le fournisseur actif et la **meilleure
   * fraîcheur qu'il peut réellement servir**, pour que l'interface n'affiche
   * jamais « en direct » ce qui ne l'est pas.
   */
  onClientConnected(clientId: ClientId): void {
    const capabilities = this.options.provider.capabilities();
    this.options.send(clientId, {
      type: "welcome",
      provider: this.options.provider.id,
      bestFreshness: capabilities.bestFreshness,
    });
  }

  /**
   * Traite une demande d'abonnement.
   *
   * Le dernier état connu est envoyé immédiatement : un symbole peu liquide
   * peut rester muet des heures, et attendre son prochain tick laisserait
   * l'écran vide sans raison.
   */
  onClientSubscribe(clientId: ClientId, symbols: readonly string[]): readonly string[] {
    const delta = this.options.subscriptions.setClientSymbols(clientId, symbols);

    const known = this.options.cache.snapshot(symbols);
    if (known.length > 0) {
      // Copie superficielle : le schéma du protocole décrit un tableau mutable,
      // et le cache expose volontairement ses instantanés en lecture seule.
      this.options.send(clientId, { type: "quotes", quotes: [...known] });
    }

    return delta.toSubscribe;
  }

  onClientDisconnected(clientId: ClientId): void {
    this.options.subscriptions.removeClient(clientId);
  }

  /**
   * Enregistre un tick fournisseur.
   *
   * Le tick n'est pas diffusé immédiatement : il est mis en attente et sera
   * envoyé au prochain `flush`. Diffuser chaque tick saturerait un téléphone
   * pour un affichage arrondi au centime qui ne change pas visiblement.
   */
  onProviderQuote(quote: NormalizedQuote): void {
    // Le cache rejette les messages hors ordre et les valeurs inchangées.
    if (!this.options.cache.accept(quote)) {
      return;
    }
    this.pending.set(quote.providerSymbol, quote);
  }

  /**
   * Diffuse les ticks en attente, groupés par client.
   *
   * Un client ne reçoit que les symboles auxquels il est abonné : envoyer à
   * tous les ticks de tous ferait fuiter la composition des portefeuilles des
   * autres utilisateurs.
   */
  flush(): void {
    if (this.pending.size === 0) {
      return;
    }

    const byClient = new Map<ClientId, NormalizedQuote[]>();

    for (const [symbol, quote] of this.pending) {
      for (const clientId of this.options.subscriptions.clientsFor(symbol)) {
        const bucket = byClient.get(clientId) ?? [];
        bucket.push(quote);
        byClient.set(clientId, bucket);
      }
    }

    this.pending.clear();

    for (const [clientId, quotes] of byClient) {
      this.options.send(clientId, { type: "quotes", quotes });
    }
  }

  /**
   * Ferme les souscriptions expirées et purge leur cache.
   *
   * Conserver indéfiniment le dernier cours d'un symbole que plus personne ne
   * suit ferait croître la mémoire de la passerelle sans limite.
   */
  collectGarbage(): readonly string[] {
    const { toUnsubscribe } = this.options.subscriptions.collectExpired();
    if (toUnsubscribe.length > 0) {
      this.options.cache.evict(toUnsubscribe);
      this.options.log("info", "souscriptions fermées", { count: toUnsubscribe.length });
    }
    return toUnsubscribe;
  }

  /** Symboles à re-souscrire après une reconnexion au fournisseur. */
  onProviderReconnected(): readonly string[] {
    this.reconnectAttempt = 0;
    this.options.circuit.recordSuccess();
    const symbols = this.options.subscriptions.symbolsForResubscription();
    this.options.log("info", "reconnecté au fournisseur", { symbols: symbols.length });
    return symbols;
  }

  /**
   * Enregistre une perte de connexion et calcule le délai avant reprise.
   *
   * Renvoie `null` quand le disjoncteur est ouvert : marteler un fournisseur en
   * panne aggrave la panne et consomme le quota.
   */
  onProviderDisconnected(random: () => number = Math.random): number | null {
    this.options.circuit.recordFailure();

    if (!this.options.circuit.canAttempt()) {
      this.options.log("warn", "disjoncteur ouvert, reconnexion suspendue", {
        failures: this.options.circuit.consecutiveFailures(),
      });
      return null;
    }

    this.reconnectAttempt += 1;
    const delay = backoffDelayMs(this.reconnectAttempt, this.options.backoff, random);
    this.options.log("warn", "connexion fournisseur perdue", {
      attempt: this.reconnectAttempt,
      delayMs: delay,
    });
    return delay;
  }

  /**
   * Signale une panne fournisseur aux clients.
   *
   * Le message est explicite : une application qui continue d'afficher les
   * derniers cours sans dire que le flux est coupé ment par omission.
   */
  notifyProviderDown(clientIds: readonly ClientId[]): void {
    for (const clientId of clientIds) {
      this.options.send(clientId, {
        type: "error",
        code: "PROVIDER_DOWN",
        message:
          "La connexion au fournisseur de cours est interrompue. Les valeurs affichées " +
          "sont les dernières connues.",
      });
    }
  }
}
