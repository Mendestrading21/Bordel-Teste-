import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  ALICE,
  BOB,
  hasTestDatabase,
  setupTestDatabase,
  truncateUserTables,
  type TestDatabase,
} from "../helpers/database.js";

/** Tables portant des données propres à un utilisateur. */
const USER_DATA_TABLES = [
  "portfolios",
  "accounts",
  "positions",
  "transactions",
  "portfolio_snapshots",
] as const;

/**
 * Suppression complète des données utilisateur.
 *
 * `§11` de la commande exige une « suppression complète des données
 * utilisateur ». L'application supprime les portefeuilles et compte sur la
 * cascade déclarée par le schéma pour le reste.
 *
 * Cette suite vérifie la cascade au lieu de la supposer. Une suppression qui se
 * déclarerait réussie en laissant des positions derrière elle serait le pire
 * résultat possible de cet écran, et aucun test d'interface ne le verrait.
 */
describe.skipIf(!hasTestDatabase)("suppression des données utilisateur", () => {
  let db: TestDatabase;

  const ALICE_PORTFOLIO = "aaaaaaaa-0000-4000-8000-000000000201";
  const ALICE_ACCOUNT = "aaaaaaaa-0000-4000-8000-000000000202";
  const BOB_PORTFOLIO = "bbbbbbbb-0000-4000-8000-000000000201";
  const BOB_ACCOUNT = "bbbbbbbb-0000-4000-8000-000000000202";
  const INSTRUMENT = "cccccccc-0000-4000-8000-000000000001";

  beforeAll(async () => {
    db = await setupTestDatabase({ name: "deletion" });
  });

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await truncateUserTables(db.pool);

    await db.asOwner(async (client) => {
      await client.query(
        `insert into instruments (id, asset_type, name, primary_currency)
         values ($1, 'STOCK', 'Démo Suppression SA', 'CHF')
         on conflict (id) do nothing`,
        [INSTRUMENT],
      );

      for (const [user, portfolio, account] of [
        [ALICE, ALICE_PORTFOLIO, ALICE_ACCOUNT],
        [BOB, BOB_PORTFOLIO, BOB_ACCOUNT],
      ] as const) {
        await client.query("insert into portfolios (id, user_id, name) values ($1, $2, $3)", [
          portfolio,
          user,
          "Portefeuille",
        ]);
        await client.query(
          "insert into accounts (id, user_id, portfolio_id, name) values ($1, $2, $3, $4)",
          [account, user, portfolio, "Compte"],
        );
        const { rows: created } = await client.query<{ id: string }>(
          `insert into positions
             (user_id, portfolio_id, account_id, instrument_id, quantity, average_cost, cost_currency)
           values ($1, $2, $3, $4, 10, 100, 'CHF')
           returning id`,
          [user, portfolio, account, INSTRUMENT],
        );

        /*
         * Une transaction est insérée volontairement : elle est le maillon le
         * plus profond de la cascade — portefeuille → position → transaction —
         * et donc celui qu'une cascade incomplète laisserait derrière elle.
         */
        await client.query(
          `insert into transactions
             (user_id, position_id, transaction_type, trade_date, quantity, unit_price, currency)
           values ($1, $2, 'BUY', '2026-05-04', 10, 100, 'CHF')`,
          [user, created[0]?.id],
        );
        await client.query(
          `insert into portfolio_snapshots
             (user_id, portfolio_id, snapshot_at, market_value_base, cost_basis_base,
              unrealized_pnl_base, base_currency, calculation_version)
           values ($1, $2, '2026-05-04T17:35:00Z', 1200, 1000, 200, 'CHF', '1.0.0')`,
          [user, portfolio],
        );
      }
    });
  });

  async function countAll(user: string): Promise<Record<string, number>> {
    return db.asUser(user, async (client) => {
      const counts: Record<string, number> = {};
      for (const table of USER_DATA_TABLES) {
        const { rows } = await client.query<{ count: string }>(
          `select count(*)::text as count from ${table}`,
        );
        counts[table] = Number(rows[0]?.count ?? "0");
      }
      return counts;
    });
  }

  it("supprimer les portefeuilles efface tout le reste en cascade", async () => {
    const before = await countAll(ALICE);
    for (const table of USER_DATA_TABLES) {
      expect(before[table], `${table} devrait contenir une ligne avant suppression`).toBe(1);
    }

    await db.asUser(ALICE, (client) => client.query("delete from portfolios"));

    const after = await countAll(ALICE);
    for (const table of USER_DATA_TABLES) {
      expect(after[table], `${table} contient encore des lignes après suppression`).toBe(0);
    }
  });

  it("la suppression d'Alice ne touche pas les données de Bob", async () => {
    await db.asUser(ALICE, (client) => client.query("delete from portfolios"));

    const bob = await countAll(BOB);
    for (const table of USER_DATA_TABLES) {
      expect(bob[table], `${table} de Bob affecté par la suppression d'Alice`).toBe(1);
    }
  });

  it("Bob ne peut pas supprimer les données d'Alice", async () => {
    // RLS rend les lignes d'Alice invisibles : la suppression ne trouve rien.
    const result = await db.asUser(BOB, (client) =>
      client.query("delete from portfolios where id = $1", [ALICE_PORTFOLIO]),
    );
    expect(result.rowCount).toBe(0);

    const alice = await countAll(ALICE);
    expect(alice["portfolios"]).toBe(1);
  });

  it("un accès anonyme ne supprime rien", async () => {
    await db.asAnonymous((client) => client.query("delete from portfolios"));

    const alice = await countAll(ALICE);
    expect(alice["portfolios"]).toBe(1);
  });

  it("l'instrument de référence survit : ce n'est pas une donnée personnelle", async () => {
    await db.asUser(ALICE, (client) => client.query("delete from portfolios"));

    const { rows } = await db.asOwner((client) =>
      client.query("select id from instruments where id = $1", [INSTRUMENT]),
    );
    /*
     * Les instruments sont un référentiel de marché partagé, pas la propriété
     * d'un utilisateur. Les effacer avec ses positions casserait le portefeuille
     * de tout autre utilisateur détenant le même titre.
     */
    expect(rows).toHaveLength(1);
  });

  it("supprimer deux fois ne produit pas d'erreur", async () => {
    await db.asUser(ALICE, (client) => client.query("delete from portfolios"));
    const second = await db.asUser(ALICE, (client) => client.query("delete from portfolios"));

    expect(second.rowCount).toBe(0);
  });
});
