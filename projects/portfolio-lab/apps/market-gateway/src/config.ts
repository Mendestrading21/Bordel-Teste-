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

/*
 * Expurgation partagée.
 *
 * La liste des secrets et la fonction d'expurgation vivaient ici, dupliquées de
 * ce que l'application web aurait dû faire de son côté. Une liste de secrets
 * maintenue à deux endroits finit par diverger, et c'est l'endroit oublié qui
 * laisse fuir la clé. Elles vivent désormais dans `@portfolio-lab/security` ;
 * la ré-exportation garde les importations existantes valides.
 */
export { redactSecrets, SECRET_ENV_KEYS } from "@portfolio-lab/security";
