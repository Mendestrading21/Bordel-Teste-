import { describe, expect, it } from "vitest";

import { issueSessionCookie } from "@portfolio-lab/security";

import { decideCaller, readOwnerConfig } from "./owner";

const OWNER = "00000000-0000-4000-8000-0000000dec00";
const SECRET = "un-secret-de-session-de-plus-de-32-caracteres";
const HASH = "scrypt$abc$def";

const complete = {
  PORTFOLIO_LAB_OWNER_ID: OWNER,
  PORTFOLIO_LAB_SESSION_SECRET: SECRET,
  PORTFOLIO_LAB_PASSPHRASE_HASH: HASH,
};

describe("configuration du propriétaire", () => {
  it("accepte une configuration complète", () => {
    const config = readOwnerConfig(complete);
    expect(config.configured).toBe(true);
    if (!config.configured) throw new Error("configuration attendue");
    expect(config.ownerId).toBe(OWNER);
  });

  /*
   * Le message doit nommer ce qui manque. Un « connexion impossible » sec
   * enverrait l'exploitant chercher au hasard dans trois variables.
   */
  it("nomme les variables manquantes", () => {
    const config = readOwnerConfig({});
    expect(config.configured).toBe(false);
    if (config.configured) throw new Error("configuration incomplète attendue");
    expect(config.reason).toContain("PORTFOLIO_LAB_OWNER_ID");
    expect(config.reason).toContain("PORTFOLIO_LAB_SESSION_SECRET");
    expect(config.reason).toContain("PORTFOLIO_LAB_PASSPHRASE_HASH");
  });

  it("refuse un identifiant qui n'est pas un UUID", () => {
    const config = readOwnerConfig({ ...complete, PORTFOLIO_LAB_OWNER_ID: "proprietaire" });
    expect(config.configured).toBe(false);
  });

  /*
   * Un secret court rend le HMAC attaquable hors ligne. Refuser d'ouvrir la
   * connexion vaut mieux qu'émettre des sessions falsifiables.
   */
  it("refuse un secret de signature trop court", () => {
    const config = readOwnerConfig({ ...complete, PORTFOLIO_LAB_SESSION_SECRET: "court" });
    expect(config.configured).toBe(false);
    if (config.configured) throw new Error("configuration incomplète attendue");
    expect(config.reason).toContain("32");
  });

  it("traite une variable vide comme absente", () => {
    const config = readOwnerConfig({ ...complete, PORTFOLIO_LAB_PASSPHRASE_HASH: "" });
    expect(config.configured).toBe(false);
  });

  /*
   * Le hachage ne doit jamais ressortir de cette fonction : la rendre
   * disponible à tout appelant l'exposerait à des endroits qui n'ont besoin que
   * de savoir si l'application est configurée.
   */
  it("ne rend jamais le hachage de la phrase", () => {
    expect(JSON.stringify(readOwnerConfig(complete))).not.toContain(HASH);
  });

  it("ne recopie jamais les valeurs reçues dans le message d'erreur", () => {
    const config = readOwnerConfig({
      PORTFOLIO_LAB_OWNER_ID: "identifiant-invalide-mais-secret",
      PORTFOLIO_LAB_SESSION_SECRET: SECRET,
      PORTFOLIO_LAB_PASSPHRASE_HASH: HASH,
    });
    if (config.configured) throw new Error("configuration incomplète attendue");
    expect(config.reason).not.toContain("identifiant-invalide-mais-secret");
  });
});

describe("décision d'accès", () => {
  const NOW = 1_787_500_800_000;
  const config = { configured: true as const, ownerId: OWNER, secret: SECRET };

  it("ouvre l'accès sur un cookie valide du propriétaire", () => {
    const cookie = issueSessionCookie(OWNER, SECRET, NOW);
    expect(decideCaller(config, cookie, NOW + 1_000)).toEqual({ kind: "owner", userId: OWNER });
  });

  it("refuse en l'absence de cookie", () => {
    const caller = decideCaller(config, undefined, NOW);
    expect(caller.kind).toBe("anonymous");
  });

  /*
   * Le cas que le parcours navigateur ne peut pas produire : un cookie
   * **correctement signé** par ce serveur, mais pour un autre identifiant.
   *
   * Le HMAC prouve que ce serveur a émis le cookie, pas qu'il désigne encore
   * quelqu'un d'autorisé. Sans cette comparaison, changer
   * `PORTFOLIO_LAB_OWNER_ID` ne révoquerait aucune session — et ce changement
   * est le seul moyen de toutes les révoquer d'un coup après un vol.
   */
  it("refuse un cookie bien signé émis pour un autre identifiant", () => {
    const other = "11111111-1111-4111-8111-111111111111";
    const cookie = issueSessionCookie(other, SECRET, NOW);

    const caller = decideCaller(config, cookie, NOW + 1_000);

    expect(caller.kind).toBe("anonymous");
    if (caller.kind !== "anonymous") throw new Error("refus attendu");
    // Le motif ne dit pas que le cookie était valide : cela apprendrait au
    // porteur qu'il détient une signature authentique.
    expect(caller.reason).toBe("Connectez-vous pour accéder à votre patrimoine.");
  });

  it("distingue une session expirée d'une absence de session", () => {
    const cookie = issueSessionCookie(OWNER, SECRET, NOW, 1_000);
    const caller = decideCaller(config, cookie, NOW + 2_000);

    if (caller.kind !== "anonymous") throw new Error("refus attendu");
    // Un utilisateur dont la session a expiré n'est pas un visiteur : le lui
    // dire évite qu'il croie ses données perdues.
    expect(caller.reason).toContain("expiré");
  });

  it("refuse un cookie signé avec un autre secret", () => {
    const cookie = issueSessionCookie(OWNER, "un-tout-autre-secret-de-plus-de-32-caract", NOW);
    expect(decideCaller(config, cookie, NOW + 1_000).kind).toBe("anonymous");
  });

  it("refuse un cookie illisible sans planter", () => {
    for (const bad of ["", "n'importe quoi", "a.b.c"]) {
      expect(decideCaller(config, bad, NOW).kind).toBe("anonymous");
    }
  });
});
