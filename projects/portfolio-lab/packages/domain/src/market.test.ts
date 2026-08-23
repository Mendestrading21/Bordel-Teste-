import { describe, expect, it } from "vitest";

import {
  ASSET_TYPES,
  ASSET_TYPE_LABEL,
  isValuable,
  PRICE_TYPES,
  PRICE_TYPE_LABEL,
  QUOTE_FRESHNESS,
  QUOTE_FRESHNESS_LABEL,
} from "./market.js";

describe("énumérations de marché", () => {
  it("libelle chaque niveau de fraîcheur", () => {
    for (const freshness of QUOTE_FRESHNESS) {
      expect(QUOTE_FRESHNESS_LABEL[freshness]).toBeTruthy();
    }
  });

  it("libelle chaque type de prix", () => {
    for (const priceType of PRICE_TYPES) {
      expect(PRICE_TYPE_LABEL[priceType]).toBeTruthy();
    }
  });

  it("libelle chaque classe d'actifs", () => {
    for (const assetType of ASSET_TYPES) {
      expect(ASSET_TYPE_LABEL[assetType]).toBeTruthy();
    }
  });

  it("distingue NAV et LIVE", () => {
    expect(QUOTE_FRESHNESS_LABEL.NAV).toBe("Dernière NAV");
    expect(QUOTE_FRESHNESS_LABEL.LIVE).toBe("En direct");
    expect(QUOTE_FRESHNESS_LABEL.NAV).not.toBe(QUOTE_FRESHNESS_LABEL.LIVE);
  });
});

describe("isValuable", () => {
  it("considère STALE comme exploitable mais signalée", () => {
    expect(isValuable("STALE")).toBe(true);
  });

  it("refuse UNAVAILABLE", () => {
    expect(isValuable("UNAVAILABLE")).toBe(false);
  });
});
