import type { SupabaseConfig } from "./config";

/**
 * État de session tel que l'interface doit le représenter.
 *
 * Les quatre cas sont distincts et donnent chacun un écran différent. En
 * particulier, `expired` n'est pas `anonymous` : un utilisateur dont la session
 * a expiré doit être reconnecté sans perdre son contexte, pas renvoyé à
 * l'accueil comme un visiteur.
 */
export type SessionState =
  | { readonly status: "unconfigured"; readonly reason: string }
  | { readonly status: "anonymous" }
  | { readonly status: "expired" }
  | { readonly status: "authenticated"; readonly userId: string; readonly email: string | null };

/** Forme minimale d'une session Supabase, sans dépendre du SDK dans les tests. */
export type RawSession = {
  readonly user: { readonly id: string; readonly email?: string | null } | null;
  /** Expiration en secondes depuis l'époque Unix, comme dans le JWT. */
  readonly expires_at?: number | null;
} | null;

/**
 * Marge appliquée avant l'expiration, en secondes.
 *
 * Une session qui expire pendant le vol d'une requête produirait une erreur
 * incompréhensible. On la considère expirée un peu en avance.
 */
export const EXPIRY_LEEWAY_SECONDS = 30;

/**
 * Interprète une session brute.
 *
 * `now` est injectable pour que les tests d'expiration soient déterministes,
 * plutôt que dépendants de l'horloge de la machine.
 */
export function resolveSessionState(
  session: RawSession,
  options: { readonly configured: boolean; readonly reason?: string; readonly now?: Date } = {
    configured: true,
  },
): SessionState {
  if (!options.configured) {
    return { status: "unconfigured", reason: options.reason ?? "Supabase n'est pas configuré." };
  }

  if (session === null || session.user === null) {
    return { status: "anonymous" };
  }

  const expiresAt = session.expires_at;
  if (typeof expiresAt === "number") {
    const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
    if (expiresAt - EXPIRY_LEEWAY_SECONDS <= nowSeconds) {
      return { status: "expired" };
    }
  }

  return {
    status: "authenticated",
    userId: session.user.id,
    email: session.user.email ?? null,
  };
}

/** `true` si l'état autorise l'accès aux données du portefeuille. */
export function canAccessData(state: SessionState): boolean {
  return state.status === "authenticated";
}

/** Message utilisateur associé à un état non authentifié. */
export function sessionMessage(state: SessionState): string | null {
  switch (state.status) {
    case "unconfigured":
      return state.reason;
    case "anonymous":
      return "Connectez-vous pour accéder à votre patrimoine.";
    case "expired":
      return "Votre session a expiré. Reconnectez-vous pour continuer.";
    case "authenticated":
      return null;
  }
}

/**
 * Construit l'URL du point d'authentification.
 *
 * Isolée ici pour que la construction soit testable sans SDK, et pour garantir
 * que la clé anonyme n'est jamais placée en paramètre d'URL — où elle
 * atterrirait dans les journaux d'accès du serveur.
 */
export function authCallbackUrl(config: SupabaseConfig, origin: string): string {
  const url = new URL("/auth/v1/callback", config.url);
  url.searchParams.set("redirect_to", new URL("/", origin).toString());
  return url.toString();
}
