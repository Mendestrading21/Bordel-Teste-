import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  MIN_SESSION_SECRET_LENGTH,
  verifySessionCookie,
  type SessionVerification,
} from "@portfolio-lab/security";

import { resolveDataMode, type DataMode } from "@/lib/data/mode";

/**
 * Identité de l'appelant, côté serveur.
 *
 * Ce module remplace treize répétitions de
 * `mode.kind === "demo" ? mode.userId : null`, qui rendaient l'application
 * **entièrement vide hors mode démonstration** : chaque écran, chaque route,
 * chaque action renvoyait « pas de session » dès que `DATABASE_URL` prenait le
 * relais. Or le mode démonstration est interdit en production. Déployée,
 * l'application n'avait donc aucun moyen d'afficher quoi que ce soit.
 *
 * Un seul propriétaire, une phrase secrète, un cookie signé. Pas d'inscription,
 * pas d'annuaire, pas de réinitialisation par courriel : ce produit suit le
 * patrimoine d'une personne, et un fournisseur d'identité complet apporterait
 * ici bien plus de surface d'attaque que de valeur.
 */

export const SESSION_COOKIE_NAME = "pl_session";

export type OwnerConfig =
  | { readonly configured: true; readonly ownerId: string; readonly secret: string }
  | { readonly configured: false; readonly reason: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lit la configuration du propriétaire, sans jamais rendre le hachage.
 *
 * Le hachage de la phrase reste dans `verifyOwnerPassphrase` : le rendre ici
 * l'exposerait à tout appelant de cette fonction, y compris ceux qui n'ont
 * besoin que de savoir si l'application est configurée.
 */
export function readOwnerConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): OwnerConfig {
  const ownerId = env["PORTFOLIO_LAB_OWNER_ID"];
  const secret = env["PORTFOLIO_LAB_SESSION_SECRET"];
  const hash = env["PORTFOLIO_LAB_PASSPHRASE_HASH"];

  const missing: string[] = [];
  if (ownerId === undefined || ownerId === "") missing.push("PORTFOLIO_LAB_OWNER_ID");
  if (secret === undefined || secret === "") missing.push("PORTFOLIO_LAB_SESSION_SECRET");
  if (hash === undefined || hash === "") missing.push("PORTFOLIO_LAB_PASSPHRASE_HASH");

  if (missing.length > 0) {
    return {
      configured: false,
      reason:
        `Connexion impossible : ${missing.join(", ")} ${missing.length > 1 ? "sont absents" : "est absent"}. ` +
        "Voir docs/DEPLOIEMENT.md pour générer ces valeurs.",
    };
  }

  if (!UUID_PATTERN.test(ownerId as string)) {
    return {
      configured: false,
      reason: "Connexion impossible : PORTFOLIO_LAB_OWNER_ID n'est pas un UUID.",
    };
  }

  if ((secret as string).length < MIN_SESSION_SECRET_LENGTH) {
    /*
     * Un secret court rend le HMAC attaquable hors ligne. Refuser de démarrer
     * la connexion vaut mieux que d'émettre des sessions falsifiables.
     */
    return {
      configured: false,
      reason:
        `Connexion impossible : PORTFOLIO_LAB_SESSION_SECRET doit faire au moins ` +
        `${MIN_SESSION_SECRET_LENGTH} caractères.`,
    };
  }

  return { configured: true, ownerId: ownerId as string, secret: secret as string };
}

export type CallerIdentity =
  | { readonly kind: "demo"; readonly userId: string }
  | { readonly kind: "owner"; readonly userId: string }
  | { readonly kind: "anonymous"; readonly reason: string };

/**
 * Résout l'identité de l'appelant.
 *
 * Le mode démonstration continue de fournir son utilisateur fixe — il reste le
 * seul moyen d'explorer l'application sans base ni compte, et `resolveDataMode`
 * garantit déjà qu'il ne peut pas s'activer en production.
 *
 * Hors démonstration, l'identité vient du cookie signé et de rien d'autre.
 */
export async function resolveCaller(
  mode: DataMode = resolveDataMode(),
  now: number = Date.now(),
): Promise<CallerIdentity> {
  if (mode.kind === "demo") {
    return { kind: "demo", userId: mode.userId };
  }

  if (mode.kind === "unavailable") {
    return { kind: "anonymous", reason: mode.reason };
  }

  const config = readOwnerConfig();
  if (!config.configured) {
    return { kind: "anonymous", reason: config.reason };
  }

  const store = await cookies();
  return decideCaller(config, store.get(SESSION_COOKIE_NAME)?.value, now);
}

const SIGN_IN = "Connectez-vous pour accéder à votre patrimoine.";

/**
 * Décision d'accès à partir d'un cookie brut.
 *
 * Séparée de `resolveCaller` pour être testable : la lecture du cookie passe
 * par `next/headers`, qui n'existe qu'à l'intérieur d'une requête. Une règle
 * de sécurité qui ne vit que dans ce contexte n'est jamais vérifiée, et la
 * comparaison ci-dessous en est précisément une.
 */
export function decideCaller(
  config: Extract<OwnerConfig, { configured: true }>,
  raw: string | undefined,
  now: number,
): CallerIdentity {
  if (raw === undefined || raw === "") {
    return { kind: "anonymous", reason: SIGN_IN };
  }

  const verification: SessionVerification = verifySessionCookie(raw, config.secret, now);
  if (!verification.valid) {
    return {
      kind: "anonymous",
      reason:
        verification.reason === "EXPIRED"
          ? "Votre session a expiré. Reconnectez-vous pour continuer."
          : SIGN_IN,
    };
  }

  /*
   * L'identifiant du cookie doit correspondre au propriétaire configuré.
   *
   * Le HMAC prouve que **ce serveur** a émis le cookie, pas qu'il désigne
   * encore quelqu'un d'autorisé. Sans cette comparaison, un cookie émis avant
   * un changement de `PORTFOLIO_LAB_OWNER_ID` — après un vol de session, par
   * exemple — continuerait d'ouvrir le portefeuille de l'ancien identifiant.
   * Changer l'identifiant est le seul moyen de révoquer toutes les sessions
   * d'un coup ; sans cette ligne, ce moyen n'existerait pas.
   */
  if (verification.userId !== config.ownerId) {
    return { kind: "anonymous", reason: SIGN_IN };
  }

  return { kind: "owner", userId: verification.userId };
}

/** Identifiant de l'appelant, ou `null` s'il n'est pas authentifié. */
export async function currentUserId(mode?: DataMode): Promise<string | null> {
  const caller = await resolveCaller(mode ?? resolveDataMode());
  return caller.kind === "anonymous" ? null : caller.userId;
}

/**
 * Exige une session, ou renvoie vers l'écran de connexion.
 *
 * À appeler en **première ligne** de chaque page qui lit des données. Cinq
 * pages ne vérifiaient rien : elles ne fuyaient pas — `currentUserId` renvoyait
 * `null` et RLS bloquait le reste — mais elles affichaient « aucune position »
 * à quelqu'un de simplement déconnecté, qui pouvait croire ses données
 * perdues. Et surtout, leur innocuité tenait au hasard : rien n'empêchait la
 * page suivante de lire une donnée avant de vérifier quoi que ce soit.
 *
 * `route-protection.test.ts` énumère les pages et refuse celle qui oublierait
 * cet appel : c'est ce qui transforme cinq précautions individuelles en une
 * garantie.
 */
export async function requireOwner(): Promise<string> {
  const caller = await resolveCaller();
  if (caller.kind === "anonymous") {
    /*
     * `redirect` lève : rien de ce qui suit dans la page appelante ne
     * s'exécute. C'est la propriété qui rend cet appel suffisant à lui seul —
     * un garde qui renverrait un booléen laisserait la page libre de
     * l'ignorer.
     */
    redirect("/connexion");
  }
  return caller.userId;
}
