/**
 * Limitation de débit en mémoire.
 *
 * `QUALITY_GATES.md` l'exige au titre de la sécurité applicative. L'objectif
 * ici est précis et limité : empêcher qu'une route coûteuse — émission de
 * jeton, export complet, suppression — soit appelée en boucle depuis un onglet
 * ouvert ou un script maladroit.
 *
 * **Ce n'est pas une protection distribuée.** Le compteur vit dans le processus
 * qui l'héberge ; deux instances derrière un répartiteur comptent séparément.
 * Pour une application personnelle mono-instance c'est suffisant, et le dire
 * vaut mieux que laisser croire à une garantie globale. Le jour où plusieurs
 * instances tournent, ce module devra être remplacé par un compteur partagé —
 * son interface est faite pour cela.
 */

export type RateLimitDecision =
  | { readonly allowed: true; readonly remaining: number }
  | {
      readonly allowed: false;
      /** Millisecondes avant que la fenêtre ne se libère. */
      readonly retryAfterMs: number;
    };

export type RateLimiterOptions = {
  /** Nombre d'appels autorisés par fenêtre. */
  readonly limit: number;
  /** Durée de la fenêtre glissante, en millisecondes. */
  readonly windowMs: number;
  /**
   * Nombre maximal de clés suivies simultanément.
   *
   * Sans borne, une clé dérivée d'une entrée contrôlée par l'appelant ferait
   * croître la table indéfiniment : la limitation de débit deviendrait
   * elle-même le vecteur d'épuisement mémoire qu'elle est censée prévenir.
   */
  readonly maxKeys?: number;
};

export type RateLimiter = {
  /** Consomme un jeton pour cette clé et rend la décision. */
  readonly check: (key: string, now: number) => RateLimitDecision;
  /** Oublie une clé — utile après une authentification réussie. */
  readonly reset: (key: string) => void;
  /** Nombre de clés actuellement suivies, pour les tests et la supervision. */
  readonly size: () => number;
};

const DEFAULT_MAX_KEYS = 10_000;

/**
 * Fenêtre glissante par horodatages.
 *
 * Une fenêtre *fixe* laisserait passer deux fois la limite à cheval sur une
 * frontière — dix appels à 59 s puis dix à 61 s. Conserver les horodatages
 * coûte quelques entiers par clé et supprime ce trou.
 *
 * L'horloge est un **paramètre** : un limiteur qui lit `Date.now()` lui-même ne
 * peut pas être testé sans attendre réellement, et un test qui attend une
 * seconde finit par être désactivé.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, maxKeys = DEFAULT_MAX_KEYS } = options;

  if (limit < 1 || windowMs < 1) {
    throw new RangeError("limit et windowMs doivent être strictement positifs");
  }

  const hits = new Map<string, number[]>();

  function prune(now: number): void {
    const cutoff = now - windowMs;
    for (const [key, timestamps] of hits) {
      const kept = timestamps.filter((timestamp) => timestamp > cutoff);
      if (kept.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, kept);
      }
    }
  }

  return {
    check(key, now) {
      const cutoff = now - windowMs;
      const previous = hits.get(key) ?? [];
      const recent = previous.filter((timestamp) => timestamp > cutoff);

      if (recent.length >= limit) {
        /*
         * Le refus ne consomme pas de jeton : compter les appels refusés
         * allongerait indéfiniment la pénalité d'un client qui réessaie, et
         * transformerait une limite en bannissement.
         */
        const oldest = recent[0] as number;
        hits.set(key, recent);
        return { allowed: false, retryAfterMs: Math.max(1, oldest + windowMs - now) };
      }

      recent.push(now);
      hits.set(key, recent);

      // Le nettoyage n'a lieu qu'en cas de pression : le faire à chaque appel
      // coûterait un parcours complet de la table pour rien.
      if (hits.size > maxKeys) {
        prune(now);
      }

      return { allowed: true, remaining: limit - recent.length };
    },

    reset(key) {
      hits.delete(key);
    },

    size() {
      return hits.size;
    },
  };
}
