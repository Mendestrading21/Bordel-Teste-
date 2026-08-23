import "server-only";

import {
  createDatabase,
  loadDatabaseConfig,
  snapshotRepository,
  type Database,
} from "@portfolio-lab/database";
import { toDecimalString, type CurrencyCode, type DecimalString } from "@portfolio-lab/domain";
import {
  componentsFingerprint,
  dailyHistory,
  historyBounds,
  isComparableSeries,
  optionExposure,
  pnlContributions,
  reconcile,
  wealthChange,
  type HistoryBounds,
  type PnlContribution,
  type PortfolioValuation,
  type ReconciliationResult,
  type SnapshotRecord,
  type UnderlyingExposure,
  type WealthChange,
  type WealthPoint,
} from "@portfolio-lab/portfolio-engine";

import { resolveDataMode } from "./mode";
import type { PortfolioView } from "./portfolio";

/**
 * Lecture et écriture de l'historique du patrimoine.
 *
 * L'historique n'est **pas** recalculé rétroactivement : chaque point est le
 * résultat d'un calcul réellement effectué à sa date, avec les cours et les
 * taux de ce moment-là. Reconstituer une courbe passée avec les cours
 * d'aujourd'hui produirait un graphique plausible et faux.
 */

/** Nombre de points chargés — un an de jours ouvrés, plus une marge. */
export const HISTORY_LIMIT = 400;

let cachedDatabase: Database | null = null;

function database(): Database {
  cachedDatabase ??= createDatabase(loadDatabaseConfig());
  return cachedDatabase;
}

export type OptionExposureRecord = {
  readonly underlyingId: string;
  readonly underlyingLabel: string;
  readonly marketValueBase: DecimalString;
  readonly notionalBase: DecimalString;
  readonly contractCount: number;
};

export type AnalyticsView = {
  readonly history: readonly WealthPoint[];
  readonly bounds: HistoryBounds | null;
  readonly change: WealthChange | null;
  /** `false` quand la série mêle des versions du moteur ou des devises. */
  readonly comparable: boolean;
  readonly contributions: readonly PnlContribution[];
  readonly options: readonly OptionExposureRecord[];
  readonly reconciliation: ReconciliationResult;
  /** Empreinte des composants de la valorisation affichée. */
  readonly fingerprint: string;
};

/**
 * Requête des contrats d'option d'un portefeuille.
 *
 * Le strike et le multiplicateur viennent de `option_contracts`, jamais d'une
 * valeur par défaut : `DATA_MODEL.md` interdit de supposer un multiplicateur, et
 * une exposition notionnelle calculée sur un multiplicateur supposé serait
 * fausse d'un facteur entier.
 */
const OPTION_CONTRACTS_QUERY = `
  select
    p.id                        as position_id,
    p.quantity::text            as quantity,
    oc.multiplier::text         as multiplier,
    oc.strike::text             as strike,
    oc.underlying_instrument_id as underlying_id,
    u.name                      as underlying_label
  from positions p
  join option_contracts oc on oc.instrument_id = p.instrument_id
  join instruments u on u.id = oc.underlying_instrument_id
  where p.portfolio_id = $1
`;

type OptionContractRow = {
  position_id: string;
  quantity: string;
  multiplier: string;
  strike: string;
  underlying_id: string;
  underlying_label: string;
};

/**
 * Charge les analyses dérivées d'une vue déjà valorisée.
 *
 * La valorisation est passée en argument plutôt que recalculée : deux calculs
 * séparés dans le même rendu pourraient diverger si un cours change entre les
 * deux, et le total de l'accueil ne correspondrait plus aux parts de l'analyse.
 */
export async function loadAnalytics(view: PortfolioView): Promise<AnalyticsView | null> {
  const valuation = view.valuation;
  if (valuation === null) {
    return null;
  }

  const mode = resolveDataMode();
  const userId = mode.kind === "demo" ? mode.userId : null;
  const portfolioId = view.portfolio?.id ?? null;

  let history: readonly WealthPoint[] = [];
  let options: readonly OptionExposureRecord[] = [];

  if (userId !== null && portfolioId !== null) {
    ({ history, options } = await database().withUser(userId, async (client) => {
      const snapshots = await snapshotRepository.listRecent(client, portfolioId, HISTORY_LIMIT);
      const records: SnapshotRecord[] = snapshots.map((row) => ({
        snapshotAt: row.snapshot_at.toISOString(),
        marketValueBase: row.market_value_base,
        costBasisBase: row.cost_basis_base,
        unrealizedPnlBase: row.unrealized_pnl_base,
        baseCurrency: row.base_currency,
        calculationVersion: row.calculation_version,
      }));

      const { rows } = await client.query<OptionContractRow>(OPTION_CONTRACTS_QUERY, [portfolioId]);
      const valuedById = new Map(valuation.positions.map((p) => [p.positionId, p]));
      const labels = new Map<string, string>();

      const exposures = optionExposure(
        rows.flatMap((row) => {
          const valued = valuedById.get(row.position_id);
          // Un contrat non valorisé n'entre pas dans l'exposition : sa valeur de
          // marché est inconnue, et lui en prêter une de zéro sous-estimerait
          // l'exposition affichée.
          if (valued === undefined) {
            return [];
          }
          labels.set(row.underlying_id, row.underlying_label);
          return [
            {
              positionId: row.position_id,
              underlyingId: row.underlying_id,
              quantity: toDecimalString(row.quantity),
              multiplier: toDecimalString(row.multiplier),
              strike: toDecimalString(row.strike),
              marketValueBase: valued.marketValueBase,
              fxRate: valued.fxRate,
            },
          ];
        }),
      );

      return {
        history: dailyHistory(records),
        options: exposures.map((exposure: UnderlyingExposure) => ({
          underlyingId: exposure.underlyingId,
          underlyingLabel: labels.get(exposure.underlyingId) ?? exposure.underlyingId,
          marketValueBase: exposure.marketValueBase,
          notionalBase: exposure.notionalBase,
          contractCount: exposure.contractCount,
        })),
      };
    }));
  }

  return {
    history,
    bounds: historyBounds(history),
    change: wealthChange(history),
    comparable: isComparableSeries(history),
    contributions: pnlContributions(valuation),
    options,
    reconciliation: reconcile(valuation),
    fingerprint: componentsFingerprint(valuation),
  };
}

/**
 * Enregistre un point d'historique pour la valorisation courante.
 *
 * `now` est un paramètre : la date d'un snapshot est une donnée du calcul, pas
 * un effet de bord de l'instant où le code s'exécute. Les tests peuvent ainsi
 * rejouer une séquence complète.
 */
export async function recordSnapshot(
  view: PortfolioView,
  valuation: PortfolioValuation,
  now: Date,
): Promise<{ readonly recorded: boolean; readonly reason?: string }> {
  const mode = resolveDataMode();
  const userId = mode.kind === "demo" ? mode.userId : null;
  const portfolio = view.portfolio;

  if (userId === null || portfolio === null) {
    return { recorded: false, reason: "Aucune session active." };
  }

  /*
   * Un portefeuille dont aucune position n'est valorisable ne produit pas de
   * point : enregistrer un patrimoine de zéro créerait un creux dans la courbe
   * là où il n'y a qu'une absence de cours.
   */
  if (valuation.positions.length === 0) {
    return {
      recorded: false,
      reason: "Aucune position valorisée : un point à zéro ferait apparaître une chute fictive.",
    };
  }

  await database().withUser(userId, (client) =>
    snapshotRepository.record(client, {
      userId,
      portfolioId: portfolio.id,
      snapshotAt: now.toISOString(),
      marketValueBase: valuation.totalMarketValueBase,
      costBasisBase: valuation.totalCostBasisBase,
      unrealizedPnlBase: valuation.totalUnrealizedPnlBase,
      dayPnlBase: valuation.totalDayPnlBase,
      baseCurrency: valuation.baseCurrency as CurrencyCode,
      calculationVersion: valuation.calculationVersion,
      componentsHash: componentsFingerprint(valuation),
    }),
  );

  return { recorded: true };
}
