import { describe, expect, it } from "vitest";

import {
  buildQuoteRequests,
  pickSubscriptionSymbols,
  type IdentifierRow,
  type InstrumentRow,
} from "./instrument-refs.js";

const instrument = (
  instrumentId: string,
  assetType: InstrumentRow["assetType"] = "STOCK",
  exchangeMic: string | null = null,
): InstrumentRow => ({ instrumentId, assetType, exchangeMic });

const identifier = (
  instrumentId: string,
  identifierType: IdentifierRow["identifierType"],
  identifierValue: string,
  extra: Partial<IdentifierRow> = {},
): IdentifierRow => ({
  instrumentId,
  identifierType,
  identifierValue,
  provider: null,
  exchangeMic: null,
  ...extra,
});

describe("buildQuoteRequests", () => {
  it("préfère le symbole fournisseur à l'ISIN et au ticker", () => {
    const result = buildQuoteRequests(
      [instrument("i1")],
      [
        identifier("i1", "TICKER", "AAPL"),
        identifier("i1", "ISIN", "US0378331005"),
        identifier("i1", "PROVIDER_SYMBOL", "AAPL.US", { provider: "eodhd" }),
      ],
    );

    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]?.reference).toEqual({
      kind: "PROVIDER_SYMBOL",
      provider: "eodhd",
      symbol: "AAPL.US",
    });
  });

  it("ignore un symbole fournisseur sans fournisseur nommé et retombe sur l'ISIN", () => {
    const result = buildQuoteRequests(
      [instrument("i1")],
      [
        identifier("i1", "PROVIDER_SYMBOL", "AAPL.US"),
        identifier("i1", "ISIN", "US0378331005"),
      ],
    );

    expect(result.requests[0]?.reference).toEqual({ kind: "ISIN", isin: "US0378331005" });
  });

  it("transporte la place de cotation avec le ticker", () => {
    const result = buildQuoteRequests(
      [instrument("i1")],
      [identifier("i1", "TICKER", "NESN", { exchangeMic: "XSWX" })],
    );

    expect(result.requests[0]?.reference).toEqual({
      kind: "TICKER",
      ticker: "NESN",
      exchangeMic: "XSWX",
    });
  });

  /*
   * Le cœur du lot : un instrument sans identifiant n'est pas deviné.
   *
   * Chercher par le nom renverrait un candidat plausible — et « AAPL » chez un
   * fournisseur renvoie aussi AAPU, AAPB, AAPD, des produits à levier qui ne
   * sont pas Apple.
   */
  it("déclare non identifiable un instrument sans identifiant, au lieu de le deviner", () => {
    const result = buildQuoteRequests([instrument("i1")], []);

    expect(result.requests).toEqual([]);
    expect(result.unidentified).toHaveLength(1);
    expect(result.unidentified[0]?.instrumentId).toBe("i1");
    expect(result.unidentified[0]?.reason).toContain("Aucun identifiant fournisseur");
  });

  it("ne perd jamais un instrument : il est requêté ou déclaré non identifiable", () => {
    const result = buildQuoteRequests(
      [instrument("a"), instrument("b"), instrument("c")],
      [identifier("a", "TICKER", "AAPL"), identifier("c", "ISIN", "US0378331005")],
    );

    const covered = [
      ...result.requests.map((request) => request.instrumentId),
      ...result.unidentified.map((entry) => entry.instrumentId),
    ].sort();
    expect(covered).toEqual(["a", "b", "c"]);
  });

  describe("options", () => {
    it("désigne une option par son OSI", () => {
      const result = buildQuoteRequests(
        [instrument("o1", "OPTION")],
        [identifier("o1", "OSI", "AAPL  270115C00150000")],
      );

      expect(result.requests[0]?.reference).toEqual({
        kind: "OPTION",
        underlying: "AAPL",
        optionType: "CALL",
        expiration: "2027-01-15",
        strike: "150",
      });
    });

    /*
     * Régression majeure : sans cette règle, une option dont l'OSI manque
     * retomberait sur le ticker du sous-jacent et afficherait le cours de
     * l'action à la place de celui du contrat. Un chiffre plausible, du bon
     * ordre de grandeur, et faux.
     */
    it("ne retombe jamais sur le ticker du sous-jacent", () => {
      const result = buildQuoteRequests(
        [instrument("o1", "OPTION")],
        [identifier("o1", "TICKER", "AAPL"), identifier("o1", "ISIN", "US0378331005")],
      );

      expect(result.requests).toEqual([]);
      expect(result.unidentified[0]?.instrumentId).toBe("o1");
    });

    it("refuse un OSI illisible plutôt que d'en inventer l'échéance", () => {
      const result = buildQuoteRequests(
        [instrument("o1", "OPTION")],
        [identifier("o1", "OSI", "pas-un-osi")],
      );

      expect(result.requests).toEqual([]);
      expect(result.unidentified[0]?.reason).toContain("OSI valide");
    });
  });
});

describe("pickSubscriptionSymbols", () => {
  it("retient un seul symbole par instrument", () => {
    const picked = pickSubscriptionSymbols([
      identifier("i1", "TICKER", "AAPL"),
      identifier("i1", "ISIN", "US0378331005"),
    ]);

    // Deux abonnements pour un seul cours utile consommeraient deux places sur
    // les cinquante qu'une connexion accepte.
    expect(picked).toHaveLength(1);
  });

  it("suit la même préférence que les requêtes REST", () => {
    const picked = pickSubscriptionSymbols([
      identifier("i1", "TICKER", "AAPL"),
      identifier("i1", "ISIN", "US0378331005"),
      identifier("i1", "PROVIDER_SYMBOL", "AAPL.US", { provider: "eodhd" }),
    ]);

    /*
     * Deux ordres différents feraient suivre un instrument sous un symbole par
     * le flux et sous un autre par la scrutation, avec deux cours qui ne se
     * recouvriraient pas toujours.
     */
    expect(picked[0]?.symbol).toBe("AAPL.US");
  });

  it("écarte un symbole fournisseur sans fournisseur nommé", () => {
    const picked = pickSubscriptionSymbols([
      identifier("i1", "PROVIDER_SYMBOL", "AAPL.US"),
      identifier("i1", "TICKER", "AAPL"),
    ]);
    expect(picked[0]?.symbol).toBe("AAPL");
  });

  it("n'abonne pas une option par le symbole de son sous-jacent", () => {
    const picked = pickSubscriptionSymbols([identifier("o1", "OSI", "AAPL  270115C00150000")]);
    expect(picked).toEqual([]);
  });

  it("rend le même ordre à chaque appel", () => {
    const rows = [identifier("b", "TICKER", "MSFT"), identifier("a", "TICKER", "AAPL")];
    expect(pickSubscriptionSymbols(rows)).toEqual(pickSubscriptionSymbols([...rows].reverse()));
  });

  it("rattache chaque symbole à son instrument", () => {
    const picked = pickSubscriptionSymbols([
      identifier("i1", "TICKER", "AAPL"),
      identifier("i2", "TICKER", "MSFT"),
    ]);
    expect(picked).toEqual([
      { symbol: "AAPL", instrumentId: "i1" },
      { symbol: "MSFT", instrumentId: "i2" },
    ]);
  });
});
