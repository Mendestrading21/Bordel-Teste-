import { describe, expect, it } from "vitest";

import { ProviderError } from "./contract.js";
import { providerDecimal } from "./provider-decimal.js";

describe("providerDecimal", () => {
  it("supprime les zéros de queue d'un fournisseur qui en ajoute", () => {
    // Forme réelle d'une réponse Twelve Data.
    expect(providerDecimal("227.31000", "twelvedata", "close")).toBe("227.31");
  });

  it("rend la même chaîne pour la même valeur écrite différemment", () => {
    // C'est tout l'objet de la normalisation : sans elle, le même prix chez
    // deux fournisseurs ne serait pas comparable.
    const forms = ["227.31", "227.31000", "227.310", " 227.31 ", "+227.31"];
    const normalised = forms.map((form) => providerDecimal(form, "test", "close"));
    expect(new Set(normalised).size).toBe(1);
    expect(normalised[0]).toBe("227.31");
  });

  it("accepte un nombre JSON, comme en renvoie CoinGecko", () => {
    expect(providerDecimal(64231.5, "coingecko", "price")).toBe("64231.5");
  });

  it("n'arrondit jamais", () => {
    // Un fournisseur crypto peut envoyer dix-huit décimales. Les tronquer ici
    // détruirait de la précision que la couche d'affichage saurait masquer.
    const tiny = "0.000000000000000123";
    expect(providerDecimal(tiny, "test", "price")).toBe(tiny);
  });

  it("évite la notation exponentielle", () => {
    expect(providerDecimal("1e-7", "test", "price")).toBe("0.0000001");
    expect(providerDecimal("1e21", "test", "price")).toBe("1000000000000000000000");
  });

  it("normalise le zéro et les entiers", () => {
    expect(providerDecimal("0.00", "test", "price")).toBe("0");
    expect(providerDecimal("42.000", "test", "price")).toBe("42");
  });

  it("refuse une valeur absente plutôt que d'inventer un prix", () => {
    for (const bad of [null, undefined, {}, [], true]) {
      expect(() => providerDecimal(bad, "test", "close")).toThrow(ProviderError);
    }
  });

  it("refuse une valeur illisible", () => {
    for (const bad of ["", "n/a", "NaN", "Infinity", "12,34", "abc"]) {
      expect(() => providerDecimal(bad, "test", "close"), bad).toThrow(ProviderError);
    }
  });

  it("nomme le champ fautif dans l'erreur", () => {
    // Sans le nom du champ, diagnostiquer une réponse fournisseur de trente
    // clés revient à les relire une par une.
    expect(() => providerDecimal("n/a", "eodhd", "previousClose")).toThrow(/previousClose/);
  });
});
