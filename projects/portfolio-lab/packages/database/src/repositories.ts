import type { PoolClient } from "pg";

import type { AssetType, CurrencyCode, DecimalString } from "@portfolio-lab/domain";

import { translateDatabaseError } from "./errors.js";

/**
 * Repositories typés.
 *
 * Chaque méthode prend un `PoolClient` déjà placé dans le contexte utilisateur
 * par `Database.withUser`. Aucune requête ne filtre elle-même sur `user_id` en
 * plus de RLS : dupliquer le filtre donnerait l'illusion que RLS est facultative
 * et masquerait une politique manquante lors des tests.
 */

export type PortfolioRow = {
  readonly id: string;
  readonly user_id: string;
  readonly name: string;
  readonly base_currency: CurrencyCode;
  readonly created_at: Date;
  readonly updated_at: Date;
};

export type AccountRow = {
  readonly id: string;
  readonly user_id: string;
  readonly portfolio_id: string;
  readonly name: string;
  readonly institution_label: string | null;
  readonly display_order: number;
  readonly archived_at: Date | null;
};

export type PositionRow = {
  readonly id: string;
  readonly user_id: string;
  readonly portfolio_id: string;
  readonly account_id: string;
  readonly instrument_id: string;
  /** Renvoyée en chaîne : le pilote est configuré pour préserver `numeric`. */
  readonly quantity: DecimalString;
  readonly average_cost: DecimalString;
  readonly cost_currency: CurrencyCode;
  readonly opened_on: Date | null;
  readonly notes: string | null;
};

export type InstrumentRow = {
  readonly id: string;
  readonly asset_type: AssetType;
  readonly name: string;
  readonly short_name: string | null;
  readonly primary_currency: CurrencyCode;
  readonly exchange_mic: string | null;
  readonly is_active: boolean;
};

export const portfolioRepository = {
  async list(client: PoolClient): Promise<PortfolioRow[]> {
    const { rows } = await client.query<PortfolioRow>(
      "select * from portfolios order by created_at asc",
    );
    return rows;
  },

  async findById(client: PoolClient, id: string): Promise<PortfolioRow | null> {
    const { rows } = await client.query<PortfolioRow>("select * from portfolios where id = $1", [
      id,
    ]);
    return rows[0] ?? null;
  },

  async create(
    client: PoolClient,
    input: { userId: string; name: string; baseCurrency: CurrencyCode },
  ): Promise<PortfolioRow> {
    try {
      const { rows } = await client.query<PortfolioRow>(
        `insert into portfolios (user_id, name, base_currency)
         values ($1, $2, $3)
         returning *`,
        [input.userId, input.name, input.baseCurrency],
      );
      // RLS peut refuser silencieusement une insertion : `returning` ne renvoie
      // alors aucune ligne. On le traite comme une erreur explicite plutôt que
      // de laisser remonter un `undefined`.
      const created = rows[0];
      if (created === undefined) {
        throw new Error("Insertion du portefeuille refusée par les politiques d'accès");
      }
      return created;
    } catch (error) {
      translateDatabaseError(error, "Le portefeuille");
    }
  },

  async delete(client: PoolClient, id: string): Promise<boolean> {
    const result = await client.query("delete from portfolios where id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  },
};

export const accountRepository = {
  async listByPortfolio(client: PoolClient, portfolioId: string): Promise<AccountRow[]> {
    const { rows } = await client.query<AccountRow>(
      `select * from accounts
       where portfolio_id = $1 and archived_at is null
       order by display_order asc, name asc`,
      [portfolioId],
    );
    return rows;
  },

  async create(
    client: PoolClient,
    input: {
      userId: string;
      portfolioId: string;
      name: string;
      institutionLabel?: string | null;
      displayOrder?: number;
    },
  ): Promise<AccountRow> {
    try {
      const { rows } = await client.query<AccountRow>(
        `insert into accounts (user_id, portfolio_id, name, institution_label, display_order)
         values ($1, $2, $3, $4, $5)
         returning *`,
        [
          input.userId,
          input.portfolioId,
          input.name,
          input.institutionLabel ?? null,
          input.displayOrder ?? 0,
        ],
      );
      const created = rows[0];
      if (created === undefined) {
        throw new Error("Insertion du compte refusée par les politiques d'accès");
      }
      return created;
    } catch (error) {
      translateDatabaseError(error, "Le compte");
    }
  },

  /**
   * Archive un compte au lieu de le supprimer.
   *
   * Une suppression emporterait les positions en cascade ; l'archivage préserve
   * l'historique tout en retirant le compte des listes actives.
   */
  async archive(client: PoolClient, id: string): Promise<boolean> {
    const result = await client.query(
      "update accounts set archived_at = now() where id = $1 and archived_at is null",
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  },
};

export const positionRepository = {
  async listByPortfolio(client: PoolClient, portfolioId: string): Promise<PositionRow[]> {
    const { rows } = await client.query<PositionRow>(
      "select * from positions where portfolio_id = $1 order by created_at asc",
      [portfolioId],
    );
    return rows;
  },

  async create(
    client: PoolClient,
    input: {
      userId: string;
      portfolioId: string;
      accountId: string;
      instrumentId: string;
      quantity: DecimalString;
      averageCost: DecimalString;
      costCurrency: CurrencyCode;
      openedOn?: string | null;
      notes?: string | null;
    },
  ): Promise<PositionRow> {
    try {
      const { rows } = await client.query<PositionRow>(
        `insert into positions
           (user_id, portfolio_id, account_id, instrument_id,
            quantity, average_cost, cost_currency, opened_on, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning *`,
        [
          input.userId,
          input.portfolioId,
          input.accountId,
          input.instrumentId,
          input.quantity,
          input.averageCost,
          input.costCurrency,
          input.openedOn ?? null,
          input.notes ?? null,
        ],
      );
      const created = rows[0];
      if (created === undefined) {
        throw new Error("Insertion de la position refusée par les politiques d'accès");
      }
      return created;
    } catch (error) {
      translateDatabaseError(error, "La position");
    }
  },

  async delete(client: PoolClient, id: string): Promise<boolean> {
    const result = await client.query("delete from positions where id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  },
};

export const instrumentRepository = {
  async findById(client: PoolClient, id: string): Promise<InstrumentRow | null> {
    const { rows } = await client.query<InstrumentRow>("select * from instruments where id = $1", [
      id,
    ]);
    return rows[0] ?? null;
  },

  /** Résout un instrument par identifiant exact — ISIN, ticker, symbole. */
  async findByIdentifier(
    client: PoolClient,
    identifierType: string,
    identifierValue: string,
  ): Promise<InstrumentRow[]> {
    const { rows } = await client.query<InstrumentRow>(
      `select i.*
       from instruments i
       join instrument_identifiers ii on ii.instrument_id = i.id
       where ii.identifier_type = $1::identifier_type and ii.identifier_value = $2
       order by i.name asc`,
      [identifierType, identifierValue],
    );
    return rows;
  },
};
