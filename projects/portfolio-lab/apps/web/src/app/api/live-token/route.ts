import { createHmac } from "node:crypto";

import { NextResponse } from "next/server";

import { resolveDataMode } from "@/lib/data/mode";

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
  const secret = process.env["MARKET_GATEWAY_SHARED_SECRET"];

  if (typeof secret !== "string" || secret.length < 32) {
    // Un secret absent ou trop court ne doit pas produire un jeton faible : on
    // refuse, et l'interface affiche que le temps réel est indisponible.
    return NextResponse.json(
      { error: "live_channel_unavailable", message: "Le canal temps réel n'est pas configuré." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const mode = resolveDataMode();
  const userId = mode.kind === "demo" ? mode.userId : null;

  if (userId === null) {
    return NextResponse.json(
      { error: "unauthenticated", message: "Session requise." },
      { status: 401, headers: { "cache-control": "no-store" } },
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
