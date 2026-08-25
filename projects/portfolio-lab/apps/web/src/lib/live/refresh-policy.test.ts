import { describe, expect, it } from "vitest";

import {
  BASE_INTERVAL_MS,
  mergeQuotes,
  nextDelayMs,
  shouldPoll,
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
