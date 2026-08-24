import { ASSET_TYPES, type AssetType } from "@portfolio-lab/domain";

import type { MarketDataProvider } from "./contract.js";
import { readLiveProviderConfig, type LiveProviderConfig } from "./live-provider-config.js";

export type ProviderHealth = {
  readonly providerId: string;
  readonly enabled: boolean;
  readonly mode: "disabled" | "demo" | "live";
  /** Présence d'une clé, **jamais** sa valeur. */
  readonly apiKeyPresent: boolean;
  /** `true` uniquement si un adaptateur a réellement été instancié. */
  readonly adapterInstantiated: boolean;
  readonly assetTypes: readonly AssetType[];
  readonly streaming: boolean;
  readonly bestFreshness: string | null;
  readonly delayMinutes: number | null;
};

export type CoverageGap = {
  readonly assetType: AssetType;
  /** Fournisseurs instanciés qui déclarent couvrir ce type. */
  readonly coveredBy: readonly string[];
};

export type MarketDataHealth = {
  readonly marketDataMode: LiveProviderConfig["marketDataMode"];
  readonly providers: readonly ProviderHealth[];
  readonly coverage: readonly CoverageGap[];
  /** Classes d'actifs qu'aucun fournisseur instancié ne couvre. */
  readonly uncovered: readonly AssetType[];
  readonly issues: readonly string[];
};

/**
 * État de santé des fournisseurs de données de marché.
 *
 * Conçu pour être **affichable et journalisable sans précaution** : il ne
 * contient que des booléens de présence, jamais une valeur de clé. C'est ce qui
 * permet de le montrer dans les réglages et de le joindre à un rapport
 * d'incident sans relire chaque champ.
 *
 * Il croise deux choses que l'on confond facilement : ce que la configuration
 * *déclare* et ce qui est *réellement instancié*. Un fournisseur activé dans
 * l'environnement mais dont l'adaptateur n'existe pas encore apparaît
 * `enabled: true, adapterInstantiated: false` — sans quoi une case cochée dans
 * un fichier `.env` donnerait l'illusion d'une couverture.
 *
 * `uncovered` répond directement à « pourquoi cette obligation n'a-t-elle aucun
 * cours ? » : si `BOND` y figure, la réponse est qu'aucun fournisseur chargé ne
 * prétend couvrir les obligations, et non qu'un appel a échoué.
 */
export function marketDataHealth(
  providers: readonly MarketDataProvider[],
  issues: readonly string[] = [],
  env: NodeJS.ProcessEnv = process.env,
): MarketDataHealth {
  const config = readLiveProviderConfig(env);
  const instantiated = new Map(providers.map((provider) => [provider.id, provider]));

  /*
   * Les fournisseurs déclarés dans la configuration **et** ceux réellement
   * instanciés : un adaptateur monté hors configuration — le fournisseur simulé
   * en développement — doit apparaître, sinon le rapport mentirait par omission.
   */
  const ids = [...new Set([...Object.keys(config.providers), ...instantiated.keys()])].sort();

  const health: ProviderHealth[] = ids.map((providerId) => {
    const declared = config.providers[providerId];
    const provider = instantiated.get(providerId);
    const capabilities = provider?.capabilities();

    return {
      providerId,
      enabled: declared?.enabled ?? provider !== undefined,
      mode: declared?.mode ?? (provider === undefined ? "disabled" : "demo"),
      apiKeyPresent: declared?.apiKeyPresent ?? false,
      adapterInstantiated: provider !== undefined,
      assetTypes: capabilities?.assetTypes ?? [],
      streaming: capabilities?.streaming ?? false,
      bestFreshness: capabilities?.bestFreshness ?? null,
      delayMinutes: capabilities?.delayMinutes ?? null,
    };
  });

  const coverage: CoverageGap[] = ASSET_TYPES.map((assetType) => ({
    assetType,
    coveredBy: providers
      .filter((provider) => provider.capabilities().assetTypes.includes(assetType))
      .map((provider) => provider.id),
  }));

  return {
    marketDataMode: config.marketDataMode,
    providers: health,
    coverage,
    uncovered: coverage.filter((entry) => entry.coveredBy.length === 0).map((e) => e.assetType),
    issues,
  };
}
