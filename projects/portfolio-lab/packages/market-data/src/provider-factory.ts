import { createCoinGeckoProvider } from "./coingecko-provider.js";
import type { MarketDataProvider } from "./contract.js";
import { createEodhdProvider } from "./eodhd-provider.js";
import { createFinnhubProvider } from "./finnhub-provider.js";
import { createMassiveProvider } from "./massive-provider.js";
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
export function createConfiguredProviders(
  env: NodeJS.ProcessEnv = process.env,
): ProviderFactoryResult {
  const config = readLiveProviderConfig(env);
  const issues = [...validateLiveProviderConfig(config)];
  const providers: MarketDataProvider[] = [];
  const timeoutMs = Number.parseInt(env["MARKET_DATA_REST_TIMEOUT_MS"] ?? "8000", 10);

  if (config.providers["eodhd"]?.enabled) {
    const mode = config.providers["eodhd"].mode;
    const token = env["EODHD_API_KEY"] ?? (mode === "demo" ? "demo" : undefined);
    if (token === undefined) {
      issues.push("eodhd: aucune clé EODHD_API_KEY et mode différent de demo");
    } else if (mode === "demo" || mode === "live") {
      providers.push(createEodhdProvider({ apiToken: token, mode, timeoutMs }));
    }
  }

  if (config.providers["twelvedata"]?.enabled) {
    const mode = config.providers["twelvedata"].mode;
    const apiKey = env["TWELVE_DATA_API_KEY"] ?? (mode === "demo" ? "demo" : undefined);
    if (apiKey === undefined) {
      issues.push("twelvedata: aucune clé TWELVE_DATA_API_KEY et mode différent de demo");
    } else if (mode === "demo" || mode === "live") {
      const freshness = env["TWELVE_DATA_FRESHNESS"] === "LIVE" ? "LIVE" : "DELAYED";
      const parsedDelay =
        env["TWELVE_DATA_DELAY_MINUTES"] === undefined
          ? null
          : Number.parseInt(env["TWELVE_DATA_DELAY_MINUTES"], 10);
      providers.push(
        createTwelveDataProvider({
          apiKey,
          mode,
          freshness,
          delayMinutes: Number.isFinite(parsedDelay) ? parsedDelay : null,
          timeoutMs,
        }),
      );
    }
  }

  if (config.providers["massive"]?.enabled) {
    const mode = config.providers["massive"].mode;
    const apiKey = env["MASSIVE_API_KEY"];
    if (apiKey === undefined) {
      /*
       * Massive n'expose aucun mode démo public : sans clé, il n'y a rien à
       * instancier. Le signaler explicitement vaut mieux qu'un fournisseur
       * absent de la liste, que rien ne distinguerait d'un oubli de
       * configuration.
       */
      issues.push("massive: activé sans MASSIVE_API_KEY, et aucun mode démo n'existe");
    } else if (mode === "live") {
      providers.push(
        createMassiveProvider({
          apiKey,
          timeoutMs,
          /*
           * La fraîcheur vient du plan souscrit. Les endpoints différés et
           * temps réel renvoient la même forme : la déduire de la réponse
           * serait une invention.
           */
          freshness: env["MASSIVE_FRESHNESS"] === "LIVE" ? "LIVE" : "DELAYED",
          delayMinutes:
            env["MASSIVE_DELAY_MINUTES"] === undefined
              ? null
              : Number.parseInt(env["MASSIVE_DELAY_MINUTES"], 10),
        }),
      );
    } else {
      issues.push(`massive: mode ${mode} non supporté — seul « live » existe`);
    }
  }

  if (config.providers["coingecko"]?.enabled) {
    const mode = config.providers["coingecko"].mode;
    const coinGeckoKey = env["COINGECKO_API_KEY"];
    if (mode === "live" && coinGeckoKey === undefined) {
      issues.push("coingecko: mode live sans COINGECKO_API_KEY");
    } else if (mode === "demo") {
      providers.push(
        createCoinGeckoProvider({
          mode: coinGeckoKey === undefined ? "keyless" : "demo",
          ...(coinGeckoKey === undefined ? {} : { apiKey: coinGeckoKey }),
          timeoutMs,
        }),
      );
    } else if (mode === "live" && coinGeckoKey !== undefined) {
      providers.push(createCoinGeckoProvider({ mode: "live", apiKey: coinGeckoKey, timeoutMs }));
    }
  }

  if (config.providers["finnhub"]?.enabled) {
    const apiKey = env["FINNHUB_API_KEY"];
    if (apiKey === undefined || apiKey.trim() === "") {
      /*
       * Finnhub n'expose aucun mode démo : la clé gratuite doit être créée par
       * son porteur. Sans clé, il n'y a rien à instancier, et le dire vaut
       * mieux qu'un fournisseur absent de la liste — que rien ne distinguerait
       * d'un oubli de configuration.
       */
      issues.push("finnhub: activé sans FINNHUB_API_KEY, et aucun mode démo n'existe");
    } else {
      /*
       * Le plan vient de la configuration, jamais de la présence d'une clé :
       * une clé gratuite et une clé payante se ressemblent trait pour trait, et
       * en déduire « temps réel » afficherait « en direct » sur du différé.
       */
      const plan = env["FINNHUB_PLAN"] === "paid" ? "paid" : "free";
      const declaredDelay = Number(env["FINNHUB_DELAY_MINUTES"]);
      providers.push(
        createFinnhubProvider({
          apiKey,
          plan,
          timeoutMs,
          delayMinutes: Number.isFinite(declaredDelay) && declaredDelay > 0 ? declaredDelay : null,
        }),
      );
    }
  }

  return { providers, issues };
}
