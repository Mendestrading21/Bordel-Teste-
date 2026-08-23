import { describe, expect, it } from "vitest";

import { toDecimalString, type DecimalString } from "@portfolio-lab/domain";

import { CANDIDATE_PROVIDERS } from "./candidates.js";
import { ProviderError } from "./contract.js";
import {
  probeInstrument,
  referenceFor,
  runCoverageMatrix,
  type MatrixDefinition,
  type MatrixInstrument,
} from "./coverage-matrix.js";
import { createMockProvider, type MockInstrument } from "./mock-provider.js";
import { ProviderRegistry, type ProviderRegistration } from "./registry.js";

const d = (value: string): DecimalString => toDecimalString(value);
const NOW = (): Date => new Date("2026-08-23T00:00:00.000Z");

const KNOWN: MockInstrument[] = [
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    assetType: "STOCK",
    currency: "USD",
    exchangeMic: "XNAS",
    isin: "US0378331005",
  },
  {
    symbol: "AAPL270115C00200000",
    name: "AAPL CALL 200",
    assetType: "OPTION",
    currency: "USD",
    exchangeMic: "XCBO",
    isin: null,
    optionContract: {
      underlyingSymbol: "AAPL",
      optionType: "CALL",
      expiration: "2027-01-15",
      strike: d("200"),
      multiplier: d("100"),
      osiSymbol: "AAPL270115C00200000",
      exerciseStyle: "AMERICAN",
      settlementType: "PHYSICAL",
    },
  },
];

const mock = createMockProvider({
  instruments: KNOWN,
  fxRates: new Map([["USD/CHF", d("0.89")]]),
  now: NOW,
});

describe("referenceFor", () => {
  it("privilégie l'ISIN, seul identifiant distinguant deux classes de parts", () => {
    const reference = referenceFor({
      id: "x",
      name: "Fonds",
      assetType: "MUTUAL_FUND",
      isin: "LU0104884860",
      ticker: "AMBIGU",
    });
    expect(reference).toEqual({ kind: "ISIN", isin: "LU0104884860" });
  });

  it("retombe sur le ticker et sa place", () => {
    expect(
      referenceFor({
        id: "x",
        name: "Action",
        assetType: "STOCK",
        ticker: "AAPL",
        exchangeMic: "XNAS",
      }),
    ).toEqual({ kind: "TICKER", ticker: "AAPL", exchangeMic: "XNAS" });
  });

  it("construit une référence d'option à partir de ses quatre attributs", () => {
    expect(
      referenceFor({
        id: "x",
        name: "Option",
        assetType: "OPTION",
        underlying: "AAPL",
        optionType: "CALL",
        expiration: "2027-01-15",
        strike: "200",
      }),
    ).toEqual({
      kind: "OPTION",
      underlying: "AAPL",
      optionType: "CALL",
      expiration: "2027-01-15",
      strike: "200",
    });
  });

  it("renvoie null pour une option incomplète plutôt que d'inventer un attribut", () => {
    expect(
      referenceFor({ id: "x", name: "Option", assetType: "OPTION", underlying: "AAPL" }),
    ).toBeNull();
  });

  it("renvoie null pour un instrument sans identifiant", () => {
    expect(referenceFor({ id: "x", name: "Rien", assetType: "STOCK" })).toBeNull();
  });
});

describe("probeInstrument", () => {
  const apple: MatrixInstrument = {
    id: "aapl",
    name: "Apple Inc.",
    assetType: "STOCK",
    isin: "US0378331005",
  };

  it("rapporte RESOLVED avec identité, fraîcheur et horodatage", async () => {
    const cell = await probeInstrument(mock, apple);
    expect(cell.outcome).toBe("RESOLVED");
    expect(cell.resolvedName).toBe("Apple Inc.");
    expect(cell.resolvedCurrency).toBe("USD");
    expect(cell.resolvedExchangeMic).toBe("XNAS");
    expect(cell.freshness).toBe("MANUAL");
    expect(cell.asOf).toBe("2026-08-23T00:00:00.000Z");
  });

  it("rapporte NOT_FOUND sans raison : l'absence de résultat est le résultat", async () => {
    const cell = await probeInstrument(mock, {
      id: "inconnu",
      name: "Inexistant",
      assetType: "STOCK",
      isin: "XX000000DE99",
    });
    expect(cell.outcome).toBe("NOT_FOUND");
    expect(cell.reason).toBeNull();
  });

  it("lit le multiplicateur d'option chez le fournisseur", async () => {
    const cell = await probeInstrument(mock, {
      id: "aapl-call",
      name: "AAPL CALL 200",
      assetType: "OPTION",
      underlying: "AAPL",
      optionType: "CALL",
      expiration: "2027-01-15",
      strike: "200",
      expectedMultiplier: "100",
    });
    expect(cell.outcome).toBe("RESOLVED");
    expect(cell.multiplier).toBe("100");
    expect(cell.multiplierMismatch).toBe(false);
  });

  it("signale un multiplicateur différent de celui attendu", async () => {
    // Un contrat ajusté après split ne vaut pas 100 ; le signaler évite une
    // valorisation fausse d'un facteur entier.
    const cell = await probeInstrument(mock, {
      id: "aapl-call",
      name: "AAPL CALL 200",
      assetType: "OPTION",
      underlying: "AAPL",
      optionType: "CALL",
      expiration: "2027-01-15",
      strike: "200",
      expectedMultiplier: "112",
    });
    expect(cell.multiplierMismatch).toBe(true);
  });

  it("rapporte une paire de change par getFxRate", async () => {
    const cell = await probeInstrument(mock, {
      id: "usdchf",
      name: "USD/CHF",
      assetType: "OTHER",
      base: "USD",
      quote: "CHF",
    });
    expect(cell.outcome).toBe("RESOLVED");
    expect(cell.priceType).toBe("FX_RATE");
  });

  it("rapporte UNSUPPORTED quand le fournisseur ne déclare pas la capacité FX", async () => {
    const withoutFx = {
      ...mock,
      capabilities: () => ({ ...mock.capabilities(), fx: false }),
    };
    const cell = await probeInstrument(withoutFx, {
      id: "usdchf",
      name: "USD/CHF",
      assetType: "OTHER",
      base: "USD",
      quote: "CHF",
    });
    expect(cell.outcome).toBe("UNSUPPORTED");
    expect(cell.reason).toContain("FX");
  });

  it("rapporte ERROR avec la nature de la panne", async () => {
    const failing = createMockProvider({
      instruments: KNOWN,
      now: NOW,
      failWith: new ProviderError("RATE_LIMITED", "mock", "quota dépassé", 60),
    });
    const cell = await probeInstrument(failing, apple);
    expect(cell.outcome).toBe("ERROR");
    expect(cell.reason).toContain("RATE_LIMITED");
  });
});

describe("runCoverageMatrix", () => {
  const definition: MatrixDefinition = {
    version: 1,
    categories: [
      {
        id: "actions",
        label: "Actions",
        priority: 1,
        instruments: [
          { id: "aapl", name: "Apple Inc.", assetType: "STOCK", isin: "US0378331005" },
          { id: "msft", name: "Microsoft", assetType: "STOCK", isin: "US5949181045" },
        ],
      },
    ],
  };

  function registryWith(...registrations: ProviderRegistration[]): ProviderRegistry {
    const registry = new ProviderRegistry();
    for (const registration of registrations) {
      registry.register(registration);
    }
    return registry;
  }

  const mockRegistration: ProviderRegistration = {
    id: "mock",
    label: "Simulé",
    capabilities: mock.capabilities(),
    verification: "FIXTURE_TESTED",
    blockedBy: "Données simulées",
    apiKeyEnvVar: null,
    documentationUrl: "local",
    create: () => mock,
  };

  it("distingue NOT_RUN de NOT_FOUND", async () => {
    const registry = registryWith(mockRegistration, ...CANDIDATE_PROVIDERS);
    const report = await runCoverageMatrix(definition, registry.list(), {}, NOW);

    const simulated = report.providers.find((p) => p.providerId === "mock");
    // Le fournisseur simulé connaît Apple mais pas Microsoft : interrogé, il
    // répond « introuvable ».
    expect(simulated?.cells.find((c) => c.instrumentId === "aapl")?.outcome).toBe("RESOLVED");
    expect(simulated?.cells.find((c) => c.instrumentId === "msft")?.outcome).toBe("NOT_FOUND");

    // Les fournisseurs réels ne sont pas instanciables : jamais interrogés.
    // Les marquer NOT_FOUND transformerait une absence de test en conclusion.
    for (const id of ["twelvedata", "massive", "eodhd", "openfigi"]) {
      const provider = report.providers.find((p) => p.providerId === id);
      expect(
        provider?.cells.every((c) => c.outcome === "NOT_RUN"),
        id,
      ).toBe(true);
      expect(
        provider?.cells.every((c) => c.reason !== null),
        id,
      ).toBe(true);
    }
  });

  it("couvre chaque instrument pour chaque fournisseur", async () => {
    const registry = registryWith(mockRegistration, ...CANDIDATE_PROVIDERS);
    const report = await runCoverageMatrix(definition, registry.list(), {}, NOW);
    expect(report.instrumentCount).toBe(2);
    for (const provider of report.providers) {
      expect(provider.cells).toHaveLength(2);
    }
  });

  it("produit un rapport identique à horloge identique", async () => {
    const registry = registryWith(mockRegistration);
    const first = await runCoverageMatrix(definition, registry.list(), {}, NOW);
    const second = await runCoverageMatrix(definition, registry.list(), {}, NOW);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe("fournisseurs candidats", () => {
  it("sont tous déclarés non vérifiés, avec leur motif de blocage", () => {
    // Tant qu'aucun appel n'a été fait, aucun ne peut prétendre à mieux.
    for (const candidate of CANDIDATE_PROVIDERS) {
      expect(candidate.verification, candidate.id).toBe("UNVERIFIED");
      expect(candidate.blockedBy, candidate.id).toBeTruthy();
    }
  });

  it("ne s'instancient pas, même si une clé est présente dans l'environnement", () => {
    // Ajouter une clé ne doit pas activer un adaptateur inexistant.
    for (const candidate of CANDIDATE_PROVIDERS) {
      expect(
        candidate.create({
          TWELVE_DATA_API_KEY: "clef",
          MASSIVE_API_KEY: "clef",
          EODHD_API_KEY: "clef",
          OPENFIGI_API_KEY: "clef",
        }),
        candidate.id,
      ).toBeNull();
    }
  });

  it("nomment leur variable de clé sans jamais porter de valeur", () => {
    for (const candidate of CANDIDATE_PROVIDERS) {
      expect(candidate.apiKeyEnvVar, candidate.id).toMatch(/^[A-Z_]+$/);
      expect(JSON.stringify(candidate)).not.toMatch(/[a-z0-9]{20,}/);
    }
  });

  it("n'annoncent jamais LIVE avant d'avoir été mesurés", () => {
    // Croire une plaquette commerciale ferait afficher « en direct » une donnée
    // qui ne l'est pas.
    for (const candidate of CANDIDATE_PROVIDERS) {
      expect(candidate.capabilities.bestFreshness, candidate.id).not.toBe("LIVE");
    }
  });

  it("déclare OpenFIGI incapable de fournir un prix", () => {
    const openfigi = CANDIDATE_PROVIDERS.find((c) => c.id === "openfigi");
    expect(openfigi?.capabilities.bestFreshness).toBe("UNAVAILABLE");
    expect(openfigi?.capabilities.history).toBe(false);
    expect(openfigi?.capabilities.streaming).toBe(false);
  });
});

describe("ProviderRegistry", () => {
  it("refuse un identifiant en double", () => {
    const registry = new ProviderRegistry();
    const registration = CANDIDATE_PROVIDERS[0] as ProviderRegistration;
    registry.register(registration);
    expect(() => registry.register(registration)).toThrow(/déjà enregistré/);
  });

  it("classe les fournisseurs par statut de vérification", () => {
    const registry = new ProviderRegistry();
    registry.register({
      id: "verifie",
      label: "Vérifié",
      capabilities: { ...mock.capabilities(), assetTypes: ["STOCK"] },
      verification: "PRODUCTION_TESTED",
      blockedBy: null,
      apiKeyEnvVar: null,
      documentationUrl: "x",
      create: () => mock,
    });
    registry.register({
      id: "jamais-appele",
      label: "Jamais appelé",
      capabilities: { ...mock.capabilities(), assetTypes: ["STOCK"] },
      verification: "UNVERIFIED",
      blockedBy: "rien de prouvé",
      apiKeyEnvVar: null,
      documentationUrl: "x",
      create: () => mock,
    });

    // Un adaptateur jamais appelé ne doit pas passer devant un adaptateur
    // éprouvé.
    const ordered = registry.forAssetType("STOCK", {});
    expect(ordered).toHaveLength(2);
    expect(registry.list()[0]?.id).toBe("verifie");
  });

  it("n'expose que les fournisseurs réellement instanciables", () => {
    const registry = new ProviderRegistry();
    for (const candidate of CANDIDATE_PROVIDERS) {
      registry.register(candidate);
    }
    expect(registry.available({})).toEqual([]);
  });
});
