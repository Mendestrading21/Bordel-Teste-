/*
 * Préparation d'une installation locale, en une commande.
 *
 * Le script **réutilise le runner de migrations du paquet `database`** plutôt
 * que d'enchaîner des `psql`. Ce n'est pas un détail de confort : le runner
 * enregistre ce qu'il a appliqué, ce qui rend l'opération réellement
 * idempotente, et il compare une empreinte — une migration modifiée après coup
 * est détectée au lieu d'être rejouée en silence.
 *
 * Une première version passait par `psql` en boucle. Elle se déclarait
 * idempotente et ne l'était pas : au second lancement, `create type asset_type`
 * échouait. Deux chemins de migration valent toujours une divergence.
 *
 * Le script ne crée pas la base de données : `createdb` demande des droits et
 * une méthode de connexion qui varient d'une installation à l'autre, et
 * échouer là-dessus au milieu laisserait un état à moitié préparé.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

import {
  loadDatabaseConfig,
  loadMigrations,
  runMigrations,
  MigrationDriftError,
} from "@portfolio-lab/database";

const MIGRATIONS_DIR = fileURLToPath(new URL("../supabase/migrations", import.meta.url));
const SEED_FILE = fileURLToPath(new URL("../supabase/seed.sql", import.meta.url));

const withSeed = process.argv.includes("--demo");

function fail(message: string, hint?: string): never {
  console.error(`\n✗ ${message}\n`);
  if (hint !== undefined) console.error(`${hint}\n`);
  process.exit(1);
}

let databaseUrl: string;
try {
  databaseUrl = loadDatabaseConfig().connectionString;
} catch {
  fail(
    "DATABASE_URL n'est pas défini, ou n'est pas une URL PostgreSQL valide.",
    'Exemple :\n  export DATABASE_URL="postgresql://$USER@localhost:5432/portfolio_lab"',
  );
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });

async function main(): Promise<void> {
  console.log("→ Connexion à PostgreSQL…");

  let client;
  try {
    client = await pool.connect();
  } catch {
    fail(
      "PostgreSQL est injoignable avec ce DATABASE_URL.",
      "Vérifiez que le serveur tourne et que la base existe :\n" +
        "  createdb portfolio_lab\n\n" +
        "La base n'est pas créée automatiquement : les droits et la méthode de\n" +
        "connexion varient trop d'une installation à l'autre pour le faire à\n" +
        "l'aveugle.",
    );
  }

  console.log("→ Application des migrations…");
  try {
    const result = await runMigrations(client, loadMigrations(MIGRATIONS_DIR));

    for (const name of result.applied) console.log(`   appliquée  ${name}`);
    for (const name of result.skipped) console.log(`   déjà là    ${name}`);
    if (result.applied.length === 0) console.log("   (schéma déjà à jour)");
  } catch (error) {
    if (error instanceof MigrationDriftError) {
      fail(
        error.message,
        "Une migration déjà appliquée a été modifiée depuis. Le schéma en base\n" +
          "ne correspond plus au fichier : repartir d'une base neuve est la seule\n" +
          "issue sûre.",
      );
    }
    fail("Les migrations ont échoué.", error instanceof Error ? error.message : undefined);
  } finally {
    client.release();
  }

  if (withSeed) {
    const { rows } = await pool.query<{ count: string }>(
      "select count(*)::text as count from positions",
    );

    if (rows[0]?.count !== "0") {
      /*
       * Le seed insère des identifiants fixes : le rejouer violerait les clés
       * primaires. On le saute plutôt que d'échouer — relancer ce script ne
       * doit jamais casser une base déjà prête.
       */
      console.log("→ Données de démonstration déjà présentes, rien à charger.");
    } else {
      console.log("→ Chargement des données de démonstration (entièrement fictives)…");
      execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-q", "-f", SEED_FILE], {
        stdio: "pipe",
      });
    }
  }

  const { rows } = await pool.query<{ count: string }>(
    "select count(*)::text as count from positions",
  );
  const positions = rows[0]?.count ?? "0";
  const plural = positions === "1" ? "" : "s";

  console.log(`
✓ Base prête. ${positions} position${plural} enregistrée${plural}.

Lancer l'application :
${withSeed ? "  PORTFOLIO_LAB_DEMO_MODE=true pnpm run dev" : "  pnpm run dev"}

Puis ouvrir http://localhost:3100
`);
}

try {
  await main();
} finally {
  await pool.end();
}
