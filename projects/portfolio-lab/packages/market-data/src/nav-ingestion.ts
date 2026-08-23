import { toDecimalString, type CurrencyCode, type DecimalString } from "@portfolio-lab/domain";

import { ProviderError, type MarketDataProvider, type NormalizedQuote } from "./contract.js";
import { evaluateNavStatus, type HolidayCalendar, type NavFrequency } from "./nav-calendar.js";

/**
 * Ingestion programmée des NAV de fonds.
 *
 * Un fonds ne se souscrit pas comme une action : sa valeur est publiée une fois
 * par période, et il n'existe aucun flux à écouter. L'ingestion est donc un
 * travail périodique, pas une souscription — et le mélanger au canal temps réel
 * ferait apparaître les fonds comme des instruments cotés en continu.
 */

export type FundReference = {
  readonly instrumentId: string;
  readonly isin: string;
  readonly expectedCurrency: CurrencyCode;
  readonly frequency: NavFrequency;
  /** Étiquette de classe de parts, affichée telle quelle. */
  readonly shareClass: string | null;
};

/** NAV retenue pour un fonds, avec tout ce qui permet de la juger. */
export type NavRecord = {
  readonly instrumentId: string;
  readonly isin: string;
  readonly value: DecimalString;
  readonly currency: CurrencyCode;
  /** Date de **valeur** de la NAV, pas l'instant de récupération. */
  readonly navDate: string;
  readonly provider: string;
  readonly retrievedAt: string;
  readonly frequency: NavFrequency;
  readonly shareClass: string | null;
};

/** Motif d'échec d'ingestion, pour une ligne précise. */
export type NavIngestionFailure = {
  readonly instrumentId: string;
  readonly isin: string;
  readonly reason:
    | "NOT_FOUND"
    | "CURRENCY_MISMATCH"
    | "NOT_A_NAV"
    | "INVALID_VALUE"
    | "INVALID_DATE"
    | "PROVIDER_ERROR";
  readonly detail: string;
};

export type NavIngestionResult = {
  readonly records: readonly NavRecord[];
  readonly failures: readonly NavIngestionFailure[];
  readonly startedAt: string;
  readonly finishedAt: string;
};

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Convertit une quote fournisseur en NAV exploitable.
 *
 * Les contrôles sont volontairement stricts. Une NAV est la **seule** source de
 * valeur d'un fonds : accepter une valeur douteuse produirait un portefeuille
 * plausible mais faux, sans rien pour le signaler.
 */
export function toNavRecord(
  fund: FundReference,
  quote: NormalizedQuote,
):
  | { readonly ok: true; readonly record: NavRecord }
  | {
      readonly ok: false;
      readonly failure: NavIngestionFailure;
    } {
  const base = { instrumentId: fund.instrumentId, isin: fund.isin };

  if (quote.priceType !== "NAV") {
    // Un fonds valorisé par un « dernier échange » signale une confusion
    // d'instrument : on refuse plutôt que d'afficher un prix qui n'en est pas un.
    return {
      ok: false,
      failure: {
        ...base,
        reason: "NOT_A_NAV",
        detail: `Type de prix « ${quote.priceType} » au lieu de NAV`,
      },
    };
  }

  if (quote.currency !== fund.expectedCurrency) {
    // Devise différente = très probablement une autre classe de parts.
    return {
      ok: false,
      failure: {
        ...base,
        reason: "CURRENCY_MISMATCH",
        detail: `Devise ${quote.currency} au lieu de ${fund.expectedCurrency}`,
      },
    };
  }

  if (!DECIMAL_PATTERN.test(quote.price) || Number(quote.price) <= 0) {
    return {
      ok: false,
      failure: { ...base, reason: "INVALID_VALUE", detail: "Valeur nulle, négative ou illisible" },
    };
  }

  const navDate = quote.asOf.slice(0, 10);
  if (!ISO_DATE_PATTERN.test(navDate) || Number.isNaN(Date.parse(quote.asOf))) {
    return {
      ok: false,
      failure: { ...base, reason: "INVALID_DATE", detail: `Horodatage illisible : ${quote.asOf}` },
    };
  }

  return {
    ok: true,
    record: {
      instrumentId: fund.instrumentId,
      isin: fund.isin,
      value: toDecimalString(quote.price),
      currency: quote.currency,
      navDate,
      provider: quote.provider,
      retrievedAt: quote.receivedAt,
      frequency: fund.frequency,
      shareClass: fund.shareClass,
    },
  };
}

/**
 * Récupère les NAV d'un ensemble de fonds.
 *
 * L'échec d'un fonds n'interrompt pas les autres : un portefeuille de dix fonds
 * dont un seul pose problème doit rester valorisé à neuf, avec la lacune
 * signalée.
 */
export async function ingestNavs(
  provider: MarketDataProvider,
  funds: readonly FundReference[],
  now: () => Date,
): Promise<NavIngestionResult> {
  const startedAt = now().toISOString();
  const records: NavRecord[] = [];
  const failures: NavIngestionFailure[] = [];

  for (const fund of funds) {
    try {
      // Résolution par ISIN : le seul identifiant qui distingue deux classes de
      // parts du même fonds.
      const resolved = await provider.resolve({ kind: "ISIN", isin: fund.isin });

      if (resolved === null) {
        failures.push({
          instrumentId: fund.instrumentId,
          isin: fund.isin,
          reason: "NOT_FOUND",
          detail: "ISIN non résolu par le fournisseur",
        });
        continue;
      }

      const outcome = toNavRecord(fund, await provider.getSnapshot(resolved));
      if (outcome.ok) {
        records.push(outcome.record);
      } else {
        failures.push(outcome.failure);
      }
    } catch (error) {
      failures.push({
        instrumentId: fund.instrumentId,
        isin: fund.isin,
        reason: "PROVIDER_ERROR",
        detail:
          error instanceof ProviderError
            ? `${error.kind} : ${error.message}`
            : "Erreur inattendue du fournisseur",
      });
    }
  }

  return { records, failures, startedAt, finishedAt: now().toISOString() };
}

/** NAV enrichie de son verdict de fraîcheur, prête à afficher. */
export type NavPresentation = {
  readonly record: NavRecord;
  readonly status: ReturnType<typeof evaluateNavStatus>;
  /** Fraîcheur canonique du produit, dérivée du verdict. */
  readonly freshness: "NAV" | "STALE" | "UNAVAILABLE";
};

/**
 * Prépare une NAV pour l'affichage.
 *
 * La fraîcheur reste `NAV` tant que la publication est dans les délais attendus
 * pour sa fréquence — et non selon un seuil horaire, qui ferait clignoter
 * « périmé » sur tout le portefeuille chaque week-end.
 */
export function presentNav(
  record: NavRecord,
  now: Date,
  holidays?: HolidayCalendar,
): NavPresentation {
  const status = evaluateNavStatus(
    new Date(`${record.navDate}T00:00:00.000Z`),
    now,
    record.frequency,
    holidays,
  );

  const freshness =
    status.kind === "CURRENT"
      ? ("NAV" as const)
      : status.kind === "STALE"
        ? ("STALE" as const)
        : // Une NAV datée dans le futur ou absente n'est pas exploitable.
          ("UNAVAILABLE" as const);

  return { record, status, freshness };
}
