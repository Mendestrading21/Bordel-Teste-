import { describe, expect, it } from "vitest";

import { createRateLimiter } from "./rate-limit.js";

const T0 = 1_000_000;

describe("createRateLimiter", () => {
  it("autorise jusqu'à la limite puis refuse", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });

    expect(limiter.check("a", T0)).toEqual({ allowed: true, remaining: 2 });
    expect(limiter.check("a", T0 + 1)).toEqual({ allowed: true, remaining: 1 });
    expect(limiter.check("a", T0 + 2)).toEqual({ allowed: true, remaining: 0 });

    const refused = limiter.check("a", T0 + 3);
    expect(refused.allowed).toBe(false);
  });

  it("compte chaque clé séparément", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

    expect(limiter.check("alice", T0).allowed).toBe(true);
    expect(limiter.check("bob", T0).allowed).toBe(true);
    expect(limiter.check("alice", T0).allowed).toBe(false);
  });

  it("libère la fenêtre glissante au bon moment", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1_000 });

    limiter.check("a", T0);
    limiter.check("a", T0 + 500);
    expect(limiter.check("a", T0 + 900).allowed).toBe(false);

    // Le premier appel sort de la fenêtre à T0 + 1000 exclu.
    expect(limiter.check("a", T0 + 1_001).allowed).toBe(true);
  });

  it("ne laisse pas passer le double de la limite à cheval sur une frontière", () => {
    /*
     * C'est le défaut classique d'une fenêtre fixe : dix appels à la fin d'une
     * minute et dix au début de la suivante font vingt appels en deux secondes.
     */
    const limiter = createRateLimiter({ limit: 2, windowMs: 1_000 });

    limiter.check("a", T0 + 900);
    limiter.check("a", T0 + 990);
    expect(limiter.check("a", T0 + 1_010).allowed).toBe(false);
  });

  it("annonce un délai d'attente exploitable", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 5_000 });
    limiter.check("a", T0);

    const refused = limiter.check("a", T0 + 1_000);
    expect(refused.allowed).toBe(false);
    if (!refused.allowed) {
      expect(refused.retryAfterMs).toBe(4_000);
    }
  });

  it("un refus ne prolonge pas la pénalité", () => {
    // Compter les appels refusés transformerait la limite en bannissement pour
    // un client qui réessaie en boucle.
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 });
    limiter.check("a", T0);

    for (let attempt = 1; attempt <= 20; attempt += 1) {
      expect(limiter.check("a", T0 + attempt).allowed).toBe(false);
    }

    expect(limiter.check("a", T0 + 1_001).allowed).toBe(true);
  });

  it("oublie une clé sur demande", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.check("a", T0);
    expect(limiter.check("a", T0).allowed).toBe(false);

    limiter.reset("a");
    expect(limiter.check("a", T0).allowed).toBe(true);
  });

  it("borne la table pour ne pas devenir un vecteur d'épuisement mémoire", () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 1_000, maxKeys: 10 });

    for (let index = 0; index < 50; index += 1) {
      limiter.check(`cle-${index}`, T0);
    }
    expect(limiter.size()).toBeGreaterThan(10);

    // Une fois les fenêtres expirées, le nettoyage vide la table.
    limiter.check("declencheur", T0 + 2_000);
    expect(limiter.size()).toBe(1);
  });

  it("refuse une configuration absurde plutôt que de ne rien limiter", () => {
    expect(() => createRateLimiter({ limit: 0, windowMs: 1_000 })).toThrow(RangeError);
    expect(() => createRateLimiter({ limit: 1, windowMs: 0 })).toThrow(RangeError);
  });
});
