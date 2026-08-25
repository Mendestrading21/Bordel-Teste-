import "server-only";

import {
  createDatabase,
  loadDatabaseConfig,
  portfolioRepository,
  type Database,
} from "@portfolio-lab/database";

import { resolveDataMode } from "./mode";
import { currentUserId } from "@/lib/auth/owner";

/**
 * Sauvegarde et suppression des données personnelles.
 *
 * `PRODUCT_SPEC.md` liste « export et suppression des données » parmi les
 * écrans obligatoires. Les deux vont ensemble : proposer une suppression
 * définitive sans moyen d'emporter ses données d'abord serait une impasse.
 */

let cachedDatabase: Database | null = null;

function database(): Database {
  cachedDatabase ??= createDatabase(loadDatabaseConfig());
  return cachedDatabase;
}

/**
 * Version du format d'export.
 *
 * Un fichier sans version ne peut pas être relu de façon fiable dans un an :
 * on ne saurait pas quelles colonnes il contient ni comment interpréter ses
 * décimales.
 */
export const EXPORT_FORMAT_VERSION = 1;

export type PortfolioExport = {
  readonly formatVersion: number;
  readonly exportedAt: string;
  readonly baseCurrency: string;
  /**
   * Avertissement inscrit **dans** le fichier.
   *
   * Un export de patrimoine qui traîne dans un dossier de téléchargements ne
   * dit pas ce qu'il contient. La première clé lue le dit.
   */
  readonly notice: string;
  readonly portfolios: readonly unknown[];
  readonly accounts: readonly unknown[];
  readonly positions: readonly unknown[];
  readonly optionContracts: readonly unknown[];
  readonly instruments: readonly unknown[];
  readonly snapshots: readonly unknown[];
};

const EXPORT_NOTICE =
  "Sauvegarde PortfolioLab. Ce fichier contient vos positions et votre historique " +
  "patrimonial en clair. Il ne contient aucun identifiant bancaire, aucun mot de passe " +
  "et aucune clé d'API. Conservez-le comme vous conserveriez un relevé.";

/*
 * Les cours ne sont **pas** exportés.
 *
 * Ce sont des données de marché, pas des données de l'utilisateur : elles
 * seront différentes au prochain chargement, et les inclure ferait croire que
 * la sauvegarde fige une valorisation. L'historique, lui, est exporté — chaque
 * point est une mesure qui a réellement eu lieu et qu'aucun recalcul ne
 * retrouverait.
 */
const EXPORT_QUERIES = {
  portfolios: "select id, name, base_currency, created_at from portfolios order by created_at",
  accounts: `select id, portfolio_id, name, institution_label, display_order, archived_at
             from accounts order by display_order, name`,
  positions: `select id, portfolio_id, account_id, instrument_id, quantity::text as quantity,
                     average_cost::text as average_cost, cost_currency, opened_on, notes
              from positions order by created_at`,
  optionContracts: `select oc.instrument_id, oc.underlying_instrument_id, oc.option_type::text as option_type,
                           oc.expiration_date, oc.strike::text as strike, oc.multiplier::text as multiplier
                    from option_contracts oc
                    where exists (select 1 from positions p where p.instrument_id = oc.instrument_id)`,
  instruments: `select distinct i.id, i.asset_type::text as asset_type, i.name, i.short_name,
                       i.primary_currency, i.exchange_mic
                from instruments i
                join positions p on p.instrument_id = i.id`,
  snapshots: `select snapshot_at, market_value_base::text as market_value_base,
                     cost_basis_base::text as cost_basis_base,
                     unrealized_pnl_base::text as unrealized_pnl_base,
                     day_pnl_base::text as day_pnl_base,
                     base_currency, calculation_version, components_hash
              from portfolio_snapshots order by snapshot_at`,
} as const;

/**
 * Construit la sauvegarde complète de l'utilisateur courant.
 *
 * Les décimales sortent en **chaînes**, jamais en nombres JSON : `JSON.parse`
 * convertirait `150.750000000000` en flottant et la quantité relue ne serait
 * plus tout à fait la quantité sauvegardée.
 */
export async function buildExport(now: Date): Promise<PortfolioExport | null> {
  const mode = resolveDataMode();
  const userId = await currentUserId(mode);
  if (userId === null) {
    return null;
  }

  return database().withUser(userId, async (client) => {
    const portfolios = await portfolioRepository.list(client);
    const baseCurrency = portfolios[0]?.base_currency ?? "CHF";

    const sections: Record<string, readonly unknown[]> = {};
    for (const [name, sql] of Object.entries(EXPORT_QUERIES)) {
      const { rows } = await client.query(sql);
      sections[name] = rows;
    }

    return {
      formatVersion: EXPORT_FORMAT_VERSION,
      exportedAt: now.toISOString(),
      baseCurrency,
      notice: EXPORT_NOTICE,
      portfolios: sections["portfolios"] ?? [],
      accounts: sections["accounts"] ?? [],
      positions: sections["positions"] ?? [],
      optionContracts: sections["optionContracts"] ?? [],
      instruments: sections["instruments"] ?? [],
      snapshots: sections["snapshots"] ?? [],
    };
  });
}

/** Tables portant des données propres à un utilisateur. */
export const USER_DATA_TABLES = [
  "portfolios",
  "accounts",
  "positions",
  "transactions",
  "portfolio_snapshots",
] as const;

export type DeletionReport = {
  readonly deletedPortfolios: number;
  /**
   * Lignes restantes par table après suppression.
   *
   * Vide quand tout a disparu. Une entrée subsistante n'est **pas** ignorée :
   * une suppression « réussie » qui laisse des données derrière elle est le
   * pire résultat possible pour cet écran.
   */
  readonly remaining: Readonly<Record<string, number>>;
};

/**
 * Supprime toutes les données de l'utilisateur courant.
 *
 * La suppression porte sur les portefeuilles ; le reste part en cascade, comme
 * le déclare le schéma. Compter ensuite les lignes restantes vérifie cette
 * cascade au lieu de la supposer — RLS garantit par ailleurs que le compte ne
 * voit que les lignes de l'utilisateur.
 */
export async function deleteAllUserData(): Promise<DeletionReport | null> {
  const mode = resolveDataMode();
  const userId = await currentUserId(mode);
  if (userId === null) {
    return null;
  }

  return database().withUser(userId, async (client) => {
    const deleted = await client.query("delete from portfolios");

    const remaining: Record<string, number> = {};
    for (const table of USER_DATA_TABLES) {
      const { rows } = await client.query<{ count: string }>(
        `select count(*)::text as count from ${table}`,
      );
      const count = Number(rows[0]?.count ?? "0");
      if (count > 0) {
        remaining[table] = count;
      }
    }

    return { deletedPortfolios: deleted.rowCount ?? 0, remaining };
  });
}
