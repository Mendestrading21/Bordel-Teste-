/**
 * Erreurs applicatives de la couche base.
 *
 * Elles ne transportent jamais le détail PostgreSQL d'origine vers
 * l'utilisateur : un message d'erreur de contrainte peut révéler des noms de
 * colonnes et des identifiants.
 */
export class NotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} introuvable`);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  constructor(resource: string) {
    super(`Accès refusé à ${resource}`);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** Codes SQLSTATE que la couche applicative sait traduire. */
const PG_ERROR_CODES = {
  uniqueViolation: "23505",
  foreignKeyViolation: "23503",
  checkViolation: "23514",
  notNullViolation: "23502",
} as const;

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/**
 * Traduit une erreur PostgreSQL en erreur applicative.
 *
 * Les erreurs non reconnues sont relancées telles quelles : les avaler
 * masquerait un vrai défaut derrière un message générique.
 */
export function translateDatabaseError(error: unknown, resource: string): never {
  switch (errorCodeOf(error)) {
    case PG_ERROR_CODES.uniqueViolation:
      throw new ConflictError(`${resource} existe déjà`);
    case PG_ERROR_CODES.foreignKeyViolation:
      throw new ConflictError(`${resource} référence une ressource inexistante`);
    case PG_ERROR_CODES.checkViolation:
      throw new ConflictError(`${resource} ne respecte pas les règles de validation`);
    case PG_ERROR_CODES.notNullViolation:
      throw new ConflictError(`${resource} : un champ obligatoire est manquant`);
    default:
      throw error;
  }
}
