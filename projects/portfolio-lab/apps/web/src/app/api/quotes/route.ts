import { NextResponse } from "next/server";

import { resolveDataMode } from "@/lib/data/mode";
import { refreshPortfolioQuotes } from "@/lib/live/quote-service";
import { logger, quoteRefreshLimiter, retryAfterSeconds } from "@/lib/security/limits";

/**
 * Rafraîchissement des cours du portefeuille.
 *
 * Complète le canal WebSocket plutôt que de le remplacer. Les fournisseurs
 * réellement accessibles sans abonnement — Finnhub gratuit, CoinGecko sans clé,
 * les modes démo d'EODHD et de Twelve Data — servent du REST, pas du flux.
 * Sans cette route, leurs cours n'avaient aucun chemin vers l'écran : tout le
 * travail d'adaptation restait inatteignable depuis le navigateur.
 *
 * La route ne prend **aucun paramètre**. La liste des instruments est dérivée
 * du portefeuille de l'appelant côté serveur : accepter des identifiants du
 * client en ferait une sonde permettant d'interroger n'importe quel instrument
 * de la base.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(): Promise<NextResponse> {
  const mode = resolveDataMode();
  const userId = mode.kind === "demo" ? mode.userId : null;

  if (userId === null) {
    return NextResponse.json(
      { error: "unauthenticated", message: "Session requise." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  // Comme pour le jeton de canal : la limite porte sur l'identité, après
  // authentification, jamais sur l'adresse IP.
  const decision = quoteRefreshLimiter.check(userId, Date.now());
  if (!decision.allowed) {
    logger.warn("rafraîchissement de cours refusé : limite de débit atteinte", {
      userId,
      retryAfterMs: decision.retryAfterMs,
    });
    return NextResponse.json(
      { error: "rate_limited", message: "Trop de rafraîchissements. Réessayez dans un instant." },
      {
        status: 429,
        headers: {
          "cache-control": "no-store",
          "retry-after": String(retryAfterSeconds(decision.retryAfterMs)),
        },
      },
    );
  }

  try {
    const payload = await refreshPortfolioQuotes();
    return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    /*
     * L'erreur est journalisée côté serveur et **jamais** renvoyée au client :
     * un message d'adaptateur peut contenir une URL de fournisseur, voire un
     * fragment de requête portant une clé.
     */
    logger.error("échec du rafraîchissement des cours", {
      userId,
      kind: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      {
        error: "refresh_failed",
        message: "Les cours n'ont pas pu être rafraîchis. Les valeurs affichées sont les dernières connues.",
      },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
