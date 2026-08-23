import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { PoolClient } from "pg";

/**
 * Exécuteur de migrations SQL.
 *
 * Volontairement minimal : les migrations sont des fichiers `.sql` numérotés,
 * appliqués une fois, dans l'ordre, chacun dans sa propre transaction. Un outil
 * plus riche apporterait des rollbacks automatiques dont on ne veut pas sur une
 * base de production — une migration défaite automatiquement peut détruire des
 * données.
 *
 * L'empreinte de chaque fichier appliqué est conservée : modifier une migration
 * déjà passée est détecté et refusé, plutôt que silencieusement ignoré.
 */

export type Migration = {
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
};

export class MigrationDriftError extends Error {
  constructor(name: string) {
    super(
      `La migration ${name} a déjà été appliquée mais son contenu a changé. ` +
        "Créer une nouvelle migration plutôt que de modifier une migration passée.",
    );
    this.name = "MigrationDriftError";
  }
}

const MIGRATION_FILE_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

export function loadMigrations(directory: string): Migration[] {
  return (
    readdirSync(directory)
      .filter((file) => MIGRATION_FILE_PATTERN.test(file))
      // Les noms sont préfixés d'un numéro à quatre chiffres : le tri
      // lexicographique est donc aussi l'ordre chronologique.
      .sort()
      .map((file) => {
        const sql = readFileSync(join(directory, file), "utf8");
        return {
          name: file,
          sql,
          checksum: createHash("sha256").update(sql).digest("hex"),
        };
      })
  );
}

const MIGRATIONS_TABLE = `
  create table if not exists schema_migrations (
    name text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  )
`;

export type MigrationResult = {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
};

/**
 * Applique les migrations manquantes.
 *
 * L'opération est idempotente : rejouer la fonction sur une base à jour ne fait
 * rien et ne produit aucune erreur.
 */
export async function runMigrations(
  client: PoolClient,
  migrations: readonly Migration[],
): Promise<MigrationResult> {
  await client.query(MIGRATIONS_TABLE);

  const { rows } = await client.query<{ name: string; checksum: string }>(
    "select name, checksum from schema_migrations",
  );
  const alreadyApplied = new Map(rows.map((row) => [row.name, row.checksum]));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of migrations) {
    const previousChecksum = alreadyApplied.get(migration.name);

    if (previousChecksum !== undefined) {
      if (previousChecksum !== migration.checksum) {
        throw new MigrationDriftError(migration.name);
      }
      skipped.push(migration.name);
      continue;
    }

    // Chaque migration dans sa propre transaction : un échec au milieu du lot
    // laisse la base dans un état cohérent, à la migration précédente.
    await client.query("begin");
    try {
      await client.query(migration.sql);
      await client.query("insert into schema_migrations (name, checksum) values ($1, $2)", [
        migration.name,
        migration.checksum,
      ]);
      await client.query("commit");
      applied.push(migration.name);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  return { applied, skipped };
}
