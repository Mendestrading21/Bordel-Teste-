import { describe, expect, it } from "vitest";

import type { LiveQuote } from "./client-protocol";
import {
  BASE_INTERVAL_MS,
  mergeQuotes,
  mostRecent,
  toDisplayQuote,
  nextDelayMs,
  shouldPoll,
  type DisplayQuote,
  type LiveQuoteRecord,
  type RefreshState,
} from "./refresh-policy";

const quote = (instrumentId: string, price: string, extra: Partial<LiveQuoteRecord> = {}) =>
  ({
    instrumentId,
    price,
    currency: "USD",
    freshness: "DELAYED",
    priceType: "LAST_TRADE",
    asOf: "2026-08-25T06:41:30.000Z",
    provider: "finnhub",
    ...extra,
  }) as LiveQuoteRecord;

const idle: RefreshState = { status: "idle" };

describe("shouldPoll", () => {
  it("scrute quand l'onglet est visible et le réseau disponible", () => {
    expect(shouldPoll({ documentVisible: true, online: true, state: idle })).toBe(true);
  });

  it("ne scrute pas un onglet en arrière-plan", () => {
    expect(shouldPoll({ documentVisible: false, online: true, state: idle })).toBe(false);
  });

  it("ne scrute pas hors ligne", () => {
    expect(shouldPoll({ documentVisible: true, online: false, state: idle })).toBe(false);
  });

  /*
   * Sans cette règle, un serveur sans fournisseur recevrait une requête par
   * minute et par onglet, indéfiniment, pour s'entendre répondre la même chose.
   */
  it("cesse de scruter quand le serveur n'a aucun fournisseur", () => {
    const state: RefreshState = { status: "disabled", reason: "aucun fournisseur" };
    expect(shouldPoll({ documentVisible: true, online: true, state })).toBe(false);
  });

  it("ne relance pas par-dessus une campagne en cours", () => {
    const state: RefreshState = { status: "refreshing" };
    expect(shouldPoll({ documentVisible: true, online: true, state })).toBe(false);
  });

  it("réessaie après un échec", () => {
    const state: RefreshState = { status: "failed", reason: "fournisseur injoignable" };
    expect(shouldPoll({ documentVisible: true, online: true, state })).toBe(true);
  });
});

describe("nextDelayMs", () => {
  it("garde l'intervalle de base tant que tout va bien", () => {
    expect(nextDelayMs(0)).toBe(BASE_INTERVAL_MS);
  });

  it("double après chaque échec consécutif", () => {
    expect(nextDelayMs(1)).toBe(BASE_INTERVAL_MS * 2);
    expect(nextDelayMs(3)).toBe(BASE_INTERVAL_MS * 8);
  });

  it("plafonne pour qu'une reprise reste possible", () => {
    expect(nextDelayMs(50)).toBe(15 * 60_000);
  });
});

describe("mergeQuotes", () => {
  it("remplace un cours par sa version plus récente", () => {
    const previous = new Map([["a", quote("a", "100")]]);
    const merged = mergeQuotes(previous, [quote("a", "101")]);
    expect(merged.get("a")?.price).toBe("101");
  });

  /*
   * Le point qui compte : une campagne muette ne doit pas vider l'écran. Un
   * dernier cours connu et daté vaut mieux qu'une valeur disparue — et bien
   * mieux qu'une valeur inventée.
   */
  it("conserve les cours d'un instrument absent de la nouvelle campagne", () => {
    const previous = new Map([
      ["a", quote("a", "100")],
      ["b", quote("b", "200")],
    ]);
    const merged = mergeQuotes(previous, [quote("a", "101")]);
    expect(merged.get("b")?.price).toBe("200");
    expect(merged.size).toBe(2);
  });

  it("ne remplace rien quand la campagne ne rapporte aucun cours", () => {
    const previous = new Map([["a", quote("a", "100")]]);
    expect(mergeQuotes(previous, [])).toBe(previous);
  });

  it("n'altère pas la fraîcheur reçue", () => {
    const merged = mergeQuotes(new Map(), [quote("a", "100", { freshness: "EOD" })]);
    expect(merged.get("a")?.freshness).toBe("EOD");
  });
});

describe("mostRecent", () => {
  const q = (price: string, asOf: string, provider = "finnhub"): DisplayQuote => ({
    price: price as unknown as DisplayQuote["price"],
    currency: "USD",
    freshness: "DELAYED",
    asOf,
    provider,
  });

  const T1 = "2026-08-25T06:00:00.000Z";
  const T2 = "2026-08-25T06:05:00.000Z";

  it("garde la scrutation quand aucun flux n'arrive", () => {
    const polled = new Map([["a", q("100", T1)]]);
    expect(mostRecent(polled, new Map())).toBe(polled);
  });

  it("préfère le cours du flux quand il est plus récent", () => {
    const merged = mostRecent(new Map([["a", q("100", T1)]]), new Map([["a", q("101", T2)]]));
    expect(merged.get("a")?.price).toBe("101");
  });

  /*
   * Le point qui compte : le critère est la **date du cours**, jamais la
   * source. Privilégier le flux par principe afficherait un tick d'il y a dix
   * minutes par-dessus une scrutation de l'instant — un cours plus ancien
   * présenté comme plus frais.
   */
  it("ne préfère pas un tick ancien à une scrutation récente", () => {
    const merged = mostRecent(new Map([["a", q("101", T2)]]), new Map([["a", q("100", T1)]]));
    expect(merged.get("a")?.price).toBe("101");
  });

  it("conserve la valeur affichée à date égale", () => {
    const polled = new Map([["a", q("100", T1, "finnhub")]]);
    const merged = mostRecent(polled, new Map([["a", q("100", T1, "eodhd")]]));
    // Remplacer un cours par un autre identique ferait clignoter la ligne.
    expect(merged.get("a")?.provider).toBe("finnhub");
  });

  it("ajoute un instrument que seule une source connaît", () => {
    const merged = mostRecent(new Map([["a", q("100", T1)]]), new Map([["b", q("50", T1)]]));
    expect(merged.size).toBe(2);
    expect(merged.get("b")?.price).toBe("50");
  });

  it("n'altère pas la fraîcheur reçue", () => {
    const streamed = new Map([["a", { ...q("101", T2), freshness: "LIVE" as const }]]);
    expect(mostRecent(new Map(), streamed).get("a")?.freshness).toBe("LIVE");
  });
});

describe("toDisplayQuote", () => {
  const wire = (overrides: Partial<LiveQuote> = {}): LiveQuote =>
    ({
      instrumentId: "provider-AAPL",
      provider: "eodhd",
      providerSymbol: "AAPL",
      currency: "USD",
      price: "309.54",
      priceType: "LAST_TRADE",
      freshness: "LIVE",
      asOf: "2026-08-25T06:41:30.000Z",
      receivedAt: "2026-08-25T06:41:31.000Z",
      ...overrides,
    }) as LiveQuote;

  it("convertit une cotation valide", () => {
    const display = toDisplayQuote(wire());
    expect(display?.price).toBe("309.54");
    expect(display?.freshness).toBe("LIVE");
  });

  /*
   * Les types du fil sont de simples chaînes ; ceux du domaine sont marqués, et
   * ce marquage est ce qui empêche une chaîne arbitraire d'entrer dans un
   * calcul de valorisation. Le convertir de force contournerait la seule
   * barrière qui existe.
   */
  it("écarte un prix qui n'est pas une décimale exacte", () => {
    for (const price of ["1e5", "n/a", "", "1,5"]) {
      expect(toDisplayQuote(wire({ price })), `« ${price} » devrait être écarté`).toBeNull();
    }
  });

  it("écarte une devise inconnue", () => {
    expect(toDisplayQuote(wire({ currency: "XYZ" }))).toBeNull();
  });
});
