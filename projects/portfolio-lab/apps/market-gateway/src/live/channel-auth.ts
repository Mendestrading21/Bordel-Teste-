import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Authentification du canal temps réel.
 *
 * Le navigateur ne reçoit **jamais** de clé fournisseur ni le secret partagé de
 * la passerelle. Il demande à son propre backend un jeton de courte durée, que
 * la passerelle vérifie sans avoir à joindre ce backend.
 *
 * Le jeton est un HMAC-SHA256 sur `userId.expiresAt`. C'est volontairement plus
 * simple qu'un JWT : la passerelle n'a besoin de valider qu'une seule forme de
 * jeton, émise par un seul émetteur, et une bibliothèque JWT complète
 * apporterait ici plus de surface d'attaque que de valeur.
 */

export type ChannelToken = {
  readonly userId: string;
  /** Expiration en millisecondes depuis l'époque Unix. */
  readonly expiresAt: number;
  readonly signature: string;
};

export type TokenVerification =
  | { readonly valid: true; readonly userId: string }
  | { readonly valid: false; readonly reason: "MALFORMED" | "EXPIRED" | "BAD_SIGNATURE" };

/** Durée de vie par défaut d'un jeton de canal, en millisecondes. */
export const DEFAULT_TOKEN_TTL_MS = 5 * 60_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Émet un jeton de canal.
 *
 * Appelée **uniquement** côté serveur applicatif, après vérification de la
 * session de l'utilisateur.
 */
export function issueChannelToken(
  userId: string,
  secret: string,
  now: number,
  ttlMs: number = DEFAULT_TOKEN_TTL_MS,
): string {
  if (!UUID_PATTERN.test(userId)) {
    throw new TypeError("Identifiant utilisateur invalide");
  }
  if (secret.length < 32) {
    // Un secret court rend le HMAC attaquable par force brute hors ligne.
    throw new TypeError("Le secret partagé doit faire au moins 32 caractères");
  }

  const expiresAt = now + ttlMs;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Vérifie un jeton de canal.
 *
 * La signature est comparée en temps constant : une comparaison naïve fuit la
 * position du premier octet divergent et permet de reconstruire la signature
 * octet par octet.
 *
 * L'ordre des vérifications est délibéré — signature **avant** expiration :
 * répondre « expiré » à un jeton mal signé confirmerait à un attaquant que sa
 * signature était bonne.
 */
export function verifyChannelToken(token: string, secret: string, now: number): TokenVerification {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, reason: "MALFORMED" };
  }

  const [userId, expiresAtRaw, signature] = parts as [string, string, string];
  const expiresAt = Number(expiresAtRaw);

  if (!UUID_PATTERN.test(userId) || !Number.isInteger(expiresAt)) {
    return { valid: false, reason: "MALFORMED" };
  }

  const expected = sign(`${userId}.${expiresAt}`, secret);
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(signature);

  // `timingSafeEqual` exige des longueurs égales ; les comparer d'abord ne fuit
  // rien d'exploitable, la longueur de la signature étant fixe et publique.
  if (
    expectedBytes.length !== providedBytes.length ||
    !timingSafeEqual(expectedBytes, providedBytes)
  ) {
    return { valid: false, reason: "BAD_SIGNATURE" };
  }

  if (expiresAt <= now) {
    return { valid: false, reason: "EXPIRED" };
  }

  return { valid: true, userId };
}
