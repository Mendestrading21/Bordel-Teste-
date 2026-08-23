import type { CurrencyCode, DecimalString } from "@portfolio-lab/domain";

import { ProviderError, type InstrumentReference, type MarketDataProvider } from "./contract.js";
import type { ProviderRegistration, VerificationStatus } from "./registry.js";

/**
 * Exécution de la matrice de couverture.
 *
 * `MARKET_DATA.md` impose que le choix d'un fournisseur découle d'une matrice
 * exécutée sur des instruments représentatifs, et non d'une promesse générale.
 * Ce module produit ce résultat sous une forme reproductible.
 *
 * Le point crucial est la distinction entre `NOT_RUN` et `NOT_FOUND` : un
 * fournisseur qu'on n'a jamais interrogé n'a pas « échoué à trouver »
 * l'instrument. Confondre les deux transformerait une absence de test en
 * conclusion.
 */

export type MatrixInstrument = {
  readonly id: string;
  readonly name: string;
  readonly assetType: string;
  readonly ticker?: string;
  readonly isin?: string;
  readonly exchangeMic?: string;
  readonly currency?: string;
  readonly underlying?: string;
  readonly optionType?: "CALL" | "PUT";
  readonly expiration?: string;
  readonly strike?: string;
  readonly expectedMultiplier?: string;
  readonly base?: string;
  readonly quote?: string;
  readonly shareClass?: string;
};

export type MatrixCategory = {
  readonly id: string;
  readonly label: string;
  readonly priority: number;
  readonly instruments: readonly MatrixInstrument[];
};

export type MatrixDefinition = {
  readonly version: number;
  readonly categories: readonly MatrixCategory[];
};

/** Issue d'une cellule de la matrice. */
export type CellOutcome =
  /** Le fournisseur n'a jamais été interrogé. */
  | "NOT_RUN"
  /** Interrogé, instrument résolu et valorisé. */
  | "RESOLVED"
  /** Interrogé, instrument résolu mais aucun prix disponible. */
  | "RESOLVED_NO_PRICE"
  /** Interrogé, instrument introuvable. */
  | "NOT_FOUND"
  /** Interrogé, plusieurs candidats sans départage possible. */
  | "AMBIGUOUS"
  /** Le fournisseur ne prend pas en charge cette classe d'actifs. */
  | "UNSUPPORTED"
  /** Erreur d'appel : réseau, quota, authentification. */
  | "ERROR";

export type MatrixCell = {
  readonly providerId: string;
  readonly instrumentId: string;
  readonly outcome: CellOutcome;
  /** Renseigné uniquement pour `NOT_RUN`, `UNSUPPORTED` et `ERROR`. */
  readonly reason: string | null;
  readonly resolvedName: string | null;
  readonly resolvedSymbol: string | null;
  readonly resolvedCurrency: CurrencyCode | null;
  readonly resolvedExchangeMic: string | null;
  readonly priceType: string | null;
  readonly freshness: string | null;
  readonly asOf: string | null;
  /** Multiplicateur lu chez le fournisseur, pour les options. */
  readonly multiplier: DecimalString | null;
  /** `true` si le multiplicateur lu diffère de celui attendu. */
  readonly multiplierMismatch: boolean;
};

export type ProviderMatrixResult = {
  readonly providerId: string;
  readonly providerLabel: string;
  readonly verification: VerificationStatus;
  readonly blockedBy: string | null;
  readonly documentationUrl: string;
  readonly cells: readonly MatrixCell[];
};

export type MatrixReport = {
  readonly generatedAt: string;
  readonly definitionVersion: number;
  readonly instrumentCount: number;
  readonly providers: readonly ProviderMatrixResult[];
};

/** Cellule vide, à spécialiser par l'appelant. */
function blankCell(
  providerId: string,
  instrumentId: string,
  outcome: CellOutcome,
  reason: string | null,
): MatrixCell {
  return {
    providerId,
    instrumentId,
    outcome,
    reason,
    resolvedName: null,
    resolvedSymbol: null,
    resolvedCurrency: null,
    resolvedExchangeMic: null,
    priceType: null,
    freshness: null,
    asOf: null,
    multiplier: null,
    multiplierMismatch: false,
  };
}

/** Cellule « jamais interrogé », qui porte toujours sa raison. */
function notRun(providerId: string, instrumentId: string, reason: string): MatrixCell {
  return blankCell(providerId, instrumentId, "NOT_RUN", reason);
}

/** Construit la référence à utiliser pour interroger un fournisseur. */
export function referenceFor(instrument: MatrixInstrument): InstrumentReference | null {
  if (instrument.assetType === "OPTION") {
    if (
      instrument.underlying === undefined ||
      instrument.optionType === undefined ||
      instrument.expiration === undefined ||
      instrument.strike === undefined
    ) {
      return null;
    }
    return {
      kind: "OPTION",
      underlying: instrument.underlying,
      optionType: instrument.optionType,
      expiration: instrument.expiration,
      strike: instrument.strike as DecimalString,
    };
  }

  // L'ISIN d'abord : c'est l'identifiant le plus sûr, et le seul qui distingue
  // deux classes de parts d'un même fonds.
  if (instrument.isin !== undefined) {
    return { kind: "ISIN", isin: instrument.isin };
  }
  if (instrument.ticker !== undefined) {
    return instrument.exchangeMic === undefined
      ? { kind: "TICKER", ticker: instrument.ticker }
      : { kind: "TICKER", ticker: instrument.ticker, exchangeMic: instrument.exchangeMic };
  }
  return null;
}

/** Interroge un fournisseur pour un instrument et rapporte le résultat. */
export async function probeInstrument(
  provider: MarketDataProvider,
  instrument: MatrixInstrument,
): Promise<MatrixCell> {
  const base = { providerId: provider.id, instrumentId: instrument.id };

  // Les paires de change se testent par `getFxRate`, pas par `resolve`.
  if (instrument.base !== undefined && instrument.quote !== undefined) {
    if (!provider.capabilities().fx || provider.getFxRate === undefined) {
      return blankCell(
        provider.id,
        instrument.id,
        "UNSUPPORTED",
        "Le fournisseur ne déclare pas la capacité FX",
      );
    }
    try {
      const rate = await provider.getFxRate(
        instrument.base as CurrencyCode,
        instrument.quote as CurrencyCode,
      );
      return {
        ...base,
        outcome: "RESOLVED",
        reason: null,
        resolvedName: `${rate.base}/${rate.quote}`,
        resolvedSymbol: `${rate.base}${rate.quote}`,
        resolvedCurrency: rate.quote,
        resolvedExchangeMic: null,
        priceType: "FX_RATE",
        freshness: rate.freshness,
        asOf: rate.asOf,
        multiplier: null,
        multiplierMismatch: false,
      };
    } catch (error) {
      return classifyError(base, error);
    }
  }

  const reference = referenceFor(instrument);
  if (reference === null) {
    return blankCell(
      provider.id,
      instrument.id,
      "UNSUPPORTED",
      "Instrument sans identifiant exploitable",
    );
  }

  try {
    const resolved = await provider.resolve(reference);
    if (resolved === null) {
      // NOT_FOUND sans raison : l'absence de résultat *est* le résultat.
      return blankCell(provider.id, instrument.id, "NOT_FOUND", null);
    }

    const multiplier = resolved.optionContract?.multiplier ?? null;
    const multiplierMismatch =
      instrument.expectedMultiplier !== undefined &&
      multiplier !== null &&
      multiplier !== instrument.expectedMultiplier;

    try {
      const quote = await provider.getSnapshot(resolved);
      return {
        ...base,
        outcome: "RESOLVED",
        reason: null,
        resolvedName: resolved.name,
        resolvedSymbol: resolved.providerSymbol,
        resolvedCurrency: resolved.currency,
        resolvedExchangeMic: resolved.exchangeMic,
        priceType: quote.priceType,
        freshness: quote.freshness,
        asOf: quote.asOf,
        multiplier,
        multiplierMismatch,
      };
    } catch {
      // Résolu mais non valorisé : c'est une couverture partielle, distincte
      // d'un instrument introuvable.
      return {
        ...base,
        outcome: "RESOLVED_NO_PRICE",
        reason: null,
        resolvedName: resolved.name,
        resolvedSymbol: resolved.providerSymbol,
        resolvedCurrency: resolved.currency,
        resolvedExchangeMic: resolved.exchangeMic,
        priceType: null,
        freshness: null,
        asOf: null,
        multiplier,
        multiplierMismatch,
      };
    }
  } catch (error) {
    return classifyError(base, error);
  }
}

function classifyError(
  base: { providerId: string; instrumentId: string },
  error: unknown,
): MatrixCell {
  const kind = error instanceof ProviderError ? error.kind : "NETWORK";
  const outcome: CellOutcome =
    kind === "AMBIGUOUS" ? "AMBIGUOUS" : kind === "UNSUPPORTED" ? "UNSUPPORTED" : "ERROR";
  return blankCell(
    base.providerId,
    base.instrumentId,
    outcome,
    `${kind} : ${(error as Error).message}`,
  );
}

/**
 * Exécute la matrice complète.
 *
 * Un fournisseur non instanciable — clé absente, adaptateur non implémenté —
 * produit des cellules `NOT_RUN` portant la raison, jamais des `NOT_FOUND` qui
 * feraient croire à un défaut de couverture.
 */
export async function runCoverageMatrix(
  definition: MatrixDefinition,
  registrations: readonly ProviderRegistration[],
  env: Readonly<Record<string, string | undefined>>,
  now: () => Date,
): Promise<MatrixReport> {
  const instruments = definition.categories.flatMap((category) => category.instruments);

  const providers = await Promise.all(
    registrations.map(async (registration): Promise<ProviderMatrixResult> => {
      const provider = registration.create(env);

      const cells =
        provider === null
          ? instruments.map((instrument) =>
              notRun(
                registration.id,
                instrument.id,
                registration.blockedBy ?? "Fournisseur non instanciable",
              ),
            )
          : await Promise.all(
              instruments.map((instrument) => probeInstrument(provider, instrument)),
            );

      return {
        providerId: registration.id,
        providerLabel: registration.label,
        verification: registration.verification,
        blockedBy: registration.blockedBy,
        documentationUrl: registration.documentationUrl,
        cells,
      };
    }),
  );

  return {
    generatedAt: now().toISOString(),
    definitionVersion: definition.version,
    instrumentCount: instruments.length,
    providers,
  };
}
