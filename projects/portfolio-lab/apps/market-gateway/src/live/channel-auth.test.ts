import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { DEFAULT_TOKEN_TTL_MS, MAX_SCOPE_SYMBOLS, issueChannelToken, verifyChannelToken } from "./channel-auth.js";

const SECRET = "un-secret-partage-de-plus-de-32-caracteres";
const OTHER_SECRET = "un-autre-secret-de-plus-de-32-caracteres!!";
const USER = "11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-06-15T14:00:00.000Z");

describe("issueChannelToken", () => {
  it("émet un jeton en quatre segments", () => {
    // Identité, expiration, périmètre, signature. Le périmètre est le segment
    // qui manquait : sans lui le jeton n'autorisait rien de moins que tout.
    expect(issueChannelToken(USER, SECRET, NOW, ["AAPL"]).split(".")).toHaveLength(4);
  });

  it("applique la durée de vie par défaut", () => {
    const token = issueChannelToken(USER, SECRET, NOW, ["AAPL"]);
    const expiresAt = Number(token.split(".")[1]);
    expect(expiresAt).toBe(NOW + DEFAULT_TOKEN_TTL_MS);
  });

  it("refuse un identifiant qui n'est pas un UUID", () => {
    expect(() => issueChannelToken("admin", SECRET, NOW, ["AAPL"])).toThrow(TypeError);
  });

  it("refuse un secret trop court", () => {
    // Un secret court rend le HMAC attaquable par force brute hors ligne.
    expect(() => issueChannelToken(USER, "court", NOW, ["AAPL"])).toThrow(/32 caractères/);
  });

  it("ne contient jamais le secret", () => {
    expect(issueChannelToken(USER, SECRET, NOW, ["AAPL"])).not.toContain(SECRET);
  });
});

describe("verifyChannelToken", () => {
  it("accepte un jeton valide et renvoie l'identité avec son périmètre", () => {
    const token = issueChannelToken(USER, SECRET, NOW, ["AAPL"]);
    expect(verifyChannelToken(token, SECRET, NOW + 1_000)).toEqual({
      valid: true,
      userId: USER,
      // Le périmètre est rendu au vérificateur : c'est lui qui permet à la
      // passerelle de refuser un abonnement hors portefeuille.
      scope: ["AAPL"],
    });
  });

  it("refuse un jeton expiré", () => {
    const token = issueChannelToken(USER, SECRET, NOW, ["AAPL"]);
    const result = verifyChannelToken(token, SECRET, NOW + DEFAULT_TOKEN_TTL_MS + 1);
    expect(result).toEqual({ valid: false, reason: "EXPIRED" });
  });

  it("refuse un jeton signé avec un autre secret", () => {
    const token = issueChannelToken(USER, OTHER_SECRET, NOW, ["AAPL"]);
    expect(verifyChannelToken(token, SECRET, NOW)).toEqual({
      valid: false,
      reason: "BAD_SIGNATURE",
    });
  });

  it("refuse une identité modifiée après signature", () => {
    const token = issueChannelToken(USER, SECRET, NOW, ["AAPL"]);
    const [, expiresAt, scope, signature] = token.split(".");
    const forged = `22222222-2222-4222-8222-222222222222.${expiresAt}.${scope}.${signature}`;
    expect(verifyChannelToken(forged, SECRET, NOW)).toEqual({
      valid: false,
      reason: "BAD_SIGNATURE",
    });
  });

  it("refuse une expiration repoussée après signature", () => {
    const token = issueChannelToken(USER, SECRET, NOW, ["AAPL"]);
    const [userId, , scope, signature] = token.split(".");
    const forged = `${userId}.${NOW + 10 * 365 * 24 * 3_600_000}.${scope}.${signature}`;
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
    const token = issueChannelToken(USER, OTHER_SECRET, NOW, ["AAPL"]);
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
    const token = issueChannelToken(USER, SECRET, NOW, ["AAPL"]);
    const [userId, expiresAt, scope] = token.split(".");
    expect(verifyChannelToken(`${userId}.${expiresAt}.${scope}.x`, SECRET, NOW)).toEqual({
      valid: false,
      reason: "BAD_SIGNATURE",
    });
  });

  it("refuse un jeton expirant exactement maintenant", () => {
    const token = issueChannelToken(USER, SECRET, NOW, ["AAPL"], 1_000);
    expect(verifyChannelToken(token, SECRET, NOW + 1_000).valid).toBe(false);
  });
});

describe("périmètre du jeton", () => {
  const SECRET = "un-secret-de-plus-de-trente-deux-caracteres!";
  const USER = "00000000-0000-4000-8000-0000000dec00";

  it("transporte le périmètre et le rend à la vérification", () => {
    const token = issueChannelToken(USER, SECRET, 1_000, ["MSFT", "AAPL"]);
    const result = verifyChannelToken(token, SECRET, 2_000);

    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error("jeton attendu valide");
    // Trié : un même périmètre doit produire le même jeton.
    expect(result.scope).toEqual(["AAPL", "MSFT"]);
  });

  it("accepte un périmètre vide, qui n'autorise rien", () => {
    const result = verifyChannelToken(issueChannelToken(USER, SECRET, 1_000, []), SECRET, 2_000);
    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error("jeton attendu valide");
    expect(result.scope).toEqual([]);
  });

  /*
   * Le cœur du lot. Un jeton à trois parties est celui d'avant le périmètre :
   * il n'en portait aucun et autorisait donc tout. L'accepter « pour
   * compatibilité » laisserait la faille ouverte à quiconque en détient encore
   * un valide.
   */
  it("refuse un jeton sans périmètre, même correctement signé", () => {
    const expiresAt = 2_000;
    const payload = `${USER}.${expiresAt}`;
    const signature = createHmac("sha256", SECRET).update(payload).digest("base64url");

    const result = verifyChannelToken(`${payload}.${signature}`, SECRET, 1_000);

    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("jeton attendu invalide");
    expect(result.reason).toBe("MALFORMED");
  });

  it("le périmètre est couvert par la signature", () => {
    const token = issueChannelToken(USER, SECRET, 1_000, ["AAPL"]);
    const parts = token.split(".");
    const forgedScope = Buffer.from("AAPL,TSLA", "utf8").toString("base64url");

    const result = verifyChannelToken(
      `${parts[0]}.${parts[1]}.${forgedScope}.${parts[3]}`,
      SECRET,
      2_000,
    );

    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("jeton attendu invalide");
    expect(result.reason).toBe("BAD_SIGNATURE");
  });

  /*
   * Un symbole contenant le séparateur produirait un périmètre plus large que
   * celui demandé : l'exploitant fabriquerait lui-même la faille. Refusé à
   * l'émission, pas seulement à la vérification.
   */
  it("refuse à l'émission un symbole contenant le séparateur", () => {
    expect(() => issueChannelToken(USER, SECRET, 1_000, ["AAPL,TSLA"])).toThrow(TypeError);
  });

  it("refuse à l'émission un périmètre au-delà du plafond", () => {
    const tooMany = Array.from({ length: MAX_SCOPE_SYMBOLS + 1 }, (_unused, i) => `SYM${i}`);
    expect(() => issueChannelToken(USER, SECRET, 1_000, tooMany)).toThrow(TypeError);
  });

  it("rejette un périmètre entier plutôt que d'en retenir les entrées valides", () => {
    const expiresAt = 2_000;
    const badScope = Buffer.from("AAPL,TSLA$$$", "utf8").toString("base64url");
    const payload = `${USER}.${expiresAt}.${badScope}`;
    const signature = createHmac("sha256", SECRET).update(payload).digest("base64url");

    const result = verifyChannelToken(`${payload}.${signature}`, SECRET, 1_000);

    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("jeton attendu invalide");
    expect(result.reason).toBe("MALFORMED");
  });
});
