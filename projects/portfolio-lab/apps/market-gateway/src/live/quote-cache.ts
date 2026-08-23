import type { NormalizedQuote } from "@portfolio-lab/market-data";

/**
 * Cache du dernier cours connu par symbole.
 *
 * Deux rôles distincts :
 *
 * 1. servir immédiatement un état à un client qui vient de se connecter, sans
 *    attendre le prochain tick — un symbole peu liquide peut rester muet des
 *    heures ;
 * 2. rejeter les messages arrivés dans le désordre. Un WebSocket ne garantit
 *    pas l'ordre après une reconnexion, et un tick ancien écrasant un tick
 *    récent ferait « reculer » un cours à l'écran.
 */

export type CachedQuote = {
  readonly quote: NormalizedQuote;
  /** Instant de mise en cache, pour le calcul de péremption. */
  readonly cachedAt: number;
};

export type QuoteCacheOptions = {
  /**
   * Âge au-delà duquel une donnée est marquée périmée, par niveau de fraîcheur.
   *
   * Les seuils diffèrent par nature : une NAV publiée quotidiennement n'est pas
   * périmée après une heure, alors qu'un cours annoncé en direct l'est.
   */
  readonly staleAfterMs: {
    readonly live: number;
    readonly delayed: number;
    readonly eod: number;
    readonly nav: number;
  };
  readonly now: () => number;
};

export const DEFAULT_STALE_THRESHOLDS: QuoteCacheOptions["staleAfterMs"] = {
  // Un cours « en direct » muet plus d'une minute ne l'est plus vraiment.
  live: 60_000,
  // Un différé de 15 minutes tolère une marge avant d'être suspect.
  delayed: 20 * 60_000,
  // Une clôture reste valable jusqu'à la séance suivante.
  eod: 36 * 3_600_000,
  // Un fonds publie au mieux quotidiennement ; week-ends et fériés compris,
  // quatre jours sans NAV restent normaux.
  nav: 4 * 24 * 3_600_000,
};

export class QuoteCache {
  private readonly entries = new Map<string, CachedQuote>();

  constructor(private readonly options: QuoteCacheOptions) {}

  /**
   * Enregistre une quote si elle est plus récente que celle déjà connue.
   *
   * Renvoie `true` si le cache a changé — donc s'il faut diffuser aux clients.
   * Un tick identique ou plus ancien ne déclenche aucune diffusion : réveiller
   * tous les clients pour une valeur inchangée est du bruit pur.
   */
  accept(quote: NormalizedQuote): boolean {
    const existing = this.entries.get(quote.providerSymbol);

    if (existing !== undefined) {
      const previousAsOf = Date.parse(existing.quote.asOf);
      const incomingAsOf = Date.parse(quote.asOf);

      // Message hors ordre : on garde le plus récent.
      if (Number.isFinite(previousAsOf) && Number.isFinite(incomingAsOf)) {
        if (incomingAsOf < previousAsOf) {
          return false;
        }
        // Même horodatage et même prix : rien de neuf à diffuser.
        if (incomingAsOf === previousAsOf && existing.quote.price === quote.price) {
          return false;
        }
      }
    }

    this.entries.set(quote.providerSymbol, { quote, cachedAt: this.options.now() });
    return true;
  }

  /** Dernière quote connue, telle qu'elle a été reçue. */
  get(symbol: string): NormalizedQuote | undefined {
    return this.entries.get(symbol)?.quote;
  }

  /**
   * Quote enrichie de son statut de péremption.
   *
   * La fraîcheur retournée peut être dégradée en `STALE`, mais **jamais
   * améliorée** : une donnée ne devient pas plus fraîche en vieillissant dans
   * un cache.
   */
  getWithFreshness(symbol: string): NormalizedQuote | undefined {
    const cached = this.entries.get(symbol);
    if (cached === undefined) {
      return undefined;
    }

    const age = this.options.now() - cached.cachedAt;
    const threshold = ((): number | null => {
      switch (cached.quote.freshness) {
        case "LIVE":
          return this.options.staleAfterMs.live;
        case "DELAYED":
          return this.options.staleAfterMs.delayed;
        case "EOD":
          return this.options.staleAfterMs.eod;
        case "NAV":
          return this.options.staleAfterMs.nav;
        default:
          // MANUAL, STALE et UNAVAILABLE ne se dégradent pas avec le temps :
          // une saisie manuelle ne devient pas périmée toute seule.
          return null;
      }
    })();

    if (threshold === null || age <= threshold) {
      return cached.quote;
    }

    return { ...cached.quote, freshness: "STALE" };
  }

  /** Toutes les quotes connues, avec leur statut de péremption appliqué. */
  snapshot(symbols: readonly string[]): readonly NormalizedQuote[] {
    return symbols
      .map((symbol) => this.getWithFreshness(symbol))
      .filter((quote): quote is NormalizedQuote => quote !== undefined);
  }

  /** Retire les entrées dont plus aucun client n'a besoin. */
  evict(symbols: readonly string[]): void {
    for (const symbol of symbols) {
      this.entries.delete(symbol);
    }
  }

  size(): number {
    return this.entries.size;
  }
}
