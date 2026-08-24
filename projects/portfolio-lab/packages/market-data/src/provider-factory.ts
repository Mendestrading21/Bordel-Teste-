import { createCoinGeckoProvider } from "./coingecko-provider.js";
import type { MarketDataProvider } from "./contract.js";
import { createEodhdProvider } from "./eodhd-provider.js";
import { readLiveProviderConfig, validateLiveProviderConfig } from "./live-provider-config.js";
import { createTwelveDataProvider } from "./twelve-data-provider.js";

export type ProviderFactoryResult = {
  readonly providers: readonly MarketDataProvider[];
  readonly issues: readonly string[];
};

/**
 * Instancie uniquement les fournisseurs dont l'adaptateur existe réellement.
 * Les secrets restent enfermés dans ce point serveur et ne sont jamais inclus
 * dans le diagnostic sérialisable de `readLiveProviderConfig`.
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
      const parsedDelay = env.TWELVE_DATA_DELAY_MINUTES === undefined ? null : Number.parseInt(env.TWELVE_DATA_DELAY_MINUTES, 10);
      providers.push(createTwelveDataProvider({
        apiKey,
        mode,
        freshness,
        delayMinutes: Number.isFinite(parsedDelay) ? parsedDelay : null,
        timeoutMs,
      }));
    }
  }

  if (config.providers.coingecko?.enabled) {
    const mode = config.providers.coingecko.mode;
    if (mode === "live" && env.COINGECKO_API_KEY === undefined) {
      issues.push("coingecko: mode live sans COINGECKO_API_KEY");
    } else if (mode === "demo") {
      providers.push(createCoinGeckoProvider({
        mode: env.COINGECKO_API_KEY === undefined ? "keyless" : "demo",
        apiKey: env.COINGECKO_API_KEY,
        timeoutMs,
      }));
    } else if (mode === "live" && env.COINGECKO_API_KEY !== undefined) {
      providers.push(createCoinGeckoProvider({ mode: "live", apiKey: env.COINGECKO_API_KEY, timeoutMs }));
    }
  }

  return { providers, issues };
}
