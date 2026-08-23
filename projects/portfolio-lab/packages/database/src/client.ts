import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

import { loadDatabaseConfig, type DatabaseConfig } from "./config.js";

/*
 * `numeric` (OID 1700) est renvoyé en chaîne, pas en `number`.
 *
 * Le pilote `pg` convertit par défaut certains types numériques en `number`,
 * ce qui détruirait silencieusement la précision de chaque montant lu. On force
 * la chaîne pour que la valeur arrive intacte jusqu'à `decimal.js`.
 */
types.setTypeParser(1700, (value: string) => value);

/*
 * `int8` (OID 20) reste également en chaîne : un bigint hors plage de
 * `Number.MAX_SAFE_INTEGER` serait arrondi.
 */
types.setTypeParser(20, (value: string) => value);

export type Database = {
  /** Exécute une requête sur une connexion empruntée au pool. */
  query<T extends QueryResultRow>(text: string, params?: readonly unknown[]): Promise<T[]>;
  /**
   * Exécute un bloc dans une transaction, avec l'identité de l'utilisateur
   * posée sur la session — condition nécessaire pour que les politiques RLS
   * s'appliquent.
   */
  withUser<T>(userId: string, run: (client: PoolClient) => Promise<T>): Promise<T>;
  /** Transaction sans identité : réservée aux tâches serveur. */
  transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createDatabase(config: DatabaseConfig = loadDatabaseConfig()): Database {
  const pool = new Pool({
    connectionString: config.connectionString,
    max: config.poolSize,
    statement_timeout: config.statementTimeoutMs,
  });

  async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const result = await run(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => {
        // Le rollback peut échouer si la connexion est déjà morte ; l'erreur
        // d'origine reste la plus informative.
      });
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    async query<T extends QueryResultRow>(text: string, params: readonly unknown[] = []) {
      const result = await pool.query<T>(text, [...params]);
      return result.rows;
    },

    async withUser<T>(userId: string, run: (client: PoolClient) => Promise<T>) {
      /*
       * L'identifiant est validé avant d'être posé : `set_config` prend une
       * chaîne, et l'injecter sans contrôle depuis un jeton mal vérifié
       * ouvrirait la porte à une usurpation d'identité RLS.
       */
      if (!UUID_PATTERN.test(userId)) {
        throw new TypeError("Identifiant utilisateur invalide");
      }
      return transaction(async (client) => {
        // `true` en troisième argument = portée transaction : le paramètre est
        // effacé au commit, donc la connexion rendue au pool ne conserve
        // aucune identité.
        await client.query("select set_config('portfolio_lab.user_id', $1, true)", [userId]);
        return run(client);
      });
    },

    transaction,

    async close() {
      await pool.end();
    },
  };
}
