import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Authentification du canal temps réel.
 *
 * Le navigateur ne reçoit **jamais** de clé fournisseur ni le secret partagé de
 * la passerelle. Il demande à son propre backend un jeton de courte durée, que
 * la passerelle vérifie sans avoir à joindre ce backend.
 *
 * Le jeton est un HMAC-SHA256 sur `userId.expiresAt.scope`. C'est volontairement
 * plus simple qu'un JWT : la passerelle n'a besoin de valider qu'une seule
 * forme de jeton, émise par un seul émetteur, et une bibliothèque JWT complète
 * apporterait ici plus de surface d'attaque que de valeur.
 *
 * Le **périmètre** est la partie qui compte pour la sécurité, et il manquait.
 * Le jeton prouvait *qui* était l'appelant, mais rien ne limitait *ce à quoi*
 * il pouvait s'abonner : un utilisateur authentifié pouvait demander n'importe
 * quel symbole et se servir de la passerelle comme d'un relais de données de
 * marché, sur la clé d'API de l'exploitant. La route REST `/api/quotes` refuse
 * pour cette raison toute liste d'identifiants venant du navigateur ; le canal
 * temps réel doit tenir la même ligne.
 *
 * Le périmètre voyage **dans** le jeton plutôt que d'être relu en base : la
 * passerelle est un processus distinct, sans accès à la base de données, et lui
 * en donner un pour cette seule vérification élargirait bien plus sa surface
 * que ne le coûte un jeton un peu plus long.
 */

export type ChannelToken = {
  readonly userId: string;
  /** Expiration en millisecondes depuis l'époque Unix. */
  readonly expiresAt: number;
  /** Symboles auxquels ce jeton autorise l'abonnement. */
  readonly scope: readonly string[];
  readonly signature: string;
};

export type TokenVerification =
  | { readonly valid: true; readonly userId: string; readonly scope: readonly string[] }
  | {
      readonly valid: false;
      readonly reason: "MALFORMED" | "EXPIRED" | "BAD_SIGNATURE" | "SCOPE_TOO_LARGE";
    };

/**
 * Plafond du nombre de symboles portés par un jeton.
 *
 * Un jeton voyage dans un en-tête de sous-protocole WebSocket, dont la taille
 * n'est pas infinie. Le plafond est très au-dessus d'un patrimoine personnel —
 * quelques dizaines de lignes — et bien en dessous de ce qui casserait la
 * poignée de main.
 */
export const MAX_SCOPE_SYMBOLS = 200;

/**
 * Sépare les symboles dans le jeton.
 *
 * Une virgule, et donc un caractère qu'aucun symbole ne peut contenir : la
 * validation ci-dessous le refuse plutôt que de produire un périmètre dont le
 * découpage dépendrait des données.
 */
const SCOPE_SEPARATOR = ",";

/**
 * Caractères admis dans un symbole fournisseur.
 *
 * Volontairement restrictif. Les symboles réels tiennent dans cet alphabet
 * (`AAPL`, `AAPL.US`, `BTC-USD`, `NESN.SW`), et tout ce qui en sort — une
 * virgule, un point, un caractère de contrôle — casserait l'encodage du
 * périmètre ou permettrait d'en fabriquer un second.
 */
const SYMBOL_PATTERN = /^[A-Za-z0-9._:-]{1,32}$/;

function encodeScope(scope: readonly string[]): string {
  // Trié pour qu'un même périmètre produise toujours le même jeton : deux
  // jetons différents pour un périmètre identique compliqueraient tout
  // diagnostic sans rien apporter.
  const joined = [...scope].sort().join(SCOPE_SEPARATOR);
  return Buffer.from(joined, "utf8").toString("base64url");
}

function decodeScope(encoded: string): readonly string[] | null {
  let joined: string;
  try {
    joined = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }

  if (joined === "") return [];

  const symbols = joined.split(SCOPE_SEPARATOR);
  // Un symbole hors alphabet signifie un jeton fabriqué ou corrompu : le
  // périmètre entier est rejeté, jamais réduit aux entrées valides.
  if (!symbols.every((symbol) => SYMBOL_PATTERN.test(symbol))) return null;
  return symbols;
}

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
  scope: readonly string[],
  ttlMs: number = DEFAULT_TOKEN_TTL_MS,
): string {
  if (!UUID_PATTERN.test(userId)) {
    throw new TypeError("Identifiant utilisateur invalide");
  }
  if (secret.length < 32) {
    // Un secret court rend le HMAC attaquable par force brute hors ligne.
    throw new TypeError("Le secret partagé doit faire au moins 32 caractères");
  }
  if (scope.length > MAX_SCOPE_SYMBOLS) {
    throw new TypeError(`Périmètre de plus de ${MAX_SCOPE_SYMBOLS} symboles`);
  }
  for (const symbol of scope) {
    /*
     * Refusé à l'émission, pas seulement à la vérification. Un symbole
     * contenant une virgule produirait un périmètre plus large que celui
     * demandé — l'exploitant fabriquerait lui-même la faille.
     */
    if (!SYMBOL_PATTERN.test(symbol)) {
      throw new TypeError(`Symbole invalide dans le périmètre : ${symbol}`);
    }
  }

  const expiresAt = now + ttlMs;
  const payload = `${userId}.${expiresAt}.${encodeScope(scope)}`;
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
  /*
   * Quatre parties, et un jeton à trois parties est rejeté comme malformé.
   *
   * C'est délibérément une rupture : un jeton sans périmètre est précisément
   * celui qui autorisait tout. L'accepter « pour compatibilité » laisserait
   * la faille ouverte à quiconque possède encore un ancien jeton valide.
   */
  if (parts.length !== 4) {
    return { valid: false, reason: "MALFORMED" };
  }

  const [userId, expiresAtRaw, encodedScope, signature] = parts as [string, string, string, string];
  const expiresAt = Number(expiresAtRaw);

  if (!UUID_PATTERN.test(userId) || !Number.isInteger(expiresAt)) {
    return { valid: false, reason: "MALFORMED" };
  }

  const expected = sign(`${userId}.${expiresAt}.${encodedScope}`, secret);
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

  /*
   * Le périmètre n'est décodé qu'**après** la signature.
   *
   * Décoder d'abord ferait analyser par la passerelle une chaîne que personne
   * n'a authentifiée — une surface offerte gratuitement à un appelant anonyme.
   */
  const scope = decodeScope(encodedScope);
  if (scope === null) {
    return { valid: false, reason: "MALFORMED" };
  }
  if (scope.length > MAX_SCOPE_SYMBOLS) {
    return { valid: false, reason: "SCOPE_TOO_LARGE" };
  }

  return { valid: true, userId, scope };
}
