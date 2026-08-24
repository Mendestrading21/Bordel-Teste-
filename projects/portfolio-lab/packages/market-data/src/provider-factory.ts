import { createEodhdProvider } from "./eodhd-provider.js";
import { readLiveProviderConfig, validateLiveProviderConfig } from "./live-provider-config.js";
import type { MarketDataProvider } from "./contract.js";
import { createTwelveDataProvider } from "./twelve-data-provider.js";

export type ProviderFactoryResult = {
  readonly providers: readonly MarketDataProvider[];
  readonly issues: readonly string[];
};

/**
 * Instancie uniquement les fournisseurs pour lesquels une implémentation réelle
 * existe dans le dépôt. Les autres restent dans la config afin que l'UI puisse
 * signaler « prévu mais non intégré », sans créer un faux provider.
 *
 * Les secrets sont lus ici, côté serveur, et ne sont jamais inclus dans le
 * résultat sérialisable de `readLiveProviderConfig`.
 */
export function createConfiguredProviders(env: NodeJS.ProcessEnv = process.env): ProviderFactoryResult {
  const config = readLiveProviderConfig(env);
  const issues = [...validateLiveProviderConfig(config)];
  const providers: MarketDataProvider[] = [];
  const timeoutMs = Number.parseInt(env.MARKET_DATA_REST_TIMEOUT_MS ?? "8000", 10);

  if (config.providers.eodhd?.enabled) {
    const mode = config.providers.eodhd.mode;
    const token = env.EODHD_API_KEY ?? (mode === "demo" ? "demo" : undefined);
    if (token === undefined) {
      issues.push("eodhd: aucune clé EODHD_API_KEY et mode différent de demo");
    } else if (mode === "demo" || mode === "live") {
      providers.push(createEodhdProvider({ apiToken: token, mode, timeoutMs }));
    }
  }

  if (config.providers.twelvedata?.enabled) {
    const mode = config.providers.twelvedata.mode;
    const apiKey = env.TWELVE_DATA_API_KEY ?? (mode === "demo" ? "demo" : undefined);
    if (apiKey === undefined) {
      issues.push("twelvedata: aucune clé TWELVE_DATA_API_KEY et mode différent de demo");
    } else if (mode === "demo" || mode === "live") {
      const freshness = env.TWELVE_DATA_FRESHNESS === "LIVE" ? "LIVE" : "DELAYED";
      const parsedDelay = env.TWELVE_DATA_DELAY_MINUTES === undefined
        ? null
        : Number.parseInt(env.TWELVE_DATA_DELAY_MINUTES, 10);
      providers.push(createTwelveDataProvider({
        apiKey,
        mode,
        freshness,
        delayMinutes: Number.isFinite(parsedDelay) ? parsedDelay : null,
        timeoutMs,
      }));
    }
  }

  return { providers, issues };
}
