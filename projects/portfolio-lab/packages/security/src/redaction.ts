/**
 * Expurgation des journaux.
 *
 * PortfolioLab est une application patrimoniale privée dont le dépôt est
 * public. Deux fuites différentes doivent être empêchées, et une seule des deux
 * est habituellement traitée :
 *
 * 1. **les secrets** — clés fournisseurs, chaîne de connexion, secret de canal ;
 * 2. **les données financières personnelles** — montants, quantités, noms de
 *    positions. Un journal qui consigne « valorisation terminée : 32 343.89 CHF »
 *    ne contient aucun secret et publie pourtant le patrimoine de
 *    l'utilisateur.
 *
 * Ce module traite les deux.
 */

/**
 * Variables d'environnement dont la **valeur** ne doit jamais apparaître.
 *
 * L'expurgation porte sur la valeur et pas seulement sur le nom du champ : une
 * clé recopiée dans le corps d'un message d'erreur fournisseur ne porte aucun
 * nom.
 */
export const SECRET_ENV_KEYS = [
  "TWELVE_DATA_API_KEY",
  "MASSIVE_API_KEY",
  "EODHD_API_KEY",
  "OPENFIGI_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "DATABASE_URL",
  "DATABASE_URL_TEST",
  "MARKET_GATEWAY_SHARED_SECRET",
] as const;

export const REDACTED = "[expurgé]";

/**
 * Longueur minimale d'un secret pour être expurgé par valeur.
 *
 * Une valeur de trois caractères remplacerait des fragments de texte légitime
 * partout dans le journal, le rendant illisible sans rien protéger.
 */
const MIN_SECRET_LENGTH = 8;

export function redactSecrets(
  text: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  let output = text;
  for (const key of SECRET_ENV_KEYS) {
    const value = env[key];
    if (typeof value === "string" && value.length >= MIN_SECRET_LENGTH) {
      output = output.split(value).join(REDACTED);
    }
  }
  return output;
}

/**
 * Noms de champs dont la valeur est une donnée financière ou personnelle.
 *
 * La liste est volontairement large et comparée en **sous-chaîne** :
 * `marketValueBase`, `totalUnrealizedPnlBase` et `average_cost` doivent tous
 * être attrapés sans être énumérés un par un. Un faux positif rend un journal
 * moins précis ; un faux négatif publie un patrimoine.
 */
const SENSITIVE_KEY_FRAGMENTS = [
  "amount",
  "average",
  "balance",
  "cost",
  "email",
  "montant",
  "nav",
  "notional",
  "pnl",
  "price",
  "quantity",
  "quantite",
  "strike",
  "total",
  "value",
  "valeur",
] as const;

export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

/** UUID canonique, la forme sous laquelle transitent tous nos identifiants. */
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/**
 * Réduit un identifiant à son préfixe.
 *
 * Un journal a besoin de **corréler** deux lignes, pas d'identifier une
 * personne. Huit caractères suffisent à suivre une requête ; l'identifiant
 * complet permettrait de rapprocher un journal d'une ligne de base de données.
 */
export function shortenIdentifiers(text: string): string {
  return text.replace(UUID_PATTERN, (uuid) => `${uuid.slice(0, 8)}…`);
}

/** Valeur de contexte acceptée dans un journal. */
export type LogValue = string | number | boolean | null | undefined;

/**
 * Expurge un contexte de journalisation.
 *
 * Les champs sensibles sont remplacés **avant** toute sérialisation : les
 * expurger après coup, dans la chaîne JSON, obligerait à deviner où s'arrête
 * une valeur, et un montant sans guillemets passerait au travers.
 */
export function redactContext(
  context: Readonly<Record<string, LogValue>>,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, LogValue> {
  const output: Record<string, LogValue> = {};

  for (const [key, value] of Object.entries(context)) {
    if (isSensitiveKey(key)) {
      output[key] = REDACTED;
      continue;
    }
    output[key] = typeof value === "string" ? shortenIdentifiers(redactSecrets(value, env)) : value;
  }

  return output;
}
