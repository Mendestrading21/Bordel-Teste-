import { describe, expect, it } from "vitest";

import { ProviderError, type ResolvedInstrument } from "./contract.js";
import {
  eodhdChannelFor,
  eodhdStreamSymbol,
  eodhdStreamUrl,
  eodhdSubscription,
  parseEodhdTick,
} from "./eodhd-stream.js";

const apple: ResolvedInstrument = {
  provider: "eodhd",
  providerSymbol: "AAPL.US",
  name: "Apple Inc",
  assetType: "STOCK",
  currency: "USD",
  exchangeMic: "XNAS",
  isin: "US0378331005",
  optionContract: null,
};

const nestle: ResolvedInstrument = {
  ...apple,
  providerSymbol: "NESN.SW",
  name: "Nestlé SA",
  currency: "CHF",
  exchangeMic: "XSWX",
  isin: "CH0038863350",
};

const eurusd: ResolvedInstrument = {
  ...apple,
  providerSymbol: "EURUSD.FOREX",
  name: "EUR/USD",
  assetType: "FX",
  currency: "USD",
  exchangeMic: null,
  isin: null,
};

const bitcoin: ResolvedInstrument = {
  ...apple,
  providerSymbol: "BTC-USD.CC",
  name: "Bitcoin",
  assetType: "CRYPTO",
  currency: "USD",
  exchangeMic: null,
  isin: null,
};

const context = (instrument: ResolvedInstrument, channel: "us" | "us-quote" | "forex" | "crypto") =>
  ({ instrument, channel, receivedAt: "2026-08-24T10:00:00.000Z" }) as const;

describe("choix du canal", () => {
  it("envoie une action américaine sur le canal us", () => {
    expect(eodhdChannelFor(apple)).toBe("us");
  });

  it("refuse de diffuser une action non américaine plutôt que de la mal router", () => {
    /*
     * EODHD ne diffuse en direct que les États-Unis, le forex et la crypto.
     * Rabattre une action suisse sur le canal `us` donnerait un abonnement
     * accepté qui ne cote jamais — indiscernable d'un marché fermé.
     */
    expect(eodhdChannelFor(nestle)).toBeNull();
  });

  it("route devises et cryptos vers leurs canaux dédiés", () => {
    expect(eodhdChannelFor(eurusd)).toBe("forex");
    expect(eodhdChannelFor(bitcoin)).toBe("crypto");
  });

  it("ne diffuse pas les classes qu'EODHD ne cote pas en direct", () => {
    for (const assetType of ["MUTUAL_FUND", "BOND", "OPTION", "INDEX"] as const) {
      expect(eodhdChannelFor({ ...apple, assetType }), assetType).toBeNull();
    }
  });
});

describe("symbole de flux", () => {
  it("retire le suffixe de place que le flux n'utilise pas", () => {
    // Envoyer `AAPL.US` au flux donne un abonnement accepté et muet.
    expect(eodhdStreamSymbol(apple)).toBe("AAPL");
    expect(eodhdStreamSymbol(eurusd)).toBe("EURUSD");
    expect(eodhdStreamSymbol(bitcoin)).toBe("BTC-USD");
  });
});

describe("URL de canal", () => {
  it("encode le jeton", () => {
    const url = eodhdStreamUrl("us", "clé/avec+caractères");
    expect(url).toContain("api_token=cl%C3%A9%2Favec%2Bcaract%C3%A8res");
  });

  it("construit une URL par canal", () => {
    expect(eodhdStreamUrl("forex", "demo")).toBe(
      "wss://ws.eodhistoricaldata.com/ws/forex?api_token=demo",
    );
  });
});

describe("messages d'abonnement", () => {
  it("regroupe les symboles en une seule requête", () => {
    expect(eodhdSubscription("subscribe", ["AAPL", "MSFT"])).toEqual({
      action: "subscribe",
      symbols: "AAPL,MSFT",
    });
  });

  it("construit aussi le désabonnement", () => {
    expect(eodhdSubscription("unsubscribe", ["AAPL"]).action).toBe("unsubscribe");
  });
});

describe("parseEodhdTick", () => {
  it("normalise une transaction", () => {
    const quote = parseEodhdTick(
      { s: "AAPL", p: "227.31000", t: 1_787_500_800_000 },
      context(apple, "us"),
    );

    expect(quote?.price).toBe("227.31");
    expect(quote?.priceType).toBe("LAST_TRADE");
    expect(quote?.freshness).toBe("LIVE");
    expect(quote?.asOf).toBe(new Date(1_787_500_800_000).toISOString());
    expect(quote?.receivedAt).toBe("2026-08-24T10:00:00.000Z");
    expect(quote?.providerSymbol).toBe("AAPL.US");
  });

  it("calcule le point milieu d'une fourchette sans flottant", () => {
    /*
     * 0.1 + 0.2 en flottant vaut 0.30000000000000004. Le point milieu de
     * 0.1/0.2 doit valoir exactement 0.15.
     */
    const quote = parseEodhdTick(
      { s: "EURUSD", b: "0.1", a: "0.2", t: 1_787_500_800 },
      context(eurusd, "forex"),
    );

    expect(quote?.price).toBe("0.15");
    expect(quote?.priceType).toBe("MID");
    expect(quote?.bid).toBe("0.1");
    expect(quote?.ask).toBe("0.2");
  });

  it("préfère la transaction à la fourchette quand les deux sont présentes", () => {
    const quote = parseEodhdTick(
      { s: "AAPL", p: "227.31", b: "227.30", a: "227.32", t: 1_787_500_800_000 },
      context(apple, "us"),
    );
    expect(quote?.price).toBe("227.31");
    expect(quote?.priceType).toBe("LAST_TRADE");
  });

  it("distingue secondes et millisecondes", () => {
    // Dix chiffres = secondes, treize = millisecondes. Confondre les deux
    // daterait un tick de 1970 ou de l'an 58 000.
    const seconds = parseEodhdTick(
      { s: "EURUSD", p: "1.09", t: 1_787_500_800 },
      context(eurusd, "forex"),
    );
    const millis = parseEodhdTick(
      { s: "AAPL", p: "227.31", t: 1_787_500_800_000 },
      context(apple, "us"),
    );
    expect(seconds?.asOf).toBe(millis?.asOf);
  });

  it("ignore les messages qui ne sont pas des ticks", () => {
    /*
     * Accusés d'abonnement et battements de cœur sont normaux et fréquents.
     * Les traiter comme des erreurs remplirait les journaux et déclencherait
     * des reconnexions inutiles.
     */
    for (const message of [
      { status_code: 200, message: "Authorized" },
      { s: "AAPL" },
      { t: 1_787_500_800_000 },
      "ping",
      null,
      undefined,
      42,
    ]) {
      expect(parseEodhdTick(message, context(apple, "us")), JSON.stringify(message)).toBeNull();
    }
  });

  it("lève sur un tick au prix illisible plutôt que de se taire", () => {
    // Ici quelque chose a changé côté fournisseur : le silence serait pire.
    expect(() =>
      parseEodhdTick({ s: "AAPL", p: "n/a", t: 1_787_500_800_000 }, context(apple, "us")),
    ).toThrow(ProviderError);
  });

  it("lève sur un horodatage illisible", () => {
    expect(() =>
      parseEodhdTick({ s: "AAPL", p: "227.31", t: "hier" }, context(apple, "us")),
    ).toThrow(ProviderError);
  });

  it("conserve la devise de l'instrument et non celle du canal", () => {
    // Le flux ne transporte pas de devise : c'est l'instrument résolu qui la
    // porte. La déduire du canal donnerait des dollars à une action suisse.
    const quote = parseEodhdTick(
      { s: "NESN", p: "95.20", t: 1_787_500_800_000 },
      context(nestle, "us"),
    );
    expect(quote?.currency).toBe("CHF");
  });
});
