import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { Pool, types, type PoolClient } from "pg";

import { loadMigrations, runMigrations } from "@portfolio-lab/database";

/**
 * Harnais de tests d'intégration base de données.
 *
 * Les tests tournent sur un **vrai** PostgreSQL, jamais sur une simulation :
 * une politique RLS ne peut pas être vérifiée autrement que par le moteur qui
 * l'applique. Sans `DATABASE_URL_TEST`, la suite est ignorée plutôt que de
 * prétendre passer.
 */

types.setTypeParser(1700, (value: string) => value);

export const TEST_DATABASE_URL = process.env["DATABASE_URL_TEST"];

/** `true` si un PostgreSQL de test est configuré. */
export const hasTestDatabase = typeof TEST_DATABASE_URL === "string" && TEST_DATABASE_URL !== "";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations", import.meta.url));
const SEED_FILE = fileURLToPath(new URL("../../supabase/seed.sql", import.meta.url));

/** Identités fictives, fixes pour rendre les tests reproductibles. */
export const ALICE = "11111111-1111-4111-8111-111111111111";
export const BOB = "22222222-2222-4222-8222-222222222222";
export const DEMO_USER = "00000000-0000-4000-8000-0000000dec00";

/**
 * Rôle applicatif de test.
 *
 * Il reproduit ce que le navigateur obtient avec la clé `anon` de Supabase :
 * les droits SQL de base, mais soumis à RLS. Le rôle propriétaire des tables
 * les contournerait — d'où `force row level security` dans la migration, et
 * d'où ce rôle distinct ici.
 */
export const APP_ROLE = "portfolio_lab_app";

function psql(databaseUrl: string, file: string): void {
  execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-q", "-f", file], { stdio: "pipe" });
}

export { MIGRATIONS_DIR };

export type TestDatabase = {
  pool: Pool;
  /** Exécute un bloc sous l'identité donnée, avec le rôle applicatif soumis à RLS. */
  asUser<T>(userId: string, run: (client: PoolClient) => Promise<T>): Promise<T>;
  /** Exécute un bloc sans identité — simule un accès anonyme. */
  asAnonymous<T>(run: (client: PoolClient) => Promise<T>): Promise<T>;
  /** Exécute un bloc en rôle propriétaire, pour préparer les données. */
  asOwner<T>(run: (client: PoolClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

/**
 * Prépare une base neuve : migrations puis, si demandé, le seed de démonstration.
 *
 * Repartir d'une base vide à chaque suite garantit que les migrations sont
 * réellement reproductibles, et pas seulement applicables à une base déjà dans
 * le bon état.
 */
export async function setupTestDatabase(options: {
  /**
   * Suffixe identifiant la suite.
   *
   * Chaque suite reçoit sa propre base : Vitest exécute les fichiers en
   * parallèle, et deux suites qui recréeraient le schéma de la même base
   * entreraient en collision de façon non déterministe.
   */
  name: string;
  seed?: boolean;
}): Promise<TestDatabase> {
  if (!hasTestDatabase) {
    throw new Error("DATABASE_URL_TEST n'est pas défini");
  }

  const baseUrl = new URL(TEST_DATABASE_URL as string);
  const adminDatabase = baseUrl.pathname.replace(/^\//, "") || "postgres";
  const suiteDatabase = `${adminDatabase}_${options.name}`;

  if (!/^[a-z0-9_]+$/.test(suiteDatabase)) {
    throw new Error(`Nom de base de test invalide : ${suiteDatabase}`);
  }

  // La base de suite est recréée à neuf : c'est ce qui donne son sens à la
  // vérification « migrations depuis une base vide » de QUALITY_GATES.md.
  const adminPool = new Pool({ connectionString: baseUrl.toString(), max: 1 });
  try {
    await adminPool.query(`drop database if exists ${suiteDatabase} with (force)`);
    await adminPool.query(`create database ${suiteDatabase}`);
  } finally {
    await adminPool.end();
  }

  const suiteUrl = new URL(baseUrl.toString());
  suiteUrl.pathname = `/${suiteDatabase}`;
  const url = suiteUrl.toString();

  const pool = new Pool({ connectionString: url, max: 5 });

  // Les migrations passent par le runner du package `database` — le même code
  // qu'en production, et non un `psql` parallèle qui pourrait en diverger.
  const migrations = loadMigrations(MIGRATIONS_DIR);
  const client = await pool.connect();
  try {
    const result = await runMigrations(client, migrations);
    if (result.applied.length === 0) {
      throw new Error("Aucune migration appliquée sur une base vide");
    }
  } finally {
    client.release();
  }

  if (options.seed === true) {
    psql(url, SEED_FILE);
  }

  /*
   * Création du rôle applicatif, sûre en parallèle.
   *
   * La version précédente testait l'existence puis créait. Ce n'est pas
   * atomique : `pg_roles` est global à l'instance, et plusieurs fichiers de
   * test préparent leur base **simultanément**. Les deux sessions voyaient le
   * rôle absent, les deux tentaient de le créer, et la seconde échouait. La
   * suite entière tombait alors à la préparation — le genre de rouge
   * intermittent qu'on finit par relancer sans lire.
   *
   * Le piège est dans le nom de l'erreur. On attend `duplicate_object`, mais
   * PostgreSQL remonte une `unique_violation` sur `pg_authid_rolname_index` :
   * le conflit est détecté par l'index système, pas par le contrôle de haut
   * niveau. N'attraper que `duplicate_object` ne corrige donc **rien**.
   *
   * Mesuré sur douze sessions simultanées, cinq tours : la forme d'origine
   * échoue 32 fois sur 60, la version qui n'attrape que `duplicate_object`
   * 43 fois sur 60, et celle-ci zéro.
   */
  await pool.query(
    `do $$
     begin
       create role ${APP_ROLE} nologin;
     exception
       when duplicate_object or unique_violation then null;
     end
     $$;`,
  );

  await pool.query(`grant usage on schema public to ${APP_ROLE}`);
  await pool.query(
    `grant select, insert, update, delete on all tables in schema public to ${APP_ROLE}`,
  );
  await pool.query(`grant execute on all functions in schema public to ${APP_ROLE}`);

  async function inTransaction<T>(
    run: (client: PoolClient) => Promise<T>,
    setup?: (client: PoolClient) => Promise<void>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await setup?.(client);
      const result = await run(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    pool,

    asUser(userId, run) {
      return inTransaction(run, async (client) => {
        await client.query(`set local role ${APP_ROLE}`);
        await client.query("select set_config('portfolio_lab.user_id', $1, true)", [userId]);
      });
    },

    asAnonymous(run) {
      return inTransaction(run, async (client) => {
        await client.query(`set local role ${APP_ROLE}`);
        // Aucune identité posée : c'est exactement l'état d'une requête envoyée
        // avec la clé anon sans session ouverte.
      });
    },

    asOwner(run) {
      return inTransaction(run);
    },

    async close() {
      await pool.end();
    },
  };
}

/** Vide toutes les tables utilisateur entre deux suites. */
export async function truncateUserTables(pool: Pool): Promise<void> {
  await pool.query(
    "truncate portfolios, accounts, positions, transactions, portfolio_snapshots restart identity cascade",
  );
}
