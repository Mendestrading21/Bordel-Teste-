import { describe, expect, it } from "vitest";

import { parseServerMessage, tokenProtocol } from "./client-protocol";

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
