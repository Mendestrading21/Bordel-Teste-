/**
 * Registre d'abonnements de la passerelle.
 *
 * Sa raison d'être est la déduplication : plusieurs clients — et plusieurs
 * composants d'un même client — demandent souvent le même symbole. Ouvrir une
 * souscription fournisseur par demandeur épuiserait le quota d'abonnements bien
 * avant d'être utile.
 *
 * Le registre compte les références et n'ouvre ou ne ferme la souscription
 * amont qu'aux transitions 0 → 1 et 1 → 0.
 */

export type SubscriptionDelta = {
  /** Symboles pour lesquels une souscription amont doit être ouverte. */
  readonly toSubscribe: readonly string[];
  /** Symboles dont la souscription amont peut être fermée. */
  readonly toUnsubscribe: readonly string[];
};

const EMPTY_DELTA: SubscriptionDelta = { toSubscribe: [], toUnsubscribe: [] };

/**
 * Plafonds par défaut.
 *
 * Généreux au regard d'un usage réel — un patrimoine personnel dépasse rarement
 * quelques centaines de lignes — et suffisamment bas pour qu'une demande
 * aberrante soit refusée avant d'atteindre le fournisseur.
 */
export const DEFAULT_SUBSCRIPTION_LIMITS = {
  maxSymbolsPerClient: 500,
  maxTotalSymbols: 5_000,
} as const;

export type SubscriptionRegistryOptions = {
  /**
   * Délai de grâce avant fermeture d'une souscription devenue inutilisée, en
   * millisecondes.
   *
   * Sans ce délai, une simple navigation entre deux écrans fermerait puis
   * rouvrirait immédiatement les mêmes souscriptions — un cycle coûteux chez la
   * plupart des fournisseurs, et qui compte souvent dans les quotas.
   */
  readonly graceMs: number;
  /** Horloge injectable pour rendre les tests déterministes. */
  readonly now: () => number;
  /**
   * Nombre maximal de symboles qu'un client peut suivre simultanément.
   *
   * Sans plafond, un client — bogué, ou simplement curieux — peut demander des
   * dizaines de milliers de symboles : la mémoire de la passerelle croît sans
   * limite et le quota du fournisseur part en une requête.
   *
   * Le dépassement est **refusé**, jamais tronqué. Tronquer laisserait le
   * client convaincu d'être abonné à tout, avec une moitié de sa liste
   * définitivement muette — indiscernable d'un marché sans transaction. C'est
   * le mode d'échec le plus coûteux à diagnostiquer de tout ce module.
   */
  readonly maxSymbolsPerClient: number;
  /**
   * Nombre maximal de symboles distincts suivis par la passerelle.
   *
   * Protège le quota amont quand beaucoup de clients suivent des univers
   * disjoints. Refusé de même, jamais tronqué.
   */
  readonly maxTotalSymbols: number;
};

/** Levée quand une demande d'abonnement dépasse une limite déclarée. */
export class SubscriptionLimitError extends Error {
  constructor(
    readonly limit: "PER_CLIENT" | "TOTAL",
    readonly requested: number,
    readonly maximum: number,
  ) {
    super(
      limit === "PER_CLIENT"
        ? `Abonnement refusé : ${requested} symboles demandés, maximum ${maximum} par client`
        : `Abonnement refusé : ${requested} symboles distincts, maximum ${maximum} pour la passerelle`,
    );
    this.name = "SubscriptionLimitError";
  }
}

type Entry = {
  /** Clients actuellement intéressés par ce symbole. */
  readonly clients: Set<string>;
  /** Instant à partir duquel la souscription peut être fermée, ou `null`. */
  expiresAt: number | null;
};

export class SubscriptionRegistry {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly options: SubscriptionRegistryOptions) {}

  /**
   * Enregistre l'intérêt d'un client pour un ensemble de symboles.
   *
   * L'appel est **idempotent** et déclaratif : le client transmet la liste
   * complète de ce qu'il veut, pas un différentiel. Un client qui se reconnecte
   * après une coupure retrouve donc exactement le bon état, sans avoir à
   * rejouer une séquence d'ajouts et de retraits.
   */
  setClientSymbols(clientId: string, symbols: readonly string[]): SubscriptionDelta {
    const wanted = new Set(symbols);

    if (wanted.size > this.options.maxSymbolsPerClient) {
      throw new SubscriptionLimitError("PER_CLIENT", wanted.size, this.options.maxSymbolsPerClient);
    }

    /*
     * Le total projeté compte les symboles déjà suivis **plus** ceux que ce
     * client ajouterait. Compter seulement la demande laisserait passer mille
     * clients demandant chacun un symbole différent.
     */
    const projected = new Set(this.entries.keys());
    for (const symbol of wanted) projected.add(symbol);
    if (projected.size > this.options.maxTotalSymbols) {
      throw new SubscriptionLimitError("TOTAL", projected.size, this.options.maxTotalSymbols);
    }

    const toSubscribe: string[] = [];

    for (const symbol of wanted) {
      const entry = this.entries.get(symbol);
      if (entry === undefined) {
        this.entries.set(symbol, { clients: new Set([clientId]), expiresAt: null });
        toSubscribe.push(symbol);
        continue;
      }
      entry.clients.add(clientId);
      // Un symbole en sursis redevient actif : on annule sa fermeture.
      entry.expiresAt = null;
    }

    // Retire ce client des symboles qu'il ne demande plus.
    for (const [symbol, entry] of this.entries) {
      if (!wanted.has(symbol) && entry.clients.delete(clientId) && entry.clients.size === 0) {
        entry.expiresAt = this.options.now() + this.options.graceMs;
      }
    }

    return { toSubscribe, toUnsubscribe: [] };
  }

  /** Retire un client, par exemple à la fermeture de sa connexion. */
  removeClient(clientId: string): SubscriptionDelta {
    for (const entry of this.entries.values()) {
      if (entry.clients.delete(clientId) && entry.clients.size === 0) {
        entry.expiresAt = this.options.now() + this.options.graceMs;
      }
    }
    return EMPTY_DELTA;
  }

  /**
   * Ferme les souscriptions dont le délai de grâce est écoulé.
   *
   * Appelée périodiquement plutôt qu'à chaque changement : regrouper les
   * fermetures évite de saturer le fournisseur de messages de contrôle.
   */
  collectExpired(): SubscriptionDelta {
    const now = this.options.now();
    const toUnsubscribe: string[] = [];

    for (const [symbol, entry] of this.entries) {
      if (entry.clients.size === 0 && entry.expiresAt !== null && entry.expiresAt <= now) {
        this.entries.delete(symbol);
        toUnsubscribe.push(symbol);
      }
    }

    return { toSubscribe: [], toUnsubscribe };
  }

  /** Symboles pour lesquels une souscription amont est ouverte. */
  activeSymbols(): readonly string[] {
    return [...this.entries.keys()].sort();
  }

  /** Symboles réellement demandés par au moins un client. */
  demandedSymbols(): readonly string[] {
    return [...this.entries.entries()]
      .filter(([, entry]) => entry.clients.size > 0)
      .map(([symbol]) => symbol)
      .sort();
  }

  /** Clients intéressés par un symbole donné. */
  clientsFor(symbol: string): readonly string[] {
    return [...(this.entries.get(symbol)?.clients ?? [])].sort();
  }

  /**
   * Symboles à re-souscrire après une reconnexion au fournisseur.
   *
   * Une reconnexion perd l'état amont : il faut rejouer l'ensemble, y compris
   * les symboles en période de grâce, qu'un client peut redemander d'un instant
   * à l'autre.
   */
  /**
   * Compteurs exposables par la sonde de santé.
   *
   * Ne contient que des nombres : la liste des symboles suivis décrit la
   * composition des portefeuilles des utilisateurs et n'a rien à faire dans
   * une sonde publique.
   */
  metrics(): {
    readonly activeSymbols: number;
    readonly expiringSymbols: number;
    readonly clients: number;
  } {
    const clients = new Set<string>();
    let expiring = 0;
    for (const entry of this.entries.values()) {
      for (const clientId of entry.clients) clients.add(clientId);
      if (entry.expiresAt !== null) expiring += 1;
    }
    return {
      activeSymbols: this.entries.size,
      expiringSymbols: expiring,
      clients: clients.size,
    };
  }

  symbolsForResubscription(): readonly string[] {
    return this.activeSymbols();
  }
}
