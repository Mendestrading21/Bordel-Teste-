import { describe, expect, it } from "vitest";

import { looksLikeServiceRoleKey, readSupabaseConfig } from "./config";

/** Fabrique un JWT non signé portant le rôle voulu — suffisant pour la détection. */
function fakeJwt(role: string): string {
  const encode = (value: object): string =>
    Buffer.from(JSON.stringify(value))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role, iss: "supabase" })}.signature`;
}

describe("readSupabaseConfig", () => {
  const validKey = "a".repeat(40);

  it("accepte une configuration complète", () => {
    const result = readSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://projet.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: validKey,
    });
    expect(result.configured).toBe(true);
  });

  it("signale une absence totale de configuration sans lever d'exception", () => {
    const result = readSupabaseConfig({});
    expect(result.configured).toBe(false);
    // L'application doit rester démarrable sans Supabase.
    expect(result.configured === false && result.reason).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("signale une configuration partielle", () => {
    const result = readSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://projet.supabase.co" });
    expect(result.configured).toBe(false);
  });

  it("refuse une URL invalide", () => {
    const result = readSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: "pas-une-url",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: validKey,
    });
    expect(result.configured).toBe(false);
  });

  it("ne recopie pas la clé reçue dans le message d'erreur", () => {
    const result = readSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: "pas-une-url",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "cle-trop-courte",
    });
    expect(result.configured).toBe(false);
    expect(result.configured === false && result.reason).not.toContain("cle-trop-courte");
  });
});

describe("looksLikeServiceRoleKey", () => {
  it("détecte une clé service_role exposée au navigateur", () => {
    // Ce cas rendrait toutes les politiques RLS contournables par quiconque
    // lit le bundle JavaScript.
    expect(looksLikeServiceRoleKey(fakeJwt("service_role"))).toBe(true);
  });

  it("accepte une clé anon", () => {
    expect(looksLikeServiceRoleKey(fakeJwt("anon"))).toBe(false);
  });

  it("accepte une clé authenticated", () => {
    expect(looksLikeServiceRoleKey(fakeJwt("authenticated"))).toBe(false);
  });

  it("ne se prononce pas sur une valeur qui n'est pas un JWT", () => {
    expect(looksLikeServiceRoleKey("sb_publishable_abcdef")).toBe(false);
    expect(looksLikeServiceRoleKey("")).toBe(false);
    expect(looksLikeServiceRoleKey("a.b.c")).toBe(false);
  });
});
