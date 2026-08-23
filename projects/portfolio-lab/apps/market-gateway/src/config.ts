import { z } from "zod";

/**
 * Configuration de la passerelle de marché.
 *
 * Les clés fournisseurs ne sont lues *que* dans ce processus. La PWA ne reçoit
 * jamais de clé permanente : c'est la raison d'être d'un service séparé.
 */
const configSchema = z.object({
  /** Port d'écoute du service de santé et, plus tard, du canal temps réel. */
  port: z.coerce.number().int().min(1).max(65535).default(4100),
  /** `mock` tant qu'aucun abonnement fournisseur n'est actif. */
  provider: z.enum(["mock", "twelvedata", "massive", "eodhd"]).default("mock"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /**
   * Secret partagé avec le backend de la PWA, servant à signer les jetons de
   * canal. Absent, le canal temps réel refuse toute connexion : mieux vaut un
   * canal fermé qu'un canal ouvert à quiconque.
   */
  sharedSecret: z.string().min(32).optional(),
  /**
   * Connexions simultanées autorisées par utilisateur.
   *
   * Plusieurs onglets ou appareils sont légitimes ; un nombre illimité
   * permettrait d'épuiser la mémoire de la passerelle avec une seule identité.
   */
  maxConnectionsPerUser: z.coerce.number().int().min(1).max(50).default(5),
});

export type GatewayConfig = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const result = configSchema.safeParse({
    port: env["MARKET_GATEWAY_PORT"],
    provider: env["MARKET_DATA_PROVIDER"],
    logLevel: env["LOG_LEVEL"],
    sharedSecret: env["MARKET_GATEWAY_SHARED_SECRET"],
    maxConnectionsPerUser: env["MARKET_GATEWAY_MAX_CONNECTIONS_PER_USER"],
  });

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(racine)"} : ${issue.message}`)
      .join(" ; ");
    throw new ConfigError(`Configuration de la passerelle invalide — ${details}`);
  }

  return result.data;
}

/**
 * Noms des variables d'environnement portant un secret.
 *
 * Utilisé par `redactSecrets` pour garantir qu'aucune clé ne peut atterrir dans
 * un log, une trace ou une réponse d'erreur.
 */
export const SECRET_ENV_KEYS = [
  "TWELVE_DATA_API_KEY",
  "MASSIVE_API_KEY",
  "EODHD_API_KEY",
  "OPENFIGI_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "DATABASE_URL",
  "MARKET_GATEWAY_SHARED_SECRET",
] as const;

/**
 * Remplace toute valeur de secret présente dans un texte par `[expurgé]`.
 *
 * On expurge par *valeur* et pas seulement par nom de champ : une clé recopiée
 * dans le corps d'un message d'erreur fournisseur ne porte aucun nom.
 */
export function redactSecrets(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let output = text;
  for (const key of SECRET_ENV_KEYS) {
    const value = env[key];
    // Les valeurs très courtes sont ignorées : elles produiraient des
    // remplacements parasites dans du texte légitime.
    if (typeof value === "string" && value.length >= 8) {
      output = output.split(value).join("[expurgé]");
    }
  }
  return output;
}
