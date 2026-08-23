import { createHmac } from "node:crypto";

import { NextResponse } from "next/server";

import { resolveDataMode } from "@/lib/data/mode";
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
  const userId = mode.kind === "demo" ? mode.userId : null;

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

  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `${userId}.${expiresAt}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");

  return NextResponse.json(
    { token: `${payload}.${signature}`, expiresAt },
    { headers: { "cache-control": "no-store" } },
  );
}
