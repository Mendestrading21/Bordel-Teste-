import { NextResponse } from "next/server";

import { buildExport } from "@/lib/data/export";
import { resolveDataMode } from "@/lib/data/mode";
import { currentUserId } from "@/lib/auth/owner";
import { exportLimiter, logger, retryAfterSeconds } from "@/lib/security/limits";

/**
 * Téléchargement de la sauvegarde.
 *
 * Une **route** plutôt qu'une action serveur : une action renvoie un résultat
 * au client React, pas un fichier. Ici le navigateur doit recevoir un flux
 * assorti d'un `Content-Disposition`, et c'est la seule façon d'obtenir un
 * vrai téléchargement sans reconstruire le fichier en mémoire dans l'onglet.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<NextResponse> {
  const mode = resolveDataMode();
  const userId = await currentUserId(mode);

  if (userId === null) {
    return NextResponse.json(
      { error: "unauthenticated", message: "Session requise." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const decision = exportLimiter.check(userId, Date.now());
  if (!decision.allowed) {
    logger.warn("export refusé : limite de débit atteinte", { userId });
    return NextResponse.json(
      { error: "rate_limited", message: "Trop d'exports demandés. Réessayez dans un instant." },
      {
        status: 429,
        headers: {
          "cache-control": "no-store",
          "retry-after": String(retryAfterSeconds(decision.retryAfterMs)),
        },
      },
    );
  }

  const now = new Date();
  const payload = await buildExport(now);

  if (payload === null) {
    return NextResponse.json(
      { error: "unavailable", message: "Aucune donnée à exporter." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  logger.info("sauvegarde produite", {
    userId,
    positions: payload.positions.length,
    snapshots: payload.snapshots.length,
  });

  const filename = `portfolio-lab-${now.toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      /*
       * Une sauvegarde de patrimoine ne doit jamais être servie depuis un
       * cache — ni celui du navigateur, ni celui d'un proxy intermédiaire.
       */
      "cache-control": "no-store, no-cache, must-revalidate, private",
      "x-content-type-options": "nosniff",
    },
  }) as NextResponse;
}
