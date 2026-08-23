import { describe, expect, it } from "vitest";

import { isActiveNav, NAV_ITEMS } from "./nav-items";

describe("NAV_ITEMS", () => {
  it("expose les cinq onglets de la spécification, Ajouter au centre", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      "Accueil",
      "Positions",
      "Ajouter",
      "Analyse",
      "Réglages",
    ]);
    expect(NAV_ITEMS[2]?.label).toBe("Ajouter");
  });

  it("donne à chaque onglet un chemin et une description uniques", () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const item of NAV_ITEMS) {
      expect(item.description.length).toBeGreaterThan(0);
    }
  });
});

describe("isActiveNav", () => {
  it("n'active la racine que sur la racine exacte", () => {
    expect(isActiveNav("/", "/")).toBe(true);
    expect(isActiveNav("/positions", "/")).toBe(false);
  });

  it("active un onglet sur ses sous-routes", () => {
    expect(isActiveNav("/positions", "/positions")).toBe(true);
    expect(isActiveNav("/positions/abc-123", "/positions")).toBe(true);
  });

  it("ne confond pas deux chemins partageant un préfixe textuel", () => {
    expect(isActiveNav("/positions-archivees", "/positions")).toBe(false);
  });
});
