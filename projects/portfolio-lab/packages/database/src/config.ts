import { z } from "zod";

/**
 * Configuration d'accès à PostgreSQL.
 *
 * Une seule variable, `DATABASE_URL`, exclusivement côté serveur. Elle n'est
 * jamais préfixée `NEXT_PUBLIC_` : la chaîne contient un mot de passe.
 */
const databaseConfigSchema = z.object({
  connectionString: z.string().url("DATABASE_URL doit être une URL PostgreSQL valide"),
  /** Nombre maximal de connexions du pool applicatif. */
  poolSize: z.coerce.number().int().min(1).max(100).default(10),
  /** Abandon d'une requête au-delà de ce délai, en millisecondes. */
  statementTimeoutMs: z.coerce.number().int().min(100).max(120_000).default(10_000),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;

export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigError";
  }
}

export function loadDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const result = databaseConfigSchema.safeParse({
    connectionString: env["DATABASE_URL"],
    poolSize: env["DATABASE_POOL_SIZE"],
    statementTimeoutMs: env["DATABASE_STATEMENT_TIMEOUT_MS"],
  });

  if (!result.success) {
    // Le message d'erreur ne reprend jamais la valeur reçue : elle contient le
    // mot de passe de la base.
    const fields = result.error.issues.map((issue) => issue.path.join(".") || "(racine)");
    throw new DatabaseConfigError(
      `Configuration base de données invalide — champs en cause : ${fields.join(", ")}`,
    );
  }

  return result.data;
}

/**
 * Masque le mot de passe d'une URL PostgreSQL pour l'affichage ou le journal.
 *
 * Retourne une chaîne neutre si l'URL est illisible : mieux vaut ne rien dire
 * que risquer de recopier une chaîne de connexion brute dans un log.
 */
export function redactConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    if (url.password !== "") {
      url.password = "***";
    }
    return url.toString();
  } catch {
    return "[chaîne de connexion illisible]";
  }
}
