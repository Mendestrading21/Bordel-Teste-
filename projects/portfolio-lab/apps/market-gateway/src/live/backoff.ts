/**
 * Calcul du délai de reconnexion.
 *
 * Backoff exponentiel plafonné, avec gigue. La gigue n'est pas cosmétique :
 * sans elle, tous les clients déconnectés par une même panne fournisseur
 * reviennent exactement au même instant et reproduisent la surcharge qui les a
 * déconnectés.
 */
export type BackoffOptions = {
  readonly baseMs: number;
  readonly maxMs: number;
  /** Amplitude de la gigue, en fraction du délai. 0.5 = ±50 %. */
  readonly jitterRatio: number;
};

export const DEFAULT_BACKOFF: BackoffOptions = {
  baseMs: 1_000,
  maxMs: 60_000,
  jitterRatio: 0.5,
};

/**
 * Délai avant la tentative numéro `attempt`, comptée à partir de 1.
 *
 * `random` est injectable : un backoff testé avec `Math.random` produirait des
 * tests non déterministes.
 */
export function backoffDelayMs(
  attempt: number,
  options: BackoffOptions = DEFAULT_BACKOFF,
  random: () => number = Math.random,
): number {
  if (attempt < 1) {
    throw new RangeError("Le numéro de tentative commence à 1");
  }

  // `2 ** (attempt - 1)` croît vite ; on plafonne avant d'appliquer la gigue
  // pour que le plafond soit un vrai plafond.
  const exponential = Math.min(options.baseMs * 2 ** (attempt - 1), options.maxMs);
  const jitter = exponential * options.jitterRatio * (random() * 2 - 1);
  // Jamais négatif, jamais au-delà du plafond majoré de la gigue.
  return Math.max(0, Math.round(exponential + jitter));
}

/**
 * État d'un disjoncteur par fournisseur.
 *
 * Après un nombre d'échecs consécutifs, on cesse de réessayer pendant une
 * durée fixe. Marteler un fournisseur en panne ne fait qu'aggraver la panne et
 * consomme le quota.
 */
export type CircuitState = "closed" | "open" | "half-open";

export type CircuitBreakerOptions = {
  readonly failureThreshold: number;
  readonly openDurationMs: number;
  readonly now: () => number;
};

export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;

  constructor(private readonly options: CircuitBreakerOptions) {}

  state(): CircuitState {
    if (this.openedAt === null) {
      return "closed";
    }
    return this.options.now() - this.openedAt >= this.options.openDurationMs ? "half-open" : "open";
  }

  /** `true` si une tentative est autorisée maintenant. */
  canAttempt(): boolean {
    return this.state() !== "open";
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.options.failureThreshold) {
      this.openedAt = this.options.now();
    }
  }

  consecutiveFailures(): number {
    return this.failures;
  }
}
