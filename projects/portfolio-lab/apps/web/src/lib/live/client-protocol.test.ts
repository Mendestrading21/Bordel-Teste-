import { describe, expect, it } from "vitest";

import { LIVE_FRESHNESS, parseServerMessage, tokenProtocol } from "./client-protocol";

const validQuote = {
  instrumentId: "i1",
  provider: "mock",
  providerSymbol: "AAPL",
  currency: "USD",
  price: "150.00",
  priceType: "LAST_TRADE",
  freshness: "MANUAL",
  asOf: "2026-06-15T14:00:00.000Z",
  receivedAt: "2026-06-15T14:00:00.000Z",
};

const json = (value: unknown): string => JSON.stringify(value);

describe("parseServerMessage", () => {
  it("accepte un message de bienvenue", () => {
    expect(
      parseServerMessage(json({ type: "welcome", provider: "mock", bestFreshness: "MANUAL" })),
    ).toEqual({ type: "welcome", provider: "mock", bestFreshness: "MANUAL" });
  });

  it("accepte un message de cours", () => {
    const message = parseServerMessage(json({ type: "quotes", quotes: [validQuote] }));
    expect(message).toMatchObject({ type: "quotes" });
    if (message?.type === "quotes") {
      expect(message.quotes[0]?.providerSymbol).toBe("AAPL");
    }
  });

  it("accepte pong et error", () => {
    expect(parseServerMessage(json({ type: "pong" }))).toEqual({ type: "pong" });
    expect(
      parseServerMessage(json({ type: "error", code: "PROVIDER_DOWN", message: "coupé" })),
    ).toEqual({ type: "error", code: "PROVIDER_DOWN", message: "coupé" });
  });

  it("rejette un prix qui n'est pas une décimale exacte", () => {
    // Un prix mal formé qui atteindrait le moteur produirait un total faux.
    for (const price of ["1e5", "abc", "1,5", "", "NaN", "Infinity"]) {
      expect(
        parseServerMessage(json({ type: "quotes", quotes: [{ ...validQuote, price }] })),
        price,
      ).toBeNull();
    }
  });

  it("rejette un prix transmis en nombre", () => {
    // Un nombre JSON est déjà passé par un flottant.
    expect(
      parseServerMessage(json({ type: "quotes", quotes: [{ ...validQuote, price: 150 }] })),
    ).toBeNull();
  });

  it("conserve les cours valides d'un message partiellement corrompu", () => {
    const message = parseServerMessage(
      json({
        type: "quotes",
        quotes: [validQuote, { ...validQuote, providerSymbol: "MSFT", price: "cassé" }],
      }),
    );
    // Tout perdre pour une ligne mal formée priverait l'écran de données
    // parfaitement valides.
    expect(message).toMatchObject({ type: "quotes" });
    if (message?.type === "quotes") {
      expect(message.quotes).toHaveLength(1);
      expect(message.quotes[0]?.providerSymbol).toBe("AAPL");
    }
  });

  it("rejette un message de cours entièrement invalide", () => {
    expect(parseServerMessage(json({ type: "quotes", quotes: [{ bidon: true }] }))).toBeNull();
    expect(parseServerMessage(json({ type: "quotes", quotes: [] }))).toBeNull();
  });

  it.each([
    ["JSON illisible", "{"],
    ["type inconnu", json({ type: "hack" })],
    ["sans type", json({ quotes: [] })],
    ["null", json(null)],
    ["tableau", json([])],
    ["welcome incomplet", json({ type: "welcome", provider: "mock" })],
    ["error incomplet", json({ type: "error", code: "X" })],
    ["quotes non tableau", json({ type: "quotes", quotes: "AAPL" })],
  ])("rejette : %s", (_label, raw) => {
    expect(parseServerMessage(raw)).toBeNull();
  });
});

describe("tokenProtocol", () => {
  it("préfixe le jeton conformément à la passerelle", () => {
    expect(tokenProtocol("abc")).toBe("portfolio-lab.token.abc");
  });
});

describe("fraîcheur reçue du fil", () => {
  const quote = (freshness: string): string =>
    JSON.stringify({
      type: "quotes",
      quotes: [
        {
          providerSymbol: "AAPL",
          price: "309.54",
          currency: "USD",
          freshness,
          asOf: "2026-08-25T06:41:30.000Z",
        },
      ],
    });

  it("accepte les fraîcheurs que l'interface sait représenter", () => {
    for (const value of LIVE_FRESHNESS) {
      const message = parseServerMessage(quote(value));
      expect(message?.type, `« ${value} » devrait être accepté`).toBe("quotes");
    }
  });

  /*
   * Une valeur inconnue traversait jusqu'au badge, qui s'en sert pour indexer
   * sa table de tons : la pastille sortait sans couleur ni libellé, sur un
   * cours par ailleurs affiché comme n'importe quel autre. Un cours dont on ne
   * peut pas caractériser l'âge ne doit pas s'afficher comme les autres.
   */
  it("rejette une fraîcheur inconnue plutôt que de l'afficher sans ton", () => {
    for (const value of ["TEMPS_REEL", "live", "", "PRESQUE_LIVE"]) {
      expect(parseServerMessage(quote(value)), `« ${value} » devrait être rejeté`).toBeNull();
    }
  });
});
