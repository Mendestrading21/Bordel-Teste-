import { describe, expect, it } from "vitest";

import {
  authCallbackUrl,
  canAccessData,
  EXPIRY_LEEWAY_SECONDS,
  resolveSessionState,
  sessionMessage,
  type RawSession,
} from "./session";

const NOW = new Date("2026-05-04T12:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);

const session = (overrides: Partial<NonNullable<RawSession>> = {}): RawSession => ({
  user: { id: "11111111-1111-4111-8111-111111111111", email: "utilisateur@example.test" },
  expires_at: NOW_SECONDS + 3600,
  ...overrides,
});

describe("resolveSessionState", () => {
  it("renvoie unconfigured quand Supabase n'est pas configuré", () => {
    const state = resolveSessionState(null, { configured: false, reason: "Absent" });
    expect(state).toEqual({ status: "unconfigured", reason: "Absent" });
  });

  it("renvoie anonymous en l'absence de session", () => {
    expect(resolveSessionState(null, { configured: true, now: NOW }).status).toBe("anonymous");
  });

  it("renvoie anonymous quand la session n'a pas d'utilisateur", () => {
    expect(
      resolveSessionState({ user: null, expires_at: null }, { configured: true, now: NOW }).status,
    ).toBe("anonymous");
  });

  it("renvoie authenticated pour une session valide", () => {
    const state = resolveSessionState(session(), { configured: true, now: NOW });
    expect(state).toEqual({
      status: "authenticated",
      userId: "11111111-1111-4111-8111-111111111111",
      email: "utilisateur@example.test",
    });
  });

  it("accepte une session sans adresse e-mail", () => {
    const state = resolveSessionState(
      session({ user: { id: "11111111-1111-4111-8111-111111111111" } }),
      { configured: true, now: NOW },
    );
    expect(state).toMatchObject({ status: "authenticated", email: null });
  });

  it("renvoie expired pour une session dépassée", () => {
    const state = resolveSessionState(session({ expires_at: NOW_SECONDS - 1 }), {
      configured: true,
      now: NOW,
    });
    expect(state.status).toBe("expired");
  });

  it("applique une marge avant l'expiration réelle", () => {
    // Une session qui expire pendant le vol d'une requête produirait une erreur
    // incompréhensible pour l'utilisateur.
    const juste = resolveSessionState(
      session({ expires_at: NOW_SECONDS + EXPIRY_LEEWAY_SECONDS - 1 }),
      { configured: true, now: NOW },
    );
    expect(juste.status).toBe("expired");

    const encoreValide = resolveSessionState(
      session({ expires_at: NOW_SECONDS + EXPIRY_LEEWAY_SECONDS + 10 }),
      { configured: true, now: NOW },
    );
    expect(encoreValide.status).toBe("authenticated");
  });

  it("considère valide une session sans date d'expiration", () => {
    const state = resolveSessionState(session({ expires_at: null }), {
      configured: true,
      now: NOW,
    });
    expect(state.status).toBe("authenticated");
  });
});

describe("canAccessData", () => {
  it("n'autorise que l'état authenticated", () => {
    expect(canAccessData({ status: "authenticated", userId: "x", email: null })).toBe(true);
    expect(canAccessData({ status: "anonymous" })).toBe(false);
    expect(canAccessData({ status: "expired" })).toBe(false);
    expect(canAccessData({ status: "unconfigured", reason: "" })).toBe(false);
  });
});

describe("sessionMessage", () => {
  it("distingue une session expirée d'un visiteur anonyme", () => {
    const expired = sessionMessage({ status: "expired" });
    const anonymous = sessionMessage({ status: "anonymous" });
    expect(expired).toContain("expiré");
    expect(anonymous).not.toBe(expired);
  });

  it("ne renvoie aucun message pour une session valide", () => {
    expect(sessionMessage({ status: "authenticated", userId: "x", email: null })).toBeNull();
  });
});

describe("authCallbackUrl", () => {
  const config = { url: "https://projet.supabase.co", anonKey: "a".repeat(40) };

  it("construit une URL de rappel vers l'origine de l'application", () => {
    const url = new URL(authCallbackUrl(config, "https://portfolio.example"));
    expect(url.origin).toBe("https://projet.supabase.co");
    expect(url.pathname).toBe("/auth/v1/callback");
    expect(url.searchParams.get("redirect_to")).toBe("https://portfolio.example/");
  });

  it("ne place jamais la clé en paramètre d'URL", () => {
    // Un paramètre d'URL atterrit dans les journaux d'accès du serveur.
    const url = authCallbackUrl(config, "https://portfolio.example");
    expect(url).not.toContain(config.anonKey);
  });
});
