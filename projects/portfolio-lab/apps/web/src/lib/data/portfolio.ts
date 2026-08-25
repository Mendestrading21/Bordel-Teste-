import "server-only";

import {
  accountRepository,
  createDatabase,
  loadDatabaseConfig,
  portfolioRepository,
  positionRepository,
  type AccountRow,
  type Database,
  type PortfolioRow,
} from "@portfolio-lab/database";
import {
  loadMarkFixture,
  valuePortfolio,
  type FxTable,
  type MarkFixture,
  type PositionInput,
  type PortfolioValuation,
} from "@portfolio-lab/portfolio-engine";
import { toDecimalString, type CurrencyCode, type DecimalString } from "@portfolio-lab/domain";
import { presentNav, type NavFrequency } from "@portfolio-lab/market-data";

import { fxTableFromReport } from "@/lib/live/fx-table";
import { fetchFxRates } from "@/lib/live/quote-service";

import demoMarks from "../../../../../tests/fixtures/demo-marks.json" with { type: "json" };

import { resolveDataMode, type DataMode } from "./mode";
import { currentUserId } from "@/lib/auth/owner";

/**
 * Accès aux données de portefeuille côté serveur.
 *
 * `server-only` garantit qu'une importation depuis un composant client casse la
 * compilation : ce module lit `DATABASE_URL` et ne doit jamais franchir la
 * frontière du navigateur.
 */

let cachedDatabase: Database | null = null;

function database(): Database {
  cachedDatabase ??= createDatabase(loadDatabaseConfig());
  return cachedDatabase;
}

/** Cours de démonstration, validés au chargement. */
export function demoFixture(): MarkFixture {
  return loadMarkFixture(demoMarks);
}

export type PositionRecord = {
  readonly positionId: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly instrumentId: string;
  readonly instrumentName: string;
  /** Symbole court affiché en tête de ligne ; absent pour un actif sans ticker. */
  readonly shortName: string | null;
  readonly assetType: string;
  readonly quantity: DecimalString;
  readonly averageCost: DecimalString;
  readonly costCurrency: CurrencyCode;
  readonly multiplier: DecimalString;
  readonly notes: string | null;
};

export type PortfolioView = {
  readonly mode: DataMode;
  /**
   * `false` quand aucune identité n'est établie.
   *
   * Distingue « pas encore connecté » de « connecté, portefeuille vide » : les
   * deux méritent un écran différent.
   */
  readonly authenticated: boolean;
  readonly portfolio: PortfolioRow | null;
  readonly accounts: readonly AccountRow[];
  readonly positions: readonly PositionRecord[];
  readonly valuation: PortfolioValuation | null;
  /** Horodatage des cours utilisés, pour l'affichage de fraîcheur. */
  readonly marksAsOf: string | null;
};

const EMPTY_VIEW = (mode: DataMode): PortfolioView => ({
  mode,
  authenticated: mode.kind === "demo",
  portfolio: null,
  accounts: [],
  positions: [],
  valuation: null,
  marksAsOf: null,
});

/**
 * Table de taux à utiliser pour la valorisation.
 *
 * Un taux réellement obtenu remplace celui de la fixture. Un taux **manquant**
 * ne provoque pas de repli sur la fixture : la devise disparaît de la table, et
 * le moteur rend les positions concernées non valorisées avec leur motif. Se
 * rabattre sur un taux de démonstration produirait un total plausible et faux,
 * sans que rien ne le distingue d'un total correct.
 */
async function resolveFxTable(
  currencies: readonly CurrencyCode[],
  baseCurrency: CurrencyCode,
  fallback: FxTable,
): Promise<FxTable> {
  const report = await fetchFxRates(currencies, baseCurrency);

  // Aucun fournisseur configuré : les taux de fixture restent en place, avec
  // leur fraîcheur `MANUAL`, que le moteur propage à chaque ligne convertie.
  if (report === null) return fallback;

  return fxTableFromReport(report);
}

/**
 * Requête unique récupérant positions, comptes et instruments.
 *
 * Une seule requête plutôt qu'une boucle de lectures : le nombre de positions
 * est petit, mais N+1 requêtes derrière RLS multiplieraient aussi les
 * évaluations de politique.
 */
const POSITIONS_QUERY = `
  select
    p.id                                       as position_id,
    p.account_id,
    a.name                                     as account_name,
    p.instrument_id,
    i.name                                     as instrument_name,
    i.short_name,
    i.asset_type::text                         as asset_type,
    p.quantity::text                           as quantity,
    p.average_cost::text                       as average_cost,
    p.cost_currency,
    coalesce(oc.multiplier, 1)::text           as multiplier,
    p.notes
  from positions p
  join accounts a on a.id = p.account_id
  join instruments i on i.id = p.instrument_id
  left join option_contracts oc on oc.instrument_id = p.instrument_id
  where p.portfolio_id = $1
  order by a.display_order asc, i.name asc
`;

type PositionQueryRow = {
  position_id: string;
  account_id: string;
  account_name: string;
  instrument_id: string;
  instrument_name: string;
  short_name: string | null;
  asset_type: string;
  quantity: string;
  average_cost: string;
  cost_currency: string;
  multiplier: string;
  notes: string | null;
};

/**
 * Charge la vue complète du portefeuille et la valorise.
 *
 * Les cours proviennent des fixtures de démonstration tant qu'aucun fournisseur
 * réel n'est intégré (Lot 05). Ils sont marqués `MANUAL` ou `NAV`, jamais
 * `LIVE` : l'interface affiche donc explicitement qu'aucun cours n'est en
 * direct.
 */
export async function loadPortfolioView(): Promise<PortfolioView> {
  const mode = resolveDataMode();

  if (mode.kind === "unavailable") {
    return EMPTY_VIEW(mode);
  }

  const userId = await currentUserId(mode);
  if (userId === null) {
    /*
     * Mode `database` sans session authentifiée.
     *
     * On renvoie `authenticated: false` plutôt qu'une vue vide : sans cette
     * distinction, l'accueil afficherait « aucun placement enregistré » à un
     * utilisateur simplement déconnecté, qui pourrait croire ses données
     * perdues.
     */
    return { ...EMPTY_VIEW(mode), authenticated: false };
  }

  const db = database();

  return db.withUser(userId, async (client) => {
    const portfolios = await portfolioRepository.list(client);
    const portfolio = portfolios[0] ?? null;

    if (portfolio === null) {
      return EMPTY_VIEW(mode);
    }

    const accounts = await accountRepository.listByPortfolio(client, portfolio.id);
    const { rows } = await client.query<PositionQueryRow>(POSITIONS_QUERY, [portfolio.id]);

    const positions: PositionRecord[] = rows.map((row) => ({
      positionId: row.position_id,
      accountId: row.account_id,
      accountName: row.account_name,
      instrumentId: row.instrument_id,
      instrumentName: row.instrument_name,
      shortName: row.short_name,
      assetType: row.asset_type,
      quantity: toDecimalString(row.quantity),
      averageCost: toDecimalString(row.average_cost),
      costCurrency: row.cost_currency as CurrencyCode,
      multiplier: toDecimalString(row.multiplier),
      notes: row.notes,
    }));

    const fixture = demoFixture();

    /*
     * Les fonds sont valorisés par la NAV réellement stockée, jamais par la
     * fixture générale. Une NAV a une date de valeur et un statut de fraîcheur
     * propres : les remplacer par un cours de fixture ferait disparaître
     * précisément l'information qui distingue un fonds d'un titre coté.
     */
    const navMarks = new Map(fixture.marks);
    const { rows: navRows } = await client.query<{
      instrument_id: string;
      nav_date: string;
      value: string;
      currency: string;
      provider: string;
      nav_frequency: string | null;
    }>(
      `select distinct on (h.instrument_id)
              h.instrument_id,
              h.nav_date::text as nav_date,
              h.value::text    as value,
              h.currency,
              h.provider,
              fd.nav_frequency::text as nav_frequency
       from fund_nav_history h
       left join fund_details fd on fd.instrument_id = h.instrument_id
       order by h.instrument_id, h.nav_date desc`,
    );

    const now = new Date();
    for (const row of navRows) {
      const presentation = presentNav(
        {
          instrumentId: row.instrument_id,
          isin: "",
          value: toDecimalString(row.value),
          currency: row.currency as CurrencyCode,
          navDate: row.nav_date,
          provider: row.provider,
          retrievedAt: now.toISOString(),
          frequency: (row.nav_frequency ?? "UNKNOWN") as NavFrequency,
          shareClass: null,
        },
        now,
      );

      // Une NAV inexploitable n'est pas remplacée par une valeur de repli : la
      // position apparaîtra comme non valorisée, ce qui est l'état réel.
      if (presentation.freshness === "UNAVAILABLE") {
        navMarks.delete(row.instrument_id);
        continue;
      }

      navMarks.set(row.instrument_id, {
        price: toDecimalString(row.value),
        currency: row.currency as CurrencyCode,
        priceType: "NAV",
        freshness: presentation.freshness,
        // La date de valeur de la NAV, pas l'instant de lecture.
        asOf: `${row.nav_date}T00:00:00.000Z`,
        provider: row.provider,
      });
    }

    const inputs: PositionInput[] = positions.map((position) => ({
      positionId: position.positionId,
      accountId: position.accountId,
      instrumentId: position.instrumentId,
      quantity: position.quantity,
      averageCost: position.averageCost,
      costCurrency: position.costCurrency,
      multiplier: position.multiplier,
    }));

    const baseCurrency = portfolio.base_currency as CurrencyCode;

    /*
     * Les taux de change viennent d'un fournisseur réel dès qu'il en existe un.
     *
     * Ils venaient jusqu'ici des fixtures **en toutes circonstances**. Sur un
     * portefeuille de démonstration c'est sans conséquence : tout y est marqué
     * « Manuel ». Sur des positions réelles, cela convertissait de vrais
     * montants en USD avec un taux inventé, et le total en CHF paraissait aussi
     * solide que s'il avait été juste — le pire cas possible, parce que rien à
     * l'écran ne le signalait.
     *
     * Quand aucun fournisseur n'est configuré, les taux de fixture restent
     * utilisés mais portent leur fraîcheur d'origine, `MANUAL`, que le moteur
     * propage à chaque ligne convertie.
     */
    const currencies = [...new Set(positions.map((position) => position.costCurrency))];
    const fxTable = await resolveFxTable(currencies, baseCurrency, fixture.fx);

    return {
      mode,
      authenticated: true,
      portfolio,
      accounts,
      positions,
      valuation: valuePortfolio(inputs, navMarks, fxTable, baseCurrency),
      marksAsOf: fixture.asOf,
    };
  });
}

/** Instrument sélectionnable dans le formulaire d'ajout. */
export type InstrumentOptionRecord = {
  readonly id: string;
  readonly name: string;
  readonly assetType: string;
  readonly currency: string;
};

/**
 * Liste des instruments déjà enregistrés.
 *
 * Tant que la résolution chez un fournisseur n'existe pas (Lot 04), le
 * formulaire ne propose que le référentiel local. Il ne suggère jamais un
 * instrument qu'aucune source n'a réellement résolu.
 */
export async function listInstruments(): Promise<readonly InstrumentOptionRecord[]> {
  const mode = resolveDataMode();
  const userId = await currentUserId(mode);
  if (userId === null) {
    return [];
  }

  return database().withUser(userId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      name: string;
      asset_type: string;
      primary_currency: string;
    }>(
      `select id, name, asset_type::text as asset_type, primary_currency
       from instruments
       where is_active
       order by name asc`,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      assetType: row.asset_type,
      currency: row.primary_currency,
    }));
  });
}

export { accountRepository, positionRepository };
