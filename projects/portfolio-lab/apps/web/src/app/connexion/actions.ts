"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { issueSessionCookie, verifyPassphrase } from "@portfolio-lab/security";

import { readOwnerConfig, SESSION_COOKIE_NAME } from "@/lib/auth/owner";
import { loginLimiter, logger, retryAfterSeconds } from "@/lib/security/limits";

/**
 * Connexion du propriétaire.
 *
 * Une seule chose est vérifiée : la phrase secrète. Le résultat est un cookie
 * signé, `HttpOnly`, que le navigateur ne peut pas lire depuis JavaScript —
 * une injection de script ne peut donc pas l'exfiltrer.
 */

export type LoginState = { readonly error: string | null };

/**
 * Message unique pour tout échec de phrase.
 *
 * Ni « phrase inconnue » ni « propriétaire introuvable » : un message qui
 * distinguerait les cas dirait à un visiteur s'il approche. Ici il n'existe
 * qu'un compte, donc la seule information à protéger est la phrase elle-même.
 */
const REFUSED = "Phrase secrète incorrecte.";

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const config = readOwnerConfig();
  if (!config.configured) {
    // Ce message décrit la configuration du serveur, pas un secret : il aide
    // l'exploitant et n'apprend rien d'exploitable à un visiteur.
    return { error: config.reason };
  }

  /*
   * La limite de débit porte sur le poste, faute de mieux.
   *
   * Ailleurs dans l'application elle porte sur l'identité, ce qui vaut toujours
   * mieux. Ici l'appelant n'en a pas encore : c'est précisément l'objet de la
   * requête. Une clé fixe protège donc le compte unique de cette application
   * contre l'essai systématique, au prix d'un partage entre tous les postes —
   * acceptable pour un produit à un seul utilisateur.
   */
  const decision = loginLimiter.check("owner", Date.now());
  if (!decision.allowed) {
    logger.warn("connexion refusée : trop de tentatives");
    return {
      error:
        `Trop de tentatives. Réessayez dans ${retryAfterSeconds(decision.retryAfterMs)} secondes.`,
    };
  }

  const passphrase = formData.get("passphrase");
  if (typeof passphrase !== "string" || passphrase === "") {
    return { error: REFUSED };
  }

  const hash = process.env["PORTFOLIO_LAB_PASSPHRASE_HASH"] ?? "";
  if (!verifyPassphrase(passphrase, hash)) {
    // La phrase n'est jamais journalisée, même tronquée.
    logger.warn("connexion refusée : phrase incorrecte");
    return { error: REFUSED };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, issueSessionCookie(config.ownerId, config.secret, Date.now()), {
    httpOnly: true,
    // `secure` sauf en développement, où l'application tourne en clair sur
    // localhost et où le cookie serait sinon refusé par le navigateur.
    secure: process.env["NODE_ENV"] === "production",
    // `lax` et non `strict` : `strict` empêcherait la session de suivre un lien
    // externe vers l'application, y compris celui de l'écran d'accueil iOS.
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3_600,
  });

  redirect("/");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  redirect("/connexion");
}
