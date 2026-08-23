import { describe, expect, it } from "vitest";

import {
  isSensitiveKey,
  redactContext,
  redactSecrets,
  shortenIdentifiers,
  SECRET_ENV_KEYS,
} from "./redaction.js";

const ENV = {
  TWELVE_DATA_API_KEY: "cle-fictive-twelve-data-123456",
  MARKET_GATEWAY_SHARED_SECRET: "secret-de-canal-fictif-0123456789",
  SUPABASE_ANON_KEY: "abc",
};

describe("redactSecrets", () => {
  it("expurge une clé recopiée dans un message fournisseur", () => {
    const message = `échec 401 pour apikey=${ENV.TWELVE_DATA_API_KEY} sur /quote`;
    expect(redactSecrets(message, ENV)).toBe("échec 401 pour apikey=[expurgé] sur /quote");
  });

  it("expurge toutes les occurrences, et plusieurs secrets à la fois", () => {
    const message = `${ENV.TWELVE_DATA_API_KEY} puis ${ENV.MARKET_GATEWAY_SHARED_SECRET} puis ${ENV.TWELVE_DATA_API_KEY}`;
    expect(redactSecrets(message, ENV)).toBe("[expurgé] puis [expurgé] puis [expurgé]");
  });

  it("ignore une valeur trop courte, qui hacherait le texte légitime", () => {
    // `abc` apparaît dans « abcdefgh » : l'expurger rendrait le journal
    // illisible sans rien protéger.
    expect(redactSecrets("abcdefgh", ENV)).toBe("abcdefgh");
  });

  it("laisse intact un texte sans secret", () => {
    expect(redactSecrets("tout va bien", ENV)).toBe("tout va bien");
  });

  it("couvre la chaîne de connexion, qui contient le mot de passe", () => {
    expect(SECRET_ENV_KEYS).toContain("DATABASE_URL");
    const env = { DATABASE_URL: "postgresql://user:motdepasse@hote:5432/base" };
    expect(redactSecrets(`connexion à ${env.DATABASE_URL}`, env)).toBe("connexion à [expurgé]");
  });
});

describe("isSensitiveKey", () => {
  it("attrape les champs financiers, quelle que soit la casse ou le préfixe", () => {
    for (const key of [
      "marketValueBase",
      "totalUnrealizedPnlBase",
      "average_cost",
      "QUANTITY",
      "navDate",
      "notionalBase",
      "strike",
      "email",
    ]) {
      expect(isSensitiveKey(key), key).toBe(true);
    }
  });

  it("laisse passer les champs de corrélation", () => {
    for (const key of ["requestId", "route", "durationMs", "provider", "status", "level"]) {
      expect(isSensitiveKey(key), key).toBe(false);
    }
  });
});

describe("shortenIdentifiers", () => {
  it("réduit un UUID à son préfixe", () => {
    expect(shortenIdentifiers("position d0000000-0000-4000-8000-00000000b001 lue")).toBe(
      "position d0000000… lue",
    );
  });

  it("réduit chaque UUID d'une même ligne", () => {
    const line = "11111111-1111-4111-8111-111111111111 → 22222222-2222-4222-8222-222222222222";
    expect(shortenIdentifiers(line)).toBe("11111111… → 22222222…");
  });

  it("laisse intact ce qui ressemble sans en être", () => {
    expect(shortenIdentifiers("2026-05-04T17:35:00.000Z")).toBe("2026-05-04T17:35:00.000Z");
  });
});

describe("redactContext", () => {
  it("remplace la valeur des champs financiers", () => {
    expect(redactContext({ marketValueBase: "32343.8925", route: "/analyse" }, ENV)).toEqual({
      marketValueBase: "[expurgé]",
      route: "/analyse",
    });
  });

  it("expurge un nombre aussi bien qu'une chaîne", () => {
    // Le patrimoine journalisé en nombre est exactement aussi lisible.
    expect(redactContext({ totalCHF: 32343.89 }, ENV)).toEqual({ totalCHF: "[expurgé]" });
  });

  it("réduit les identifiants des champs conservés", () => {
    expect(redactContext({ userId: "d0000000-0000-4000-8000-0000000dec00" }, ENV)).toEqual({
      userId: "d0000000…",
    });
  });

  it("expurge un secret glissé dans un champ anodin", () => {
    expect(redactContext({ reason: `refus pour ${ENV.TWELVE_DATA_API_KEY}` }, ENV)).toEqual({
      reason: "refus pour [expurgé]",
    });
  });

  it("préserve booléens, nombres non sensibles et null", () => {
    expect(redactContext({ ok: true, durationMs: 42, error: null }, ENV)).toEqual({
      ok: true,
      durationMs: 42,
      error: null,
    });
  });
});
