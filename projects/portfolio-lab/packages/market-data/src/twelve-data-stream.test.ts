import { describe, expect, it } from "vitest";

import { ProviderError, type ResolvedInstrument } from "./contract.js";
import {
  parseTwelveDataTick,
  twelveDataHeartbeat,
  twelveDataRejection,
  twelveDataStreamUrl,
  twelveDataSubscription,
} from "./twelve-data-stream.js";

const nestle: ResolvedInstrument = {
  provider: "twelvedata",
  providerSymbol: "NESN",
  name: "Nestlé SA",
  assetType: "STOCK",
  currency: "CHF",
  exchangeMic: "XSWX",
  isin: "CH0038863350",
  optionContract: null,
};

const context = (freshness: "LIVE" | "DELAYED" = "DELAYED") =>
  ({ instrument: nestle, receivedAt: "2026-08-24T10:00:00.000Z", freshness }) as const;

describe("messages Twelve Data", () => {
  it("place les symboles dans params, comme l'attend le serveur", () => {
    // EODHD les attend à la racine ; les confondre donne un abonnement ignoré
    // et silencieux.
    expect(twelveDataSubscription("subscribe", ["AAPL", "NESN"])).toEqual({
      action: "subscribe",
      params: { symbols: "AAPL,NESN" },
    });
  });

  it("construit un battement de cœur sans paramètres", () => {
    expect(twelveDataHeartbeat()).toEqual({ action: "heartbeat" });
  });

  it("encode la clé dans l'URL", () => {
    expect(twelveDataStreamUrl("clé+test")).toContain("apikey=cl%C3%A9%2Btest");
  });
});

describe("parseTwelveDataTick", () => {
  it("normalise un prix", () => {
    const quote = parseTwelveDataTick(
      { event: "price", symbol: "NESN", price: "95.20000", timestamp: 1_787_500_800 },
      context(),
    );

    expect(quote?.price).toBe("95.2");
    expect(quote?.currency).toBe("CHF");
    expect(quote?.asOf).toBe(new Date(1_787_500_800_000).toISOString());
    expect(quote?.receivedAt).toBe("2026-08-24T10:00:00.000Z");
  });

  it("ne déduit jamais la fraîcheur de l'arrivée d'un tick", () => {
    /*
     * Un plan différé envoie lui aussi des messages par socket. Promouvoir en
     * LIVE parce qu'un tick est arrivé afficherait « en direct » sur une
     * donnée vieille de quinze minutes.
     */
    const delayed = parseTwelveDataTick(
      { event: "price", symbol: "NESN", price: "95.2", timestamp: 1_787_500_800 },
      context("DELAYED"),
    );
    expect(delayed?.freshness).toBe("DELAYED");

    const live = parseTwelveDataTick(
      { event: "price", symbol: "NESN", price: "95.2", timestamp: 1_787_500_800 },
      context("LIVE"),
    );
    expect(live?.freshness).toBe("LIVE");
  });

  it("prend la devise de l'instrument et non du message", () => {
    // Twelve Data ne répète pas systématiquement la devise ; la déduire du
    // symbole donnerait des dollars à une action suisse.
    const quote = parseTwelveDataTick(
      { event: "price", symbol: "NESN", price: "95.2", timestamp: 1_787_500_800, currency: "USD" },
      context(),
    );
    expect(quote?.currency).toBe("CHF");
  });

  it("ignore tout ce qui n'est pas un prix", () => {
    for (const message of [
      { event: "heartbeat", status: "ok" },
      { event: "subscribe-status", status: "ok" },
      { event: "price", symbol: "NESN" },
      { symbol: "NESN", price: "95.2", timestamp: 1 },
      null,
      "ping",
    ]) {
      expect(parseTwelveDataTick(message, context()), JSON.stringify(message)).toBeNull();
    }
  });

  it("lève sur un horodatage illisible", () => {
    expect(() =>
      parseTwelveDataTick(
        { event: "price", symbol: "NESN", price: "95.2", timestamp: "hier" },
        context(),
      ),
    ).toThrow(ProviderError);
  });

  it("lève sur un prix illisible plutôt que de se taire", () => {
    expect(() =>
      parseTwelveDataTick(
        { event: "price", symbol: "NESN", price: "n/a", timestamp: 1_787_500_800 },
        context(),
      ),
    ).toThrow(ProviderError);
  });
});

describe("twelveDataRejection", () => {
  it("détecte un abonnement refusé", () => {
    /*
     * Twelve Data répond par un statut en cas de symbole inconnu ou de quota
     * dépassé, **sans fermer la connexion**. Sans cette détection, l'abonnement
     * paraît réussi et reste muet.
     */
    expect(twelveDataRejection({ event: "subscribe-status", status: "error" })).toBe("error");
  });

  it("ne signale rien sur un abonnement accepté", () => {
    expect(twelveDataRejection({ event: "subscribe-status", status: "ok" })).toBeNull();
    expect(twelveDataRejection({ event: "price", symbol: "NESN" })).toBeNull();
    expect(twelveDataRejection(null)).toBeNull();
  });
});
