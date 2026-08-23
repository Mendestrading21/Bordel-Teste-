import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  ALICE,
  BOB,
  hasTestDatabase,
  setupTestDatabase,
  truncateUserTables,
  type TestDatabase,
} from "../helpers/database.js";

/**
 * Isolation des données par Row Level Security.
 *
 * C'est le critère d'acceptation du Lot 02 : « un utilisateur authentifié voit
 * uniquement ses données ; un accès anonyme échoue ». Chaque assertion est
 * jouée par PostgreSQL lui-même, avec un rôle applicatif distinct du
 * propriétaire des tables.
 */
describe.skipIf(!hasTestDatabase)("Row Level Security", () => {
  let db: TestDatabase;

  const ALICE_PORTFOLIO = "aaaaaaaa-0000-4000-8000-000000000001";
  const BOB_PORTFOLIO = "bbbbbbbb-0000-4000-8000-000000000001";
  const ALICE_ACCOUNT = "aaaaaaaa-0000-4000-8000-000000000002";
  const BOB_ACCOUNT = "bbbbbbbb-0000-4000-8000-000000000002";

  beforeAll(async () => {
    db = await setupTestDatabase({ name: "rls" });
  });

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await truncateUserTables(db.pool);
    await db.asOwner(async (client) => {
      await client.query(
        `insert into portfolios (id, user_id, name) values ($1, $2, $3), ($4, $5, $6)`,
        [ALICE_PORTFOLIO, ALICE, "Alice", BOB_PORTFOLIO, BOB, "Bob"],
      );
      await client.query(
        `insert into accounts (id, user_id, portfolio_id, name)
         values ($1, $2, $3, $4), ($5, $6, $7, $8)`,
        [
          ALICE_ACCOUNT,
          ALICE,
          ALICE_PORTFOLIO,
          "Compte Alice",
          BOB_ACCOUNT,
          BOB,
          BOB_PORTFOLIO,
          "Compte Bob",
        ],
      );
    });
  });

  describe("accès anonyme", () => {
    it("ne voit aucun portefeuille", async () => {
      const rows = await db.asAnonymous(async (client) => {
        const result = await client.query("select id from portfolios");
        return result.rows;
      });
      expect(rows).toHaveLength(0);
    });

    it("ne voit aucun compte ni aucune position", async () => {
      const counts = await db.asAnonymous(async (client) => {
        const accounts = await client.query("select id from accounts");
        const positions = await client.query("select id from positions");
        return { accounts: accounts.rowCount, positions: positions.rowCount };
      });
      expect(counts).toEqual({ accounts: 0, positions: 0 });
    });

    it("ne peut pas insérer de portefeuille", async () => {
      await expect(
        db.asAnonymous(async (client) => {
          await client.query("insert into portfolios (user_id, name) values ($1, $2)", [
            ALICE,
            "Injecté",
          ]);
        }),
      ).rejects.toThrow();
    });

    it("ne peut pas lire le référentiel de marché", async () => {
      const rows = await db.asAnonymous(async (client) => {
        const result = await client.query("select id from instruments");
        return result.rows;
      });
      expect(rows).toHaveLength(0);
    });
  });

  describe("utilisateur authentifié", () => {
    it("ne voit que ses propres portefeuilles", async () => {
      const rows = await db.asUser(ALICE, async (client) => {
        const result = await client.query<{ id: string; name: string }>(
          "select id, name from portfolios",
        );
        return result.rows;
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe("Alice");
    });

    it("ne voit pas le portefeuille d'un tiers même par identifiant direct", async () => {
      const rows = await db.asUser(ALICE, async (client) => {
        const result = await client.query("select id from portfolios where id = $1", [
          BOB_PORTFOLIO,
        ]);
        return result.rows;
      });
      expect(rows).toHaveLength(0);
    });

    it("ne peut pas insérer une ligne au nom d'un tiers", async () => {
      await expect(
        db.asUser(ALICE, async (client) => {
          await client.query("insert into portfolios (user_id, name) values ($1, $2)", [
            BOB,
            "Usurpé",
          ]);
        }),
      ).rejects.toThrow(/row-level security/i);
    });

    it("ne peut pas modifier le portefeuille d'un tiers", async () => {
      const affected = await db.asUser(ALICE, async (client) => {
        const result = await client.query("update portfolios set name = $1 where id = $2", [
          "Détourné",
          BOB_PORTFOLIO,
        ]);
        return result.rowCount;
      });
      // RLS ne lève pas d'erreur sur un UPDATE : elle rend simplement la ligne
      // invisible, donc aucune n'est modifiée. Vérifier le compte est le seul
      // moyen de le prouver.
      expect(affected).toBe(0);

      const unchanged = await db.asOwner(async (client) => {
        const result = await client.query<{ name: string }>(
          "select name from portfolios where id = $1",
          [BOB_PORTFOLIO],
        );
        return result.rows[0]?.name;
      });
      expect(unchanged).toBe("Bob");
    });

    it("ne peut pas supprimer le portefeuille d'un tiers", async () => {
      const affected = await db.asUser(ALICE, async (client) => {
        const result = await client.query("delete from portfolios where id = $1", [BOB_PORTFOLIO]);
        return result.rowCount;
      });
      expect(affected).toBe(0);
    });

    it("ne peut pas se réattribuer sa propre ligne à un tiers", async () => {
      await expect(
        db.asUser(ALICE, async (client) => {
          await client.query("update portfolios set user_id = $1 where id = $2", [
            BOB,
            ALICE_PORTFOLIO,
          ]);
        }),
      ).rejects.toThrow(/row-level security/i);
    });

    it("peut lire le référentiel de marché partagé", async () => {
      await db.asOwner(async (client) => {
        await client.query(
          `insert into instruments (id, asset_type, name, primary_currency)
           values ('c0000000-0000-4000-8000-000000000001', 'STOCK', 'Test', 'CHF')
           on conflict do nothing`,
        );
      });
      const rows = await db.asUser(ALICE, async (client) => {
        const result = await client.query("select id from instruments");
        return result.rows;
      });
      expect(rows.length).toBeGreaterThan(0);
    });

    it("ne peut pas écrire dans le référentiel de marché", async () => {
      await expect(
        db.asUser(ALICE, async (client) => {
          await client.query(
            `insert into instruments (asset_type, name, primary_currency)
             values ('STOCK', 'Instrument injecté', 'CHF')`,
          );
        }),
      ).rejects.toThrow();
    });

    it("ne peut pas lire le journal d'exploitation", async () => {
      await db.asOwner(async (client) => {
        await client.query(
          "insert into sync_runs (provider, job_type, error_summary) values ($1, $2, $3)",
          ["mock", "nav", "erreur interne"],
        );
      });
      const rows = await db.asUser(ALICE, async (client) => {
        const result = await client.query("select id from sync_runs");
        return result.rows;
      });
      expect(rows).toHaveLength(0);
    });
  });

  describe("cohérence hiérarchique", () => {
    it("refuse de rattacher un compte au portefeuille d'un tiers", async () => {
      await expect(
        db.asUser(ALICE, async (client) => {
          await client.query(
            "insert into accounts (user_id, portfolio_id, name) values ($1, $2, $3)",
            [ALICE, BOB_PORTFOLIO, "Compte détourné"],
          );
        }),
      ).rejects.toThrow();
    });

    it("refuse une position dont le compte appartient à un tiers", async () => {
      const instrumentId = await db.asOwner(async (client) => {
        const result = await client.query<{ id: string }>(
          `insert into instruments (asset_type, name, primary_currency)
           values ('STOCK', 'Instrument test', 'CHF') returning id`,
        );
        return result.rows[0]?.id ?? "";
      });

      await expect(
        db.asUser(ALICE, async (client) => {
          await client.query(
            `insert into positions
               (user_id, portfolio_id, account_id, instrument_id, quantity, average_cost, cost_currency)
             values ($1, $2, $3, $4, 10, 100, 'CHF')`,
            [ALICE, ALICE_PORTFOLIO, BOB_ACCOUNT, instrumentId],
          );
        }),
      ).rejects.toThrow();
    });

    it("accepte une position entièrement cohérente", async () => {
      const instrumentId = await db.asOwner(async (client) => {
        const result = await client.query<{ id: string }>(
          `insert into instruments (asset_type, name, primary_currency)
           values ('STOCK', 'Instrument cohérent', 'CHF') returning id`,
        );
        return result.rows[0]?.id ?? "";
      });

      const created = await db.asUser(ALICE, async (client) => {
        const result = await client.query<{ id: string; quantity: string }>(
          `insert into positions
             (user_id, portfolio_id, account_id, instrument_id, quantity, average_cost, cost_currency)
           values ($1, $2, $3, $4, 10, 100.5, 'CHF')
           returning id, quantity`,
          [ALICE, ALICE_PORTFOLIO, ALICE_ACCOUNT, instrumentId],
        );
        return result.rows[0];
      });

      expect(created?.id).toBeTruthy();
      // La quantité revient en chaîne : la précision numeric est préservée.
      expect(typeof created?.quantity).toBe("string");
    });
  });
});
