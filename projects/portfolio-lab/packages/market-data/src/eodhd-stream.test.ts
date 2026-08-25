import { describe, expect, it } from "vitest";

import { ProviderError, type ResolvedInstrument } from "./contract.js";
import {
  eodhdChannelFor,
  eodhdStreamSymbol,
  eodhdStreamUrl,
  eodhdSubscription,
  parseEodhdStatus,
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
      { s: "AAPL", p: "227.31", bp: "227.30", ap: "227.32", t: 1_787_500_800_000 },
      context(apple, "us"),
    );
    expect(quote?.price).toBe("227.31");
    expect(quote?.priceType).toBe("LAST_TRADE");
  });

  /*
   * Les quatre canaux n'emploient pas les mêmes noms pour une fourchette.
   * `us-quote` publie `ap`/`bp`, `forex` publie `a`/`b`. Le parseur ne
   * connaissait que la seconde forme : chaque message de `us-quote` était donc
   * ignoré, et l'abonnement, accepté, ne cotait jamais — indiscernable d'un
   * titre sans transaction.
   */
  it("lit la fourchette du canal us-quote, qui publie ap et bp", () => {
    const quote = parseEodhdTick(
      { s: "AAPL", ap: 317.297, as: 160, bp: 316.988, bs: 40, t: 1_784_115_291_977 },
      context(apple, "us-quote"),
    );

    expect(quote, "un message us-quote doit produire une cotation").not.toBeNull();
    expect(quote?.priceType).toBe("MID");
    expect(quote?.bid).toBe("316.988");
    expect(quote?.ask).toBe("317.297");
  });

  it("n'interprète pas les champs forex sur un canal actions", () => {
    // `a`/`b` sur le canal `us-quote` ne sont pas une fourchette : les lire
    // ferait coter une valeur qu'EODHD n'a pas publiée sous ce nom.
    const quote = parseEodhdTick(
      { s: "AAPL", a: 317.297, b: 316.988, t: 1_784_115_291_977 },
      context(apple, "us-quote"),
    );
    expect(quote).toBeNull();
  });

  it("lit une transaction crypto dont le prix est une chaîne", () => {
    const quote = parseEodhdTick(
      { s: "BTC-USD", p: "1881.0931", q: "1", dc: "5.6041", t: 1_784_115_286_805 },
      context(bitcoin, "crypto"),
    );
    expect(quote?.price).toBe("1881.0931");
    expect(quote?.priceType).toBe("LAST_TRADE");
  });

  describe("statut de marché", () => {
    it("ne revendique pas « direct » sur une impression reçue marché fermé", () => {
      const quote = parseEodhdTick(
        { s: "AAPL", p: 316.96, ms: "closed", t: 1_784_115_290_873 },
        context(apple, "us"),
      );
      // Arriver par une socket ne rend pas un cours temps réel.
      expect(quote?.freshness).toBe("EOD");
    });

    it("reste en direct hors séance, que le fournisseur cote réellement", () => {
      const quote = parseEodhdTick(
        { s: "AAPL", p: 316.96, ms: "extended-hours", t: 1_784_115_290_873 },
        context(apple, "us"),
      );
      expect(quote?.freshness).toBe("LIVE");
    });

    it("reste en direct sur un canal qui ne publie pas de statut", () => {
      const quote = parseEodhdTick(
        { s: "EURUSD", a: "1.1419", b: "1.1416", t: 1_784_115_288_241 },
        context(eurusd, "forex"),
      );
      expect(quote?.freshness).toBe("LIVE");
    });
  });

  describe("messages de statut", () => {
    it("reconnaît l'autorisation", () => {
      expect(parseEodhdStatus({ status_code: 200, message: "Authorized" })).toEqual({
        statusCode: 200,
        message: "Authorized",
        authorized: true,
      });
    });

    /*
     * Le cas qui compte : avec la clé de démonstration, tout symbole hors des
     * six autorisés reçoit un 422 **à la place des données**. Traité comme un
     * message anodin, il laisserait un abonnement définitivement muet passer
     * pour un marché calme.
     */
    it("reconnaît un abonnement refusé", () => {
      const status = parseEodhdStatus({
        status_code: 422,
        message: "Only limited symbols allowed for demo",
      });
      expect(status?.authorized).toBe(false);
      expect(status?.statusCode).toBe(422);
    });

    it("ne confond pas un tick avec un statut", () => {
      expect(parseEodhdStatus({ s: "AAPL", p: 316.96, t: 1 })).toBeNull();
    });
  });

  describe("plafond de symboles par connexion", () => {
    it("accepte cinquante symboles", () => {
      const symbols = Array.from({ length: 50 }, (_unused, i) => `SYM${i}`);
      expect(eodhdSubscription("subscribe", symbols).symbols.split(",")).toHaveLength(50);
    });

    /*
     * EODHD n'échoue pas au-delà du plafond : il accepte l'abonnement et n'en
     * cote qu'une partie. Le silence porterait sur les lignes après la
     * cinquantième, sans que rien ne le signale.
     */
    it("refuse au-delà, plutôt que de laisser le surplus muet", () => {
      const symbols = Array.from({ length: 51 }, (_unused, i) => `SYM${i}`);
      expect(() => eodhdSubscription("subscribe", symbols)).toThrow(/plafond/u);
    });

    it("ne plafonne pas un désabonnement", () => {
      const symbols = Array.from({ length: 51 }, (_unused, i) => `SYM${i}`);
      expect(() => eodhdSubscription("unsubscribe", symbols)).not.toThrow();
    });
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
