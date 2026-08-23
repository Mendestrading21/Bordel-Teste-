import "server-only";

import { createLogger, createRateLimiter, type Logger } from "@portfolio-lab/security";

/**
 * Limites de débit de l'application web.
 *
 * Les limiteurs sont des **modules**, donc partagés par toutes les requêtes du
 * processus. C'est voulu : un limiteur créé par requête ne compterait jamais
 * rien.
 *
 * Chaque route reçoit sa propre limite plutôt qu'une limite globale. Un export
 * légitime est rare et coûteux ; un jeton de canal est fréquent et bon marché.
 * Les soumettre au même compteur pénaliserait l'un pour l'usage de l'autre.
 */

/** Jeton de canal : renouvelé toutes les cinq minutes en usage normal. */
export const liveTokenLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

/**
 * Export complet : lourd en base, jamais appelé en rafale légitimement.
 *
 * Dix par minute, pas trois. Un utilisateur qui clique, ne trouve pas le
 * fichier, reclique, puis recommence après un échec d'enregistrement atteint
 * trois appels sans rien faire d'anormal — et se ferait refuser sa propre
 * sauvegarde. Dix laissent passer toute séquence humaine plausible tout en
 * arrêtant net une boucle scriptée.
 */
export const exportLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

/**
 * Suppression définitive.
 *
 * La limite ne protège pas l'utilisateur d'une erreur — l'écran s'en charge par
 * une confirmation explicite — mais empêche qu'un script la répète en boucle
 * contre la base.
 */
export const deletionLimiter = createRateLimiter({ limit: 3, windowMs: 300_000 });

/** Écritures de position et de compte, y compris les points d'historique. */
export const mutationLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

/**
 * Journal de l'application web.
 *
 * Le niveau vient de l'environnement, avec `info` par défaut : `debug` en
 * production ferait transiter par les logs des détails que l'expurgation n'a
 * pas de raison d'attendre.
 */
export const logger: Logger = createLogger(process.env["LOG_LEVEL"] === "debug" ? "debug" : "info");

/** Secondes à annoncer dans `Retry-After`, toujours au moins une. */
export function retryAfterSeconds(retryAfterMs: number): number {
  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}
