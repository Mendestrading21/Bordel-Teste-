import { describe, expect, it } from "vitest";

import {
  hashPassphrase,
  issueSessionCookie,
  verifyPassphrase,
  verifySessionCookie,
} from "@portfolio-lab/security";

import { DEMO_USER, hasTestDatabase, setupTestDatabase, type TestDatabase } from "../helpers/database.js";
import { afterAll, beforeAll } from "vitest";

/**
 * La session du propriétaire ouvre-t-elle réellement les données ?
 *
 * Jusqu'ici, treize points d'accès de l'application ne délivraient d'identité
 * qu'en mode démonstration. En mode base — le seul autorisé en production —
 * chacun renvoyait `null`, et l'application était donc **entièrement vide** une
 * fois déployée, sans aucun moyen de la remplir.
 *
 * Cette suite vérifie le maillon qui manquait, contre un vrai PostgreSQL et ses
 * politiques RLS : une session émise pour un identifiant donne accès aux
 * lignes de cet identifiant, et à aucune autre.
 */
describe.skipIf(!hasTestDatabase)("session du propriétaire", () => {
  let db: TestDatabase;
  const SECRET = "un-secret-de-session-de-plus-de-32-caracteres";
  const NOW = 1_787_500_800_000;

  beforeAll(async () => {
    db = await setupTestDatabase({ name: "owner_session", seed: true });
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("une session valide ouvre le portefeuille de son propriétaire", async () => {
    const cookie = issueSessionCookie(DEMO_USER, SECRET, NOW);
    const verification = verifySessionCookie(cookie, SECRET, NOW + 1_000);

    expect(verification.valid).toBe(true);
    if (!verification.valid) throw new Error("session attendue valide");

    const rows = await db.asUser(verification.userId, async (client) => {
      const result = await client.query<{ count: string }>("select count(*)::text from positions");
      return Number(result.rows[0]?.count ?? "0");
    });

    // Le seed de démonstration appartient à cet identifiant : sans session, ce
    // compte valait zéro quelle que soit la base.
    expect(rows).toBeGreaterThan(0);
  });

  /*
   * Le complément indispensable : la session ne doit pas devenir un passe.
   * RLS reste la barrière, et une identité valide mais différente ne voit rien.
   */
  it("une session d'un autre identifiant ne voit aucune position", async () => {
    const other = "11111111-1111-4111-8111-111111111111";
    const cookie = issueSessionCookie(other, SECRET, NOW);
    const verification = verifySessionCookie(cookie, SECRET, NOW + 1_000);
    if (!verification.valid) throw new Error("session attendue valide");

    const rows = await db.asUser(verification.userId, async (client) => {
      const result = await client.query<{ count: string }>("select count(*)::text from positions");
      return Number(result.rows[0]?.count ?? "0");
    });

    expect(rows).toBe(0);
  });

  it("un cookie falsifié n'ouvre rien", () => {
    const cookie = issueSessionCookie(DEMO_USER, SECRET, NOW);
    const [, expiresAt, signature] = cookie.split(".");
    const forged = `11111111-1111-4111-8111-111111111111.${expiresAt}.${signature}`;

    expect(verifySessionCookie(forged, SECRET, NOW + 1_000).valid).toBe(false);
  });

  it("la phrase secrète du propriétaire se vérifie de bout en bout", () => {
    const passphrase = "prévoyance-genevoise-2026";
    const stored = hashPassphrase(passphrase);

    expect(verifyPassphrase(passphrase, stored)).toBe(true);
    expect(verifyPassphrase("prévoyance-genevoise-2027", stored)).toBe(false);
  });
});
