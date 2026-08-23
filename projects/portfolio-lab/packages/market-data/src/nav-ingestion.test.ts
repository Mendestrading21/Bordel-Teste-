import { describe, expect, it } from "vitest";

import { toDecimalString, type DecimalString } from "@portfolio-lab/domain";

import { ProviderError, type MarketDataProvider, type NormalizedQuote } from "./contract.js";
import { createMockProvider, type MockInstrument } from "./mock-provider.js";
import {
  ingestNavs,
  presentNav,
  toNavRecord,
  type FundReference,
  type NavRecord,
} from "./nav-ingestion.js";

const d = (value: string): DecimalString => toDecimalString(value);

const FUND: FundReference = {
  instrumentId: "f1",
  isin: "LU0104884860",
  expectedCurrency: "EUR",
  frequency: "DAILY",
  shareClass: "P",
};

function navQuote(overrides: Partial<NormalizedQuote> = {}): NormalizedQuote {
  return {
    instrumentId: "f1",
    provider: "test",
    providerSymbol: "FUND",
    currency: "EUR",
    price: d("104.83"),
    priceType: "NAV",
    freshness: "NAV",
    asOf: "2026-08-21T00:00:00.000Z",
    receivedAt: "2026-08-21T18:00:00.000Z",
    ...overrides,
  };
}

describe("toNavRecord", () => {
  it("accepte une NAV conforme", () => {
    const result = toNavRecord(FUND, navQuote());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.value).toBe("104.83");
      // La date de valeur, pas l'instant de récupération.
      expect(result.record.navDate).toBe("2026-08-21");
      expect(result.record.shareClass).toBe("P");
    }
  });

  it("refuse un prix qui n'est pas une NAV", () => {
    // Un fonds valorisé par un « dernier échange » signale une confusion
    // d'instrument.
    const result = toNavRecord(FUND, navQuote({ priceType: "LAST_TRADE" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("NOT_A_NAV");
    }
  });

  it("refuse une devise différente de celle attendue", () => {
    // Devise différente = très probablement une autre classe de parts.
    const result = toNavRecord(FUND, navQuote({ currency: "USD" }));
    expect(result.ok === false && result.failure.reason).toBe("CURRENCY_MISMATCH");
  });

  it.each([
    ["nulle", "0"],
    ["négative", "-5"],
  ])("refuse une valeur %s", (_label, price) => {
    const result = toNavRecord(FUND, navQuote({ price: d(price) }));
    expect(result.ok === false && result.failure.reason).toBe("INVALID_VALUE");
  });

  it("refuse un horodatage illisible", () => {
    const result = toNavRecord(FUND, navQuote({ asOf: "pas-une-date" }));
    expect(result.ok === false && result.failure.reason).toBe("INVALID_DATE");
  });

  it("conserve le fournisseur et l'instant de récupération", () => {
    const result = toNavRecord(FUND, navQuote({ provider: "eodhd" }));
    if (result.ok) {
      expect(result.record.provider).toBe("eodhd");
      expect(result.record.retrievedAt).toBe("2026-08-21T18:00:00.000Z");
    }
  });
});

describe("ingestNavs", () => {
  const NOW = (): Date => new Date("2026-08-24T06:00:00.000Z");

  const instruments: MockInstrument[] = [
    {
      symbol: "PICTET-WATER-P",
      name: "Pictet - Water P EUR",
      assetType: "MUTUAL_FUND",
      currency: "EUR",
      exchangeMic: null,
      isin: "LU0104884860",
    },
    {
      symbol: "ACTION",
      name: "Une action",
      assetType: "STOCK",
      currency: "EUR",
      exchangeMic: "XPAR",
      isin: "NL0010273215",
    },
  ];

  const provider = createMockProvider({ instruments, now: NOW });

  it("récupère la NAV d'un fonds résolu par ISIN", async () => {
    const result = await ingestNavs(provider, [FUND], NOW);
    expect(result.records).toHaveLength(1);
    expect(result.failures).toHaveLength(0);
    expect(result.records[0]?.isin).toBe("LU0104884860");
  });

  it("signale un ISIN non résolu", async () => {
    const inconnu: FundReference = { ...FUND, instrumentId: "f9", isin: "LU0104884787" };
    const result = await ingestNavs(provider, [inconnu], NOW);
    expect(result.failures[0]?.reason).toBe("NOT_FOUND");
  });

  it("refuse un instrument qui n'est pas un fonds", async () => {
    // Le fournisseur renvoie LAST_TRADE pour une action : la NAV est refusée.
    const faux: FundReference = { ...FUND, instrumentId: "f2", isin: "NL0010273215" };
    const result = await ingestNavs(provider, [faux], NOW);
    expect(result.failures[0]?.reason).toBe("NOT_A_NAV");
  });

  it("n'interrompt pas les autres fonds quand un seul échoue", async () => {
    // Un portefeuille de dix fonds dont un pose problème doit rester valorisé
    // à neuf, avec la lacune signalée.
    const result = await ingestNavs(
      provider,
      [FUND, { ...FUND, instrumentId: "f9", isin: "LU0104884787" }],
      NOW,
    );
    expect(result.records).toHaveLength(1);
    expect(result.failures).toHaveLength(1);
  });

  it("capture une erreur fournisseur sans planter le lot", async () => {
    const failing: MarketDataProvider = createMockProvider({
      instruments,
      now: NOW,
      failWith: new ProviderError("RATE_LIMITED", "test", "quota dépassé", 60),
    });
    const result = await ingestNavs(failing, [FUND], NOW);
    expect(result.failures[0]?.reason).toBe("PROVIDER_ERROR");
    expect(result.failures[0]?.detail).toContain("RATE_LIMITED");
  });

  it("horodate le début et la fin de l'ingestion", async () => {
    const result = await ingestNavs(provider, [FUND], NOW);
    expect(result.startedAt).toBe("2026-08-24T06:00:00.000Z");
    expect(result.finishedAt).toBe("2026-08-24T06:00:00.000Z");
  });

  it("ne fait rien sur une liste vide", async () => {
    const result = await ingestNavs(provider, [], NOW);
    expect(result.records).toEqual([]);
    expect(result.failures).toEqual([]);
  });
});

describe("presentNav", () => {
  function record(overrides: Partial<NavRecord> = {}): NavRecord {
    return {
      instrumentId: "f1",
      isin: "LU0104884860",
      value: d("104.83"),
      currency: "EUR",
      navDate: "2026-08-21",
      provider: "test",
      retrievedAt: "2026-08-21T18:00:00.000Z",
      frequency: "DAILY",
      shareClass: "P",
      ...overrides,
    };
  }

  it("garde la fraîcheur NAV pour une publication du vendredi lue le lundi", () => {
    const presentation = presentNav(record(), new Date("2026-08-24T06:00:00.000Z"));
    expect(presentation.freshness).toBe("NAV");
    expect(presentation.status.kind).toBe("CURRENT");
  });

  it("marque périmée une NAV quotidienne trop ancienne", () => {
    const presentation = presentNav(
      record({ navDate: "2026-08-03" }),
      new Date("2026-08-24T06:00:00.000Z"),
    );
    expect(presentation.freshness).toBe("STALE");
  });

  it("marque indisponible une NAV datée dans le futur", () => {
    // L'afficher comme fraîche masquerait un défaut de la source.
    const presentation = presentNav(
      record({ navDate: "2026-09-01" }),
      new Date("2026-08-24T06:00:00.000Z"),
    );
    expect(presentation.freshness).toBe("UNAVAILABLE");
    expect(presentation.status.kind).toBe("FUTURE_DATED");
  });

  it("n'annonce jamais LIVE ni DELAYED pour un fonds", () => {
    // Un fonds n'a pas de cours intraday : lui attribuer une fraîcheur de
    // titre coté serait un mensonge sur la nature de la donnée.
    for (const navDate of ["2026-08-21", "2026-08-03", "2026-09-01"]) {
      const presentation = presentNav(record({ navDate }), new Date("2026-08-24T06:00:00.000Z"));
      expect(["NAV", "STALE", "UNAVAILABLE"]).toContain(presentation.freshness);
    }
  });

  it("tolère un long écart pour un fonds mensuel", () => {
    const presentation = presentNav(
      record({ navDate: "2026-07-31", frequency: "MONTHLY" }),
      new Date("2026-08-24T06:00:00.000Z"),
    );
    expect(presentation.freshness).toBe("NAV");
  });
});
