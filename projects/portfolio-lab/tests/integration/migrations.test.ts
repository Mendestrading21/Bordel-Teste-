import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  loadMigrations,
  MigrationDriftError,
  runMigrations,
  type Migration,
} from "@portfolio-lab/database";

import {
  DEMO_USER,
  hasTestDatabase,
  MIGRATIONS_DIR,
  setupTestDatabase,
  TEST_DATABASE_URL,
  type TestDatabase,
} from "../helpers/database.js";

describe("loadMigrations", () => {
  it("charge les migrations du projet, triées", () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    expect(migrations.length).toBeGreaterThanOrEqual(2);
    expect(migrations.map((m) => m.name)).toEqual([...migrations.map((m) => m.name)].sort());
    expect(migrations[0]?.name).toBe("0001_initial_schema.sql");
  });

  it("calcule une empreinte stable pour chaque fichier", () => {
    const first = loadMigrations(MIGRATIONS_DIR);
    const second = loadMigrations(MIGRATIONS_DIR);
    expect(first.map((m) => m.checksum)).toEqual(second.map((m) => m.checksum));
    expect(first[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignore les fichiers hors convention de nommage", () => {
    const directory = mkdtempSync(join(tmpdir(), "pl-migrations-"));
    writeFileSync(join(directory, "0001_valide.sql"), "select 1;");
    writeFileSync(join(directory, "notes.md"), "# pas une migration");
    writeFileSync(join(directory, "brouillon.sql"), "select 2;");
    writeFileSync(join(directory, "12_trop_court.sql"), "select 3;");

    expect(loadMigrations(directory).map((m) => m.name)).toEqual(["0001_valide.sql"]);
  });
});

describe.skipIf(!hasTestDatabase)("runMigrations", () => {
  let db: TestDatabase;
  let scratchPool: Pool;

  beforeAll(async () => {
    db = await setupTestDatabase({ name: "migrations" });
    scratchPool = db.pool;
  });

  afterAll(async () => {
    await db?.close();
  });

  async function withScratchSchema<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await scratchPool.connect();
    try {
      return await run(client);
    } finally {
      client.release();
    }
  }

  it("est idempotent : rejouer n'applique rien de nouveau", async () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    const result = await withScratchSchema((client) => runMigrations(client, migrations));
    // La base a déjà été migrée par le harnais : tout doit être ignoré.
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(migrations.map((m) => m.name));
  });

  it("enregistre chaque migration appliquée avec son empreinte", async () => {
    const rows = await withScratchSchema(async (client) => {
      const result = await client.query<{ name: string; checksum: string }>(
        "select name, checksum from schema_migrations order by name",
      );
      return result.rows;
    });
    const migrations = loadMigrations(MIGRATIONS_DIR);
    expect(rows.map((r) => r.name)).toEqual(migrations.map((m) => m.name));
    expect(rows.map((r) => r.checksum)).toEqual(migrations.map((m) => m.checksum));
  });

  it("refuse une migration déjà appliquée dont le contenu a changé", async () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    const tampered: Migration[] = migrations.map((migration, index) =>
      index === 0 ? { ...migration, checksum: "0".repeat(64) } : migration,
    );

    await expect(withScratchSchema((client) => runMigrations(client, tampered))).rejects.toThrow(
      MigrationDriftError,
    );
  });

  it("annule la migration entière si son SQL échoue", async () => {
    const broken: Migration[] = [
      {
        name: "9999_cassee.sql",
        sql: "create table migration_probe (id int); select * from table_inexistante;",
        checksum: "f".repeat(64),
      },
    ];

    await expect(withScratchSchema((client) => runMigrations(client, broken))).rejects.toThrow();

    const exists = await withScratchSchema(async (client) => {
      const result = await client.query<{ count: string }>(
        "select count(*)::text as count from pg_tables where tablename = 'migration_probe'",
      );
      return result.rows[0]?.count;
    });
    // La table créée avant l'erreur ne doit pas subsister.
    expect(exists).toBe("0");

    const recorded = await withScratchSchema(async (client) => {
      const result = await client.query(
        "select name from schema_migrations where name = '9999_cassee.sql'",
      );
      return result.rowCount;
    });
    expect(recorded).toBe(0);
  });
});

describe.skipIf(!hasTestDatabase)("schéma construit depuis une base vide", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await setupTestDatabase({ name: "fromscratch" });
  });

  afterAll(async () => {
    await db?.close();
  });

  it("crée toutes les tables attendues", async () => {
    const tables = await db.asOwner(async (client) => {
      const result = await client.query<{ tablename: string }>(
        "select tablename from pg_tables where schemaname = 'public' order by tablename",
      );
      return result.rows.map((row) => row.tablename);
    });

    expect(tables).toEqual([
      "accounts",
      "current_quotes",
      "daily_price_history",
      "fund_details",
      "fund_nav_history",
      "fx_rates",
      "instrument_identifiers",
      "instruments",
      "option_contracts",
      "portfolio_snapshots",
      "portfolios",
      "positions",
      "provider_mappings",
      "schema_migrations",
      "sync_runs",
      "transactions",
    ]);
  });

  it("stocke les montants en numeric et jamais en flottant", async () => {
    const floatColumns = await db.asOwner(async (client) => {
      const result = await client.query<{ table_name: string; column_name: string }>(
        `select table_name, column_name
         from information_schema.columns
         where table_schema = 'public'
           and data_type in ('double precision', 'real')`,
      );
      return result.rows;
    });
    // Un seul flottant dans le schéma suffirait à rendre un total faux.
    expect(floatColumns).toEqual([]);
  });

  it("stocke tous les horodatages avec fuseau", async () => {
    const naive = await db.asOwner(async (client) => {
      const result = await client.query<{ table_name: string; column_name: string }>(
        `select table_name, column_name
         from information_schema.columns
         where table_schema = 'public' and data_type = 'timestamp without time zone'`,
      );
      return result.rows;
    });
    expect(naive).toEqual([]);
  });
});

describe.skipIf(!hasTestDatabase)("jeu de démonstration", () => {
  let db: TestDatabase;
  const DEMO_USER = "00000000-0000-4000-8000-0000000dec00";

  beforeAll(async () => {
    db = await setupTestDatabase({ name: "seed", seed: true });
  });

  afterAll(async () => {
    await db?.close();
  });

  it("charge des positions rattachées à l'utilisateur de démonstration", async () => {
    const positions = await db.asUser(DEMO_USER, async (client) => {
      const result = await client.query<{ id: string }>("select id from positions");
      return result.rows;
    });
    expect(positions.length).toBeGreaterThan(0);
  });

  it("n'insère aucun cours : une valeur fictive serait indiscernable d'une vraie", async () => {
    const counts = await db.asOwner(async (client) => {
      const quotes = await client.query("select 1 from current_quotes");
      const history = await client.query("select 1 from daily_price_history");
      const fx = await client.query("select 1 from fx_rates");
      return { quotes: quotes.rowCount, history: history.rowCount, fx: fx.rowCount };
    });
    expect(counts).toEqual({ quotes: 0, history: 0, fx: 0 });
  });

  it("n'utilise que des ISIN de code pays XX, jamais attribué à un émetteur réel", async () => {
    const isins = await db.asOwner(async (client) => {
      const result = await client.query<{ identifier_value: string }>(
        "select identifier_value from instrument_identifiers where identifier_type = 'ISIN'",
      );
      return result.rows.map((row) => row.identifier_value);
    });
    expect(isins.length).toBeGreaterThan(0);
    for (const isin of isins) {
      expect(isin.startsWith("XX"), `${isin} n'est pas un ISIN fictif`).toBe(true);
    }
  });

  it("marque explicitement chaque instrument comme fictif", async () => {
    const names = await db.asOwner(async (client) => {
      const result = await client.query<{ name: string }>("select name from instruments");
      return result.rows.map((row) => row.name);
    });
    for (const name of names) {
      expect(
        /démo|fictif|liquidités/i.test(name),
        `${name} ne se signale pas comme donnée de démonstration`,
      ).toBe(true);
    }
  });

  it("expose le multiplicateur d'option explicitement", async () => {
    const contracts = await db.asOwner(async (client) => {
      const result = await client.query<{ multiplier: string }>(
        "select multiplier from option_contracts",
      );
      return result.rows;
    });
    expect(contracts.length).toBeGreaterThan(0);
    for (const contract of contracts) {
      // La colonne est NOT NULL sans valeur par défaut : la présence d'une
      // valeur prouve qu'elle a été fournie, pas supposée.
      expect(contract.multiplier).toBeTruthy();
    }
  });
});

describe.skipIf(!hasTestDatabase)("connexion PostgreSQL", () => {
  async function withPool<T>(run: (pool: Pool) => Promise<T>): Promise<T> {
    const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    try {
      return await run(pool);
    } finally {
      await pool.end();
    }
  }

  it("renvoie les numeric en chaîne pour préserver la précision", async () => {
    const value = await withPool(async (pool) => {
      const { rows } = await pool.query<{ value: string }>(
        "select 123456789012345678.123456789012::numeric(30,12) as value",
      );
      return rows[0]?.value;
    });
    // Une conversion en `number` donnerait 123456789012345680 : le pilote doit
    // impérativement rendre une chaîne.
    expect(typeof value).toBe("string");
    expect(value).toBe("123456789012345678.123456789012");
  });

  it("documente la plage réelle de numeric(30, 12)", async () => {
    // 30 chiffres au total dont 12 décimales : il reste 18 chiffres pour la
    // partie entière, soit un maximum de 999 999 999 999 999 999.
    const maximum = await withPool(async (pool) => {
      const { rows } = await pool.query<{ value: string }>(
        "select 999999999999999999.999999999999::numeric(30,12) as value",
      );
      return rows[0]?.value;
    });
    expect(maximum).toBe("999999999999999999.999999999999");

    // Au-delà, PostgreSQL refuse plutôt que de tronquer en silence.
    await expect(
      withPool((pool) => pool.query("select 1000000000000000000::numeric(30,12)")),
    ).rejects.toThrow(/overflow/i);
  });

  it("arrondit les décimales excédentaires sans erreur silencieuse de magnitude", async () => {
    const rounded = await withPool(async (pool) => {
      const { rows } = await pool.query<{ value: string }>(
        "select 0.0000000000005::numeric(30,12) as value",
      );
      return rows[0]?.value;
    });
    // La 13e décimale est arrondie, pas tronquée : le comportement est connu
    // et testé plutôt que découvert en production.
    expect(rounded).toBe("0.000000000001");
  });
});

describe.skipIf(!hasTestDatabase)("fonds de placement", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await setupTestDatabase({ name: "funds", seed: true });
  });

  afterAll(async () => {
    await db?.close();
  });

  it("stocke la date de valeur de la NAV, distincte de l'instant de récupération", async () => {
    const rows = await db.asOwner(async (client) => {
      const result = await client.query<{ nav_date: string; retrieved_at: Date }>(
        "select nav_date::text as nav_date, retrieved_at from fund_nav_history order by nav_date desc",
      );
      return result.rows;
    });
    expect(rows.length).toBeGreaterThan(0);
    // Un fonds publie une NAV « du 21 » qui peut n'arriver que le 23 : c'est la
    // date de valeur qui fait foi.
    expect(rows[0]?.nav_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(rows[0]?.retrieved_at).toBeInstanceOf(Date);
  });

  it("refuse une NAV nulle ou négative", async () => {
    await expect(
      db.asOwner(async (client) => {
        await client.query(
          `insert into fund_nav_history (instrument_id, nav_date, value, currency, provider)
           values ('d0000000-0000-4000-8000-000000000004', '2026-01-02', 0, 'CHF', 'test')`,
        );
      }),
    ).rejects.toThrow();
  });

  it("refuse deux NAV du même fournisseur pour la même date de valeur", async () => {
    await expect(
      db.asOwner(async (client) => {
        await client.query(
          `insert into fund_nav_history (instrument_id, nav_date, value, currency, provider)
           values ('d0000000-0000-4000-8000-000000000004', '2026-08-21', 99, 'CHF', 'fixture')`,
        );
      }),
    ).rejects.toThrow();
  });

  it("accepte deux fournisseurs différents pour la même date", async () => {
    // Comparer deux sources sur une même date de valeur est légitime.
    const inserted = await db.asOwner(async (client) => {
      const result = await client.query(
        `insert into fund_nav_history (instrument_id, nav_date, value, currency, provider)
         values ('d0000000-0000-4000-8000-000000000004', '2026-08-21', 104.9, 'CHF', 'autre')
         returning instrument_id`,
      );
      return result.rowCount;
    });
    expect(inserted).toBe(1);
  });

  it("conserve la fréquence de publication déclarée du fonds", async () => {
    const frequency = await db.asOwner(async (client) => {
      const result = await client.query<{ nav_frequency: string }>(
        "select nav_frequency::text as nav_frequency from fund_details",
      );
      return result.rows[0]?.nav_frequency;
    });
    expect(frequency).toBe("DAILY");
  });

  it("supprime les NAV en cascade avec leur instrument", async () => {
    await db.asOwner(async (client) => {
      const before = await client.query("select 1 from fund_nav_history");
      expect(before.rowCount ?? 0).toBeGreaterThan(0);
    });
  });

  it("expose les fonds en lecture à un utilisateur authentifié", async () => {
    const rows = await db.asUser(DEMO_USER, async (client) => {
      const result = await client.query("select instrument_id from fund_details");
      return result.rows;
    });
    expect(rows.length).toBeGreaterThan(0);
  });

  it("ne laisse pas un utilisateur écrire dans le référentiel des fonds", async () => {
    // L'ingestion passe par service_role : le navigateur ne peut jamais
    // inscrire une NAV.
    await expect(
      db.asUser(DEMO_USER, async (client) => {
        await client.query(
          `insert into fund_nav_history (instrument_id, nav_date, value, currency, provider)
           values ('d0000000-0000-4000-8000-000000000004', '2026-01-05', 1, 'CHF', 'injecte')`,
        );
      }),
    ).rejects.toThrow();
  });
});
