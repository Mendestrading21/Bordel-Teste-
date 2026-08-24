import { describe, expect, it } from "vitest";

import { isEgressBlocked } from "./egress.js";

describe("isEgressBlocked", () => {
  it("reconnaît le refus d'une passerelle à liste blanche", () => {
    /*
     * Le message réellement reçu depuis cet environnement. Un `403` de
     * passerelle est indiscernable d'un `403` fournisseur au niveau du code de
     * statut : seul le corps tranche.
     */
    expect(
      isEgressBlocked(
        "HTTP 403 — Host not in allowlist: eodhd.com. Add this host to your network egress settings to allow access.",
      ),
    ).toBe(true);
  });

  it("reconnaît les autres formes de blocage réseau", () => {
    for (const message of [
      "connect ECONNREFUSED 127.0.0.1:443",
      "getaddrinfo ENOTFOUND api.twelvedata.com",
      "getaddrinfo EAI_AGAIN api.coingecko.com",
      "CONNECT tunnel failed, response 403",
      "Blocked by proxy policy",
      "Proxy Authentication Required",
    ]) {
      expect(isEgressBlocked(message), message).toBe(true);
    }
  });

  it("ne prend pas un vrai refus de clé pour un blocage réseau", () => {
    /*
     * La symétrie du problème : annoncer à tort « réseau bloqué » masquerait
     * une clé réellement invalide, et on chercherait un problème de réseau
     * pour un problème de clé. En cas de doute, on garde le diagnostic
     * d'origine.
     */
    for (const message of [
      "EODHD a refusé la clé (HTTP 403)",
      "Invalid API key",
      "Your plan does not include real-time data",
      "Unauthorized",
      "Forbidden",
      "quota dépassé",
      "",
    ]) {
      expect(isEgressBlocked(message), message).toBe(false);
    }
  });
});
