import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Authentification du propriétaire unique.
 *
 * PortfolioLab suit le patrimoine d'**une** personne. Un fournisseur d'identité
 * complet — inscription, vérification d'adresse, réinitialisation, annuaire —
 * apporterait ici une dépendance externe et une surface d'attaque bien plus
 * larges que le problème à résoudre : prouver qu'une seule personne est bien
 * celle qui a posé la phrase secrète.
 *
 * Deux mécanismes distincts, à ne pas confondre :
 *
 * - la **phrase secrète** est hachée par `scrypt`, avec un sel. Elle n'est
 *   jamais stockée, ni en clair ni de façon réversible, et le hachage est
 *   volontairement coûteux pour qu'un vol du hachage ne se convertisse pas en
 *   mot de passe par force brute ;
 * - le **cookie de session** est un HMAC de courte durée. Rapide à vérifier, il
 *   l'est à chaque requête ; y appliquer scrypt rendrait chaque page lente.
 *
 * Rien de tout cela n'atteint le navigateur en clair : le cookie est
 * `HttpOnly`, et le hachage ne quitte jamais le serveur.
 */

/** Coût `scrypt`. 2^16 : environ 100 ms, assez pour gêner une force brute. */
const SCRYPT_COST = 65_536;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Plafond mémoire explicite, en octets.
 *
 * `scrypt` a besoin d'environ `128 × N × r` octets, soit 64 Mo avec les
 * paramètres ci-dessus. Node plafonne par défaut à 32 Mo et **refuse** le
 * calcul au-delà : sans ce réglage, l'authentification échoue à chaque
 * tentative, avec une erreur qui parle de « memory limit » et non de mot de
 * passe. Le doubler laisse une marge sans ouvrir la porte à un épuisement
 * mémoire, le facteur de coût étant fixé ici et non reçu de l'appelant.
 */
const SCRYPT_MAX_MEMORY = 128 * SCRYPT_COST * SCRYPT_BLOCK_SIZE * 2;

/** Longueur minimale d'une phrase secrète. */
export const MIN_PASSPHRASE_LENGTH = 12;

/**
 * Format du hachage stocké : `scrypt$sel$clé`, en base64url.
 *
 * L'algorithme est inscrit dans la chaîne plutôt que supposé : le jour où il
 * faudra en changer, les deux formats devront coexister le temps que le
 * propriétaire renouvelle sa phrase.
 */
const HASH_PREFIX = "scrypt";

export function hashPassphrase(passphrase: string): string {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new TypeError(
      `La phrase secrète doit faire au moins ${MIN_PASSPHRASE_LENGTH} caractères`,
    );
  }
  const salt = randomBytes(SALT_LENGTH);
  const key = scryptSync(passphrase.normalize("NFKC"), salt, KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELISM,
    maxmem: SCRYPT_MAX_MEMORY,
  });
  return `${HASH_PREFIX}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/**
 * Vérifie une phrase secrète contre un hachage stocké.
 *
 * Renvoie `false` plutôt que de lever sur un hachage malformé : une variable
 * d'environnement mal recopiée ne doit pas transformer un refus de connexion en
 * erreur 500, qui apprendrait à un visiteur que la configuration est cassée.
 *
 * La phrase est normalisée en NFKC des deux côtés. Sans cela, un « é » saisi au
 * clavier suisse et le même caractère composé autrement ne se correspondraient
 * pas, et la phrase deviendrait irrécupérable sans que rien ne l'explique.
 */
export function verifyPassphrase(passphrase: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== HASH_PREFIX) return false;

  const [, saltRaw, keyRaw] = parts as [string, string, string];
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltRaw, "base64url");
    expected = Buffer.from(keyRaw, "base64url");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;

  const actual = scryptSync(passphrase.normalize("NFKC"), salt, KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELISM,
    maxmem: SCRYPT_MAX_MEMORY,
  });

  // Comparaison en temps constant : une comparaison naïve fuit la position du
  // premier octet divergent.
  return timingSafeEqual(actual, expected);
}

export type SessionVerification =
  | { readonly valid: true; readonly userId: string }
  | { readonly valid: false; readonly reason: "MALFORMED" | "EXPIRED" | "BAD_SIGNATURE" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Durée de vie d'une session : trente jours. */
export const SESSION_TTL_MS = 30 * 24 * 3_600_000;

/** Longueur minimale du secret de signature. */
export const MIN_SESSION_SECRET_LENGTH = 32;

function signSession(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueSessionCookie(
  userId: string,
  secret: string,
  now: number,
  ttlMs: number = SESSION_TTL_MS,
): string {
  if (!UUID_PATTERN.test(userId)) {
    throw new TypeError("Identifiant propriétaire invalide");
  }
  if (secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new TypeError(
      `Le secret de session doit faire au moins ${MIN_SESSION_SECRET_LENGTH} caractères`,
    );
  }
  const expiresAt = now + ttlMs;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${signSession(payload, secret)}`;
}

/**
 * Vérifie un cookie de session.
 *
 * Signature **avant** expiration, délibérément : répondre « expiré » à un
 * cookie mal signé confirmerait à un attaquant que sa signature était bonne.
 */
export function verifySessionCookie(
  cookie: string,
  secret: string,
  now: number,
): SessionVerification {
  const parts = cookie.split(".");
  if (parts.length !== 3) return { valid: false, reason: "MALFORMED" };

  const [userId, expiresAtRaw, signature] = parts as [string, string, string];
  const expiresAt = Number(expiresAtRaw);
  if (!UUID_PATTERN.test(userId) || !Number.isInteger(expiresAt)) {
    return { valid: false, reason: "MALFORMED" };
  }

  const expected = Buffer.from(signSession(`${userId}.${expiresAt}`, secret));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { valid: false, reason: "BAD_SIGNATURE" };
  }

  if (expiresAt <= now) return { valid: false, reason: "EXPIRED" };
  return { valid: true, userId };
}
