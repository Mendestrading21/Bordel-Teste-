export type LiveProviderMode = "disabled" | "demo" | "live";

export type LiveProviderConfig = {
  readonly marketDataMode: "mock" | "demo" | "live";
  readonly enabledProviders: readonly string[];
  readonly providers: Readonly<
    Record<string, { enabled: boolean; mode: LiveProviderMode; apiKeyPresent: boolean }>
  >;
};

const readBool = (value: string | undefined): boolean => value === "true";

const mode = (value: string | undefined): LiveProviderMode => {
  if (value === "demo" || value === "live") return value;
  return "disabled";
};

/**
 * Lecture centralisée de la configuration live.
 *
 * Important : cette fonction ne retourne jamais les secrets, seulement leur présence.
 * Elle peut donc être utilisée dans les health checks et les diagnostics sans risque de log.
 */
export function readLiveProviderConfig(env: NodeJS.ProcessEnv = process.env): LiveProviderConfig {
  const marketDataMode =
    env["MARKET_DATA_MODE"] === "demo" || env["MARKET_DATA_MODE"] === "live"
      ? env["MARKET_DATA_MODE"]
      : "mock";

  const enabledProviders = (env["MARKET_DATA_ENABLED_PROVIDERS"] ?? "mock")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    marketDataMode,
    enabledProviders,
    providers: {
      eodhd: {
        enabled: readBool(env["EODHD_ENABLED"]),
        mode: mode(env["EODHD_MODE"]),
        apiKeyPresent: Boolean(env["EODHD_API_KEY"]),
      },
      twelvedata: {
        enabled: readBool(env["TWELVE_DATA_ENABLED"]),
        mode: mode(env["TWELVE_DATA_MODE"]),
        apiKeyPresent: Boolean(env["TWELVE_DATA_API_KEY"]),
      },
      massive: {
        enabled: readBool(env["MASSIVE_ENABLED"]),
        mode: mode(env["MASSIVE_MODE"]),
        apiKeyPresent: Boolean(env["MASSIVE_API_KEY"]),
      },
      coingecko: {
        enabled: readBool(env["COINGECKO_ENABLED"]),
        mode: mode(env["COINGECKO_MODE"]),
        apiKeyPresent: Boolean(env["COINGECKO_API_KEY"]),
      },
      openfigi: {
        enabled: readBool(env["OPENFIGI_ENABLED"]),
        mode: readBool(env["OPENFIGI_ENABLED"]) ? "live" : "disabled",
        apiKeyPresent: Boolean(env["OPENFIGI_API_KEY"]),
      },
      finra: {
        enabled: readBool(env["FINRA_ENABLED"]),
        mode: readBool(env["FINRA_ENABLED"]) ? "live" : "disabled",
        apiKeyPresent: Boolean(env["FINRA_API_KEY"]),
      },
      alphavantage: {
        enabled: readBool(env["ALPHAVANTAGE_ENABLED"]),
        mode: readBool(env["ALPHAVANTAGE_ENABLED"]) ? "live" : "disabled",
        apiKeyPresent: Boolean(env["ALPHAVANTAGE_API_KEY"]),
      },
      finnhub: {
        enabled: readBool(env["FINNHUB_ENABLED"]),
        mode: readBool(env["FINNHUB_ENABLED"]) ? "live" : "disabled",
        apiKeyPresent: Boolean(env["FINNHUB_API_KEY"]),
      },
      factset: {
        enabled: readBool(env["FACTSET_ENABLED"]),
        mode: readBool(env["FACTSET_ENABLED"]) ? "live" : "disabled",
        apiKeyPresent: Boolean(env["FACTSET_API_KEY"] && env["FACTSET_API_SECRET"]),
      },
    },
  };
}

/**
 * Fournisseurs pour lesquels un adaptateur existe **réellement**.
 *
 * `readLiveProviderConfig` décrit tous les candidats étudiés, y compris ceux
 * qui n'ont jamais été implémentés. Sans cette liste, activer l'un d'eux avec
 * une clé passait toutes les validations et n'instanciait rien : la
 * configuration paraissait correcte, l'écran restait muet, et rien nulle part
 * ne reliait les deux. C'est exactement la panne qu'a connue Finnhub, dont
 * l'adaptateur existait sans être branché.
 *
 * `openfigi` n'y figure pas : il normalise des identifiants et ne publie aucun
 * prix. `finra` non plus : le module `finra-trace` fournit la normalisation des
 * transactions obligataires, mais aucun client HTTP ni entrée de routeur.
 */
const IMPLEMENTED_PROVIDERS: ReadonlySet<string> = new Set([
  "eodhd",
  "twelvedata",
  "massive",
  "coingecko",
  "finnhub",
]);

export function validateLiveProviderConfig(config: LiveProviderConfig): readonly string[] {
  const issues: string[] = [];

  /*
   * Vérifié quel que soit le mode, et non seulement en `live` : un fournisseur
   * activé sans adaptateur ne produira jamais rien, et le dire tôt vaut mieux
   * que de le découvrir sur un écran vide.
   */
  for (const [providerId, provider] of Object.entries(config.providers)) {
    if (provider.enabled && !IMPLEMENTED_PROVIDERS.has(providerId)) {
      issues.push(
        `${providerId}: activé, mais aucun adaptateur n'existe — aucun cours n'en viendra`,
      );
    }
  }

  if (config.marketDataMode === "live") {
    const enabled = Object.entries(config.providers).filter(([, value]) => value.enabled);
    if (enabled.length === 0)
      issues.push("MARKET_DATA_MODE=live mais aucun fournisseur n'est activé");

    for (const [providerId, provider] of enabled) {
      // Un fournisseur sans adaptateur a déjà été signalé plus haut ; répéter
      // « clé manquante » à son sujet enverrait chercher une clé qui ne
      // servirait à rien.
      if (!IMPLEMENTED_PROVIDERS.has(providerId)) continue;
      if (provider.mode === "disabled") issues.push(`${providerId}: activé mais mode=disabled`);
      if (!provider.apiKeyPresent) {
        issues.push(`${providerId}: activé sans clé API configurée`);
      }
    }
  }

  return issues;
}
