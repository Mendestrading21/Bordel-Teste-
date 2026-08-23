import { describe, expect, it } from "vitest";

import { DEFAULT_TOKEN_TTL_MS, issueChannelToken, verifyChannelToken } from "./channel-auth.js";

const SECRET = "un-secret-partage-de-plus-de-32-caracteres";
const OTHER_SECRET = "un-autre-secret-de-plus-de-32-caracteres!!";
const USER = "11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-06-15T14:00:00.000Z");

describe("issueChannelToken", () => {
  it("émet un jeton en trois segments", () => {
    expect(issueChannelToken(USER, SECRET, NOW).split(".")).toHaveLength(3);
  });

  it("applique la durée de vie par défaut", () => {
    const token = issueChannelToken(USER, SECRET, NOW);
    const expiresAt = Number(token.split(".")[1]);
    expect(expiresAt).toBe(NOW + DEFAULT_TOKEN_TTL_MS);
  });

  it("refuse un identifiant qui n'est pas un UUID", () => {
    expect(() => issueChannelToken("admin", SECRET, NOW)).toThrow(TypeError);
  });

  it("refuse un secret trop court", () => {
    // Un secret court rend le HMAC attaquable par force brute hors ligne.
    expect(() => issueChannelToken(USER, "court", NOW)).toThrow(/32 caractères/);
  });

  it("ne contient jamais le secret", () => {
    expect(issueChannelToken(USER, SECRET, NOW)).not.toContain(SECRET);
  });
});

describe("verifyChannelToken", () => {
  it("accepte un jeton valide et renvoie l'identité", () => {
    const token = issueChannelToken(USER, SECRET, NOW);
    expect(verifyChannelToken(token, SECRET, NOW + 1_000)).toEqual({ valid: true, userId: USER });
  });

  it("refuse un jeton expiré", () => {
    const token = issueChannelToken(USER, SECRET, NOW);
    const result = verifyChannelToken(token, SECRET, NOW + DEFAULT_TOKEN_TTL_MS + 1);
    expect(result).toEqual({ valid: false, reason: "EXPIRED" });
  });

  it("refuse un jeton signé avec un autre secret", () => {
    const token = issueChannelToken(USER, OTHER_SECRET, NOW);
    expect(verifyChannelToken(token, SECRET, NOW)).toEqual({
      valid: false,
      reason: "BAD_SIGNATURE",
    });
  });

  it("refuse une identité modifiée après signature", () => {
    const token = issueChannelToken(USER, SECRET, NOW);
    const [, expiresAt, signature] = token.split(".");
    const forged = `22222222-2222-4222-8222-222222222222.${expiresAt}.${signature}`;
    expect(verifyChannelToken(forged, SECRET, NOW)).toEqual({
      valid: false,
      reason: "BAD_SIGNATURE",
    });
  });

  it("refuse une expiration repoussée après signature", () => {
    const token = issueChannelToken(USER, SECRET, NOW);
    const [userId, , signature] = token.split(".");
    const forged = `${userId}.${NOW + 10 * 365 * 24 * 3_600_000}.${signature}`;
    expect(verifyChannelToken(forged, SECRET, NOW)).toEqual({
      valid: false,
      reason: "BAD_SIGNATURE",
    });
  });

  it("répond BAD_SIGNATURE avant EXPIRED sur un jeton à la fois expiré et mal signé", () => {
    /*
     * L'ordre n'est pas cosmétique : répondre « expiré » à un jeton mal signé
     * confirmerait à un attaquant que sa signature était bonne, et lui
     * permettrait de forger un jeton en ne corrigeant que l'expiration.
     */
    const token = issueChannelToken(USER, OTHER_SECRET, NOW);
    const result = verifyChannelToken(token, SECRET, NOW + DEFAULT_TOKEN_TTL_MS + 1);
    expect(result).toEqual({ valid: false, reason: "BAD_SIGNATURE" });
  });

  it.each([
    ["chaîne vide", ""],
    ["un seul segment", "abc"],
    ["deux segments", "abc.def"],
    ["quatre segments", "a.b.c.d"],
    ["identité non-UUID", "admin.9999999999999.sig"],
    ["expiration non numérique", `${USER}.demain.sig`],
  ])("refuse un jeton malformé : %s", (_label, token) => {
    const result = verifyChannelToken(token, SECRET, NOW);
    expect(result.valid).toBe(false);
  });

  it("refuse une signature de longueur différente sans planter", () => {
    // `timingSafeEqual` lève sur des longueurs inégales ; la comparaison
    // préalable évite que le canal tombe sur un jeton tronqué.
    const token = issueChannelToken(USER, SECRET, NOW);
    const [userId, expiresAt] = token.split(".");
    expect(verifyChannelToken(`${userId}.${expiresAt}.x`, SECRET, NOW)).toEqual({
      valid: false,
      reason: "BAD_SIGNATURE",
    });
  });

  it("refuse un jeton expirant exactement maintenant", () => {
    const token = issueChannelToken(USER, SECRET, NOW, 1_000);
    expect(verifyChannelToken(token, SECRET, NOW + 1_000).valid).toBe(false);
  });
});
