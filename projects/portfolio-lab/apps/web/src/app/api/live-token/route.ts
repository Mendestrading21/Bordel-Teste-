import { createHmac } from "node:crypto";

import { NextResponse } from "next/server";

import { resolveDataMode } from "@/lib/data/mode";
import { currentUserId } from "@/lib/auth/owner";
import { portfolioSubscriptionScope } from "@/lib/live/quote-service";
import { liveTokenLimiter, logger, retryAfterSeconds } from "@/lib/security/limits";

/**
 * Émission des jetons de canal temps réel.
 *
 * C'est la frontière de sécurité du Lot 05 : le navigateur demande ici un jeton
 * de courte durée, et n'obtient **jamais** le secret partagé ni aucune clé
 * fournisseur.
 *
 * La route est volontairement minimale : elle vérifie la session, signe, et
 * renvoie. Toute logique supplémentaire élargirait la surface de ce qui peut
 * fuir.
 */

export const dynamic = "force-dynamic";
// Le jeton est nominatif et de courte durée ; le mettre en cache le rendrait
// réutilisable par un autre utilisateur derrière le même proxy.
export const revalidate = 0;

const TOKEN_TTL_MS = 5 * 60_000;

export async function POST(): Promise<NextResponse> {
  const mode = resolveDataMode();
  const userId = await currentUserId(mode);

  if (userId === null) {
    return NextResponse.json(
      { error: "unauthenticated", message: "Session requise." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  /*
   * La limite est appliquée **après** l'authentification et porte sur
   * l'identité, pas sur l'adresse IP.
   *
   * Limiter avant authentification sur une IP punirait tous les utilisateurs
   * derrière un même NAT, et n'empêcherait pas un client authentifié de boucler.
   * Ici l'identité est la seule chose que l'appelant ne peut pas faire varier.
   */
  const decision = liveTokenLimiter.check(userId, Date.now());
  if (!decision.allowed) {
    logger.warn("jeton de canal refusé : limite de débit atteinte", {
      userId,
      retryAfterMs: decision.retryAfterMs,
    });
    return NextResponse.json(
      { error: "rate_limited", message: "Trop de demandes de jeton. Réessayez dans un instant." },
      {
        status: 429,
        headers: {
          "cache-control": "no-store",
          "retry-after": String(retryAfterSeconds(decision.retryAfterMs)),
        },
      },
    );
  }

  /*
   * La vérification du secret vient **après** l'authentification.
   *
   * Elle passait avant, et répondait donc 503 à un appelant anonyme : cela lui
   * apprenait l'état de configuration du serveur sans qu'il ait à prouver quoi
   * que ce soit. L'ordre correct est identité, débit, puis configuration.
   */
  const secret = process.env["MARKET_GATEWAY_SHARED_SECRET"];
  if (typeof secret !== "string" || secret.length < 32) {
    // Un secret absent ou trop court ne doit pas produire un jeton faible : on
    // refuse, et l'interface affiche que le temps réel est indisponible.
    return NextResponse.json(
      { error: "live_channel_unavailable", message: "Le canal temps réel n'est pas configuré." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  /*
   * Le périmètre est dérivé du portefeuille, jamais reçu du client.
   *
   * Le jeton prouvait jusqu'ici *qui* était l'appelant, sans limiter *ce à quoi*
   * il pouvait s'abonner. Un utilisateur authentifié pouvait donc demander
   * n'importe quel symbole à la passerelle et s'en servir comme d'un relais de
   * données de marché, sur la clé d'API de l'exploitant. La route de
   * rafraîchissement refusait déjà toute liste d'identifiants venant du
   * navigateur ; le canal temps réel tient désormais la même ligne.
   */
  const subscriptions = await portfolioSubscriptionScope();
  const scope = subscriptions.map((entry) => entry.symbol);

  const expiresAt = Date.now() + TOKEN_TTL_MS;
  // Trié : un même périmètre doit produire le même jeton, sans quoi tout
  // diagnostic devient inutilement pénible.
  const encodedScope = Buffer.from([...scope].sort().join(","), "utf8").toString("base64url");
  const payload = `${userId}.${expiresAt}.${encodedScope}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");

  return NextResponse.json(
    /*
     * Le périmètre est **renvoyé au client**, en clair, en plus d'être scellé
     * dans le jeton. Sans cela le navigateur devrait deviner à quoi s'abonner,
     * et se ferait refuser sa demande sans comprendre pourquoi.
     */
    /*
     * Les abonnements sont renvoyés **avec l'instrument qu'ils désignent**.
     *
     * Le flux ne connaît que des symboles ; l'écran ne connaît que des
     * identifiants d'instrument. Sans cette table, un cours reçu ne pourrait
     * être rattaché à aucune ligne, et le canal resterait inutilisable même
     * parfaitement fonctionnel.
     */
    { token: `${payload}.${signature}`, expiresAt, subscriptions },
    { headers: { "cache-control": "no-store" } },
  );
}
