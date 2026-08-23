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
  type MarkFixture,
  type PositionInput,
  type PortfolioValuation,
} from "@portfolio-lab/portfolio-engine";
import { toDecimalString, type CurrencyCode, type DecimalString } from "@portfolio-lab/domain";

import demoMarks from "../../../../../tests/fixtures/demo-marks.json" with { type: "json" };

import { resolveDataMode, type DataMode } from "./mode";

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

  const userId = mode.kind === "demo" ? mode.userId : null;
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
      assetType: row.asset_type,
      quantity: toDecimalString(row.quantity),
      averageCost: toDecimalString(row.average_cost),
      costCurrency: row.cost_currency as CurrencyCode,
      multiplier: toDecimalString(row.multiplier),
      notes: row.notes,
    }));

    const fixture = demoFixture();
    const inputs: PositionInput[] = positions.map((position) => ({
      positionId: position.positionId,
      accountId: position.accountId,
      instrumentId: position.instrumentId,
      quantity: position.quantity,
      averageCost: position.averageCost,
      costCurrency: position.costCurrency,
      multiplier: position.multiplier,
    }));

    return {
      mode,
      authenticated: true,
      portfolio,
      accounts,
      positions,
      valuation: valuePortfolio(
        inputs,
        fixture.marks,
        fixture.fx,
        portfolio.base_currency as CurrencyCode,
      ),
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
  const userId = mode.kind === "demo" ? mode.userId : null;
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
