import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hasTestDatabase, setupTestDatabase, type TestDatabase } from "../helpers/database.js";

/**
 * Couverture RLS au niveau du schéma.
 *
 * Les tests de `rls.test.ts` vérifient le comportement des politiques
 * existantes. Ceux-ci vérifient qu'aucune table n'en est dépourvue — la
 * régression la plus probable n'étant pas une politique cassée, mais une
 * **nouvelle table ajoutée sans politique** dans un lot ultérieur.
 */
describe.skipIf(!hasTestDatabase)("couverture RLS du schéma", () => {
  let db: TestDatabase;

  /** Tables portant de la donnée propre à un utilisateur. */
  const USER_TABLES = [
    "portfolios",
    "accounts",
    "positions",
    "transactions",
    "portfolio_snapshots",
  ] as const;

  /** Référentiel partagé : lecture authentifiée, écriture serveur uniquement. */
  const SHARED_TABLES = [
    "instruments",
    "instrument_identifiers",
    "option_contracts",
    "provider_mappings",
    "current_quotes",
    "daily_price_history",
    "fx_rates",
    "fund_details",
    "fund_nav_history",
  ] as const;

  /** Tables d'exploitation, invisibles au client. */
  const SERVER_ONLY_TABLES = ["sync_runs"] as const;

  /** Tables techniques, hors périmètre RLS. */
  const EXEMPT_TABLES = new Set(["schema_migrations"]);

  beforeAll(async () => {
    db = await setupTestDatabase({ name: "coverage" });
  });

  afterAll(async () => {
    await db?.close();
  });

  async function tableFlags(): Promise<
    Map<string, { rlsEnabled: boolean; rlsForced: boolean; policies: number }>
  > {
    return db.asOwner(async (client) => {
      const { rows } = await client.query<{
        table_name: string;
        rls_enabled: boolean;
        rls_forced: boolean;
        policy_count: string;
      }>(
        `select c.relname as table_name,
                c.relrowsecurity as rls_enabled,
                c.relforcerowsecurity as rls_forced,
                (select count(*) from pg_policy p where p.polrelid = c.oid)::text as policy_count
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'`,
      );
      return new Map(
        rows.map((row) => [
          row.table_name,
          {
            rlsEnabled: row.rls_enabled,
            rlsForced: row.rls_forced,
            policies: Number(row.policy_count),
          },
        ]),
      );
    });
  }

  it("n'oublie aucune table : toute table publique est classée ou exemptée", async () => {
    const flags = await tableFlags();
    const classified = new Set<string>([
      ...USER_TABLES,
      ...SHARED_TABLES,
      ...SERVER_ONLY_TABLES,
      ...EXEMPT_TABLES,
    ]);
    const unclassified = [...flags.keys()].filter((name) => !classified.has(name));
    expect(
      unclassified,
      "Une table a été ajoutée sans décider de sa politique RLS. " +
        "L'ajouter à USER_TABLES, SHARED_TABLES, SERVER_ONLY_TABLES ou EXEMPT_TABLES.",
    ).toEqual([]);
  });

  it.each([...USER_TABLES, ...SHARED_TABLES, ...SERVER_ONLY_TABLES])(
    "%s a RLS activée",
    async (table) => {
      const flags = await tableFlags();
      expect(flags.get(table)?.rlsEnabled, `RLS désactivée sur ${table}`).toBe(true);
    },
  );

  it.each([...USER_TABLES, ...SHARED_TABLES, ...SERVER_ONLY_TABLES])(
    "%s a RLS forcée, y compris pour le propriétaire des tables",
    async (table) => {
      // Sans `force`, le rôle qui possède les tables — celui sous lequel
      // tournent les migrations — échappe à toutes les politiques.
      const flags = await tableFlags();
      expect(flags.get(table)?.rlsForced, `force row level security absent sur ${table}`).toBe(
        true,
      );
    },
  );

  it.each(USER_TABLES)("%s a une politique pour chacune des quatre commandes", async (table) => {
    const commands = await db.asOwner(async (client) => {
      const { rows } = await client.query<{ cmd: string }>(
        `select p.polcmd::text as cmd
         from pg_policy p join pg_class c on c.oid = p.polrelid
         where c.relname = $1`,
        [table],
      );
      return rows.map((row) => row.cmd).sort();
    });
    // r = select, a = insert, w = update, d = delete
    expect(commands).toEqual(["a", "d", "r", "w"]);
  });

  it.each(SHARED_TABLES)("%s n'expose qu'une politique de lecture", async (table) => {
    const commands = await db.asOwner(async (client) => {
      const { rows } = await client.query<{ cmd: string }>(
        `select p.polcmd::text as cmd
         from pg_policy p join pg_class c on c.oid = p.polrelid
         where c.relname = $1`,
        [table],
      );
      return rows.map((row) => row.cmd);
    });
    // Aucune politique d'écriture : l'ingestion passe par service_role, qui
    // contourne RLS. Le navigateur ne peut donc jamais inscrire un cours.
    expect(commands).toEqual(["r"]);
  });

  it.each(SERVER_ONLY_TABLES)("%s n'a aucune politique, donc reste invisible", async (table) => {
    const flags = await tableFlags();
    expect(flags.get(table)?.policies).toBe(0);
  });

  it("aucune politique utilisateur ne s'appuie sur une condition permissive constante", async () => {
    const permissive = await db.asOwner(async (client) => {
      const { rows } = await client.query<{ table_name: string; policy: string; expr: string }>(
        `select c.relname as table_name,
                p.polname as policy,
                coalesce(pg_get_expr(p.polqual, p.polrelid), '') as expr
         from pg_policy p join pg_class c on c.oid = p.polrelid
         where c.relname = any($1::text[])`,
        [[...USER_TABLES]],
      );
      // Une politique `using (true)` annulerait complètement l'isolation.
      return rows.filter((row) => row.expr.trim() === "true");
    });
    expect(permissive).toEqual([]);
  });
});
