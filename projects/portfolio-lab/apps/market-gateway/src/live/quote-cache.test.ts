import { beforeEach, describe, expect, it } from "vitest";

import { toDecimalString, type DecimalString } from "@portfolio-lab/domain";
import type { NormalizedQuote } from "@portfolio-lab/market-data";

import { DEFAULT_STALE_THRESHOLDS, QuoteCache } from "./quote-cache.js";

const BASE_TIME = Date.parse("2026-06-15T14:00:00.000Z");

const d = (value: string): DecimalString => toDecimalString(value);

function quote(overrides: Partial<NormalizedQuote> = {}): NormalizedQuote {
  return {
    instrumentId: "i1",
    provider: "mock",
    providerSymbol: "AAPL",
    currency: "USD",
    price: d("150.00"),
    priceType: "LAST_TRADE",
    freshness: "LIVE",
    asOf: "2026-06-15T14:00:00.000Z",
    receivedAt: "2026-06-15T14:00:00.000Z",
    ...overrides,
  };
}

describe("QuoteCache", () => {
  let clock = BASE_TIME;
  let cache: QuoteCache;

  beforeEach(() => {
    clock = BASE_TIME;
    cache = new QuoteCache({ staleAfterMs: DEFAULT_STALE_THRESHOLDS, now: () => clock });
  });

  describe("acceptation des ticks", () => {
    it("accepte un premier tick", () => {
      expect(cache.accept(quote())).toBe(true);
      expect(cache.get("AAPL")?.price).toBe("150.00");
    });

    it("accepte un tick plus récent", () => {
      cache.accept(quote());
      expect(cache.accept(quote({ asOf: "2026-06-15T14:00:01.000Z", price: d("150.50") }))).toBe(
        true,
      );
      expect(cache.get("AAPL")?.price).toBe("150.50");
    });

    it("rejette un tick plus ancien", () => {
      // Un WebSocket ne garantit pas l'ordre après reconnexion ; un tick ancien
      // écrasant un tick récent ferait reculer un cours à l'écran.
      cache.accept(quote({ asOf: "2026-06-15T14:00:05.000Z", price: d("151.00") }));
      expect(cache.accept(quote({ asOf: "2026-06-15T14:00:01.000Z", price: d("149.00") }))).toBe(
        false,
      );
      expect(cache.get("AAPL")?.price).toBe("151.00");
    });

    it("rejette un tick identique, pour ne pas réveiller les clients sans raison", () => {
      cache.accept(quote());
      expect(cache.accept(quote())).toBe(false);
    });

    it("accepte un même horodatage si le prix a changé", () => {
      cache.accept(quote());
      expect(cache.accept(quote({ price: d("150.25") }))).toBe(true);
    });

    it("isole les symboles les uns des autres", () => {
      cache.accept(quote({ providerSymbol: "AAPL", price: d("150.00") }));
      cache.accept(quote({ providerSymbol: "MSFT", price: d("400.00") }));
      expect(cache.get("AAPL")?.price).toBe("150.00");
      expect(cache.get("MSFT")?.price).toBe("400.00");
      expect(cache.size()).toBe(2);
    });

    it("accepte un tick dont l'horodatage est illisible plutôt que de le perdre", () => {
      cache.accept(quote());
      // On ne peut pas comparer : mieux vaut la donnée la plus récemment reçue
      // qu'aucune donnée.
      expect(cache.accept(quote({ asOf: "pas-une-date", price: d("152.00") }))).toBe(true);
    });
  });

  describe("péremption", () => {
    it("laisse un cours en direct frais tant que le seuil n'est pas franchi", () => {
      cache.accept(quote({ freshness: "LIVE" }));
      clock += 30_000;
      expect(cache.getWithFreshness("AAPL")?.freshness).toBe("LIVE");
    });

    it("marque périmé un cours en direct devenu muet", () => {
      cache.accept(quote({ freshness: "LIVE" }));
      clock += 61_000;
      expect(cache.getWithFreshness("AAPL")?.freshness).toBe("STALE");
    });

    it("tolère un différé bien plus longtemps qu'un direct", () => {
      cache.accept(quote({ freshness: "DELAYED" }));
      clock += 61_000;
      expect(cache.getWithFreshness("AAPL")?.freshness).toBe("DELAYED");
    });

    it("tolère plusieurs jours sans NAV, week-ends et fériés compris", () => {
      cache.accept(quote({ freshness: "NAV", priceType: "NAV" }));
      clock += 3 * 24 * 3_600_000;
      expect(cache.getWithFreshness("AAPL")?.freshness).toBe("NAV");
    });

    it("finit par marquer périmée une NAV trop ancienne", () => {
      cache.accept(quote({ freshness: "NAV", priceType: "NAV" }));
      clock += 5 * 24 * 3_600_000;
      expect(cache.getWithFreshness("AAPL")?.freshness).toBe("STALE");
    });

    it("ne périme jamais une saisie manuelle", () => {
      // Une valeur saisie à la main ne devient pas fausse en vieillissant.
      cache.accept(quote({ freshness: "MANUAL", priceType: "MANUAL" }));
      clock += 365 * 24 * 3_600_000;
      expect(cache.getWithFreshness("AAPL")?.freshness).toBe("MANUAL");
    });

    it("ne rend jamais une donnée plus fraîche qu'elle ne l'était", () => {
      cache.accept(quote({ freshness: "EOD" }));
      clock += 1_000;
      // Une donnée ne devient pas plus fraîche en vieillissant dans un cache.
      expect(cache.getWithFreshness("AAPL")?.freshness).toBe("EOD");
    });

    it("préserve le prix quand il marque la fraîcheur périmée", () => {
      cache.accept(quote({ freshness: "LIVE", price: d("150.00") }));
      clock += 120_000;
      const stale = cache.getWithFreshness("AAPL");
      expect(stale?.price).toBe("150.00");
      expect(stale?.freshness).toBe("STALE");
    });
  });

  describe("instantanés", () => {
    it("ne renvoie que les symboles connus, sans trou ni valeur inventée", () => {
      cache.accept(quote({ providerSymbol: "AAPL" }));
      const snapshot = cache.snapshot(["AAPL", "INCONNU"]);
      expect(snapshot).toHaveLength(1);
      expect(snapshot[0]?.providerSymbol).toBe("AAPL");
    });

    it("applique la péremption dans l'instantané", () => {
      cache.accept(quote({ freshness: "LIVE" }));
      clock += 120_000;
      expect(cache.snapshot(["AAPL"])[0]?.freshness).toBe("STALE");
    });
  });

  describe("purge", () => {
    it("libère les symboles que plus personne ne suit", () => {
      cache.accept(quote({ providerSymbol: "AAPL" }));
      cache.accept(quote({ providerSymbol: "MSFT" }));
      cache.evict(["AAPL"]);
      expect(cache.get("AAPL")).toBeUndefined();
      expect(cache.get("MSFT")).toBeDefined();
    });
  });
});
