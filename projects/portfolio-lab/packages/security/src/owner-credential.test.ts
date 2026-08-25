import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  hashPassphrase,
  issueSessionCookie,
  MIN_PASSPHRASE_LENGTH,
  SESSION_TTL_MS,
  verifyPassphrase,
  verifySessionCookie,
} from "./owner-credential.js";

const OWNER = "00000000-0000-4000-8000-0000000dec00";
const SECRET = "un-secret-de-session-de-plus-de-32-caracteres";
const PASSPHRASE = "cheval-batterie-agrafe-correct";

describe("phrase secrète", () => {
  it("accepte la bonne phrase", () => {
    expect(verifyPassphrase(PASSPHRASE, hashPassphrase(PASSPHRASE))).toBe(true);
  });

  it("refuse une phrase différente", () => {
    expect(verifyPassphrase("autre-chose-entierement", hashPassphrase(PASSPHRASE))).toBe(false);
  });

  /*
   * Deux hachages de la même phrase doivent différer : sans sel, un hachage
   * volé se retournerait par table précalculée, et deux comptes portant la même
   * phrase se reconnaîtraient à l'œil nu.
   */
  it("produit un hachage différent à chaque appel", () => {
    expect(hashPassphrase(PASSPHRASE)).not.toBe(hashPassphrase(PASSPHRASE));
  });

  it("ne contient jamais la phrase en clair", () => {
    expect(hashPassphrase(PASSPHRASE)).not.toContain(PASSPHRASE);
  });

  it("refuse une phrase trop courte", () => {
    expect(() => hashPassphrase("a".repeat(MIN_PASSPHRASE_LENGTH - 1))).toThrow(TypeError);
  });

  /*
   * Un « é » saisi au clavier suisse et le même caractère composé autrement
   * sont deux suites d'octets différentes. Sans normalisation, la phrase
   * deviendrait irrécupérable sans que rien ne l'explique.
   */
  it("normalise les formes Unicode équivalentes", () => {
    const compose = "prévoyance-genevoise-2026";
    const decompose = "prévoyance-genevoise-2026";
    expect(compose).not.toBe(decompose);
    expect(verifyPassphrase(decompose, hashPassphrase(compose))).toBe(true);
  });

  /*
   * Une variable d'environnement mal recopiée ne doit pas transformer un refus
   * de connexion en erreur serveur, qui apprendrait à un visiteur que la
   * configuration est cassée.
   */
  it("refuse sans lever sur un hachage malformé", () => {
    for (const bad of ["", "n'importe quoi", "scrypt$abc", "bcrypt$a$b", "scrypt$$"]) {
      expect(() => verifyPassphrase(PASSPHRASE, bad)).not.toThrow();
      expect(verifyPassphrase(PASSPHRASE, bad)).toBe(false);
    }
  });
});

describe("cookie de session", () => {
  const NOW = 1_787_500_800_000;

  it("émet un cookie que la vérification accepte", () => {
    const cookie = issueSessionCookie(OWNER, SECRET, NOW);
    expect(verifySessionCookie(cookie, SECRET, NOW + 1_000)).toEqual({
      valid: true,
      userId: OWNER,
    });
  });

  it("applique la durée de vie de trente jours", () => {
    const cookie = issueSessionCookie(OWNER, SECRET, NOW);
    expect(Number(cookie.split(".")[1])).toBe(NOW + SESSION_TTL_MS);
  });

  it("refuse un cookie expiré", () => {
    const cookie = issueSessionCookie(OWNER, SECRET, NOW, 1_000);
    expect(verifySessionCookie(cookie, SECRET, NOW + 2_000)).toEqual({
      valid: false,
      reason: "EXPIRED",
    });
  });

  it("refuse un cookie signé avec un autre secret", () => {
    const cookie = issueSessionCookie(OWNER, SECRET, NOW);
    const other = "un-tout-autre-secret-de-plus-de-32-caracteres";
    expect(verifySessionCookie(cookie, other, NOW + 1_000).valid).toBe(false);
  });

  /*
   * Le cas qui compte : réécrire l'identité dans un cookie par ailleurs valide.
   * Sans signature sur l'identifiant, il suffirait de le remplacer pour lire le
   * portefeuille de quelqu'un d'autre.
   */
  it("refuse une identité modifiée après signature", () => {
    const cookie = issueSessionCookie(OWNER, SECRET, NOW);
    const [, expiresAt, signature] = cookie.split(".");
    const forged = `11111111-1111-4111-8111-111111111111.${expiresAt}.${signature}`;
    expect(verifySessionCookie(forged, SECRET, NOW + 1_000)).toEqual({
      valid: false,
      reason: "BAD_SIGNATURE",
    });
  });

  it("refuse une expiration repoussée après signature", () => {
    const cookie = issueSessionCookie(OWNER, SECRET, NOW, 1_000);
    const [userId, , signature] = cookie.split(".");
    const forged = `${userId}.${NOW + SESSION_TTL_MS}.${signature}`;
    expect(verifySessionCookie(forged, SECRET, NOW + 2_000).valid).toBe(false);
  });

  /*
   * Signature avant expiration : répondre « expiré » à un cookie mal signé
   * confirmerait à un attaquant que sa signature était bonne.
   */
  it("dit « signature invalide » et non « expiré » sur un cookie périmé ET mal signé", () => {
    const payload = `${OWNER}.${NOW - 1_000}`;
    const wrong = createHmac("sha256", "mauvais-secret").update(payload).digest("base64url");
    expect(verifySessionCookie(`${payload}.${wrong}`, SECRET, NOW)).toEqual({
      valid: false,
      reason: "BAD_SIGNATURE",
    });
  });

  it("refuse un secret trop court à l'émission", () => {
    expect(() => issueSessionCookie(OWNER, "trop-court", 0)).toThrow(TypeError);
  });

  it("refuse un identifiant qui n'est pas un UUID", () => {
    expect(() => issueSessionCookie("proprietaire", SECRET, 0)).toThrow(TypeError);
  });

  it("refuse un cookie malformé sans planter", () => {
    for (const bad of ["", "a.b", "a.b.c.d", "pas-un-uuid.123.sig"]) {
      expect(verifySessionCookie(bad, SECRET, NOW)).toEqual({ valid: false, reason: "MALFORMED" });
    }
  });
});
