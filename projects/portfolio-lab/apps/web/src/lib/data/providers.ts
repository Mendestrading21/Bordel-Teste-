import "server-only";

import {
  CANDIDATE_PROVIDERS,
  createMockProvider,
  ProviderRegistry,
  VERIFICATION_LABEL,
  type VerificationStatus,
} from "@portfolio-lab/market-data";
import type { QuoteFreshness } from "@portfolio-lab/domain";

/**
 * État des fournisseurs de données, pour l'écran de réglages.
 *
 * L'écran affiche l'état réel, y compris « jamais appelé ». Masquer les
 * fournisseurs non intégrés donnerait l'impression que la couverture est
 * complète.
 */
export type ProviderStatus = {
  readonly id: string;
  readonly label: string;
  readonly verification: VerificationStatus;
  readonly verificationLabel: string;
  readonly blockedBy: string | null;
  readonly bestFreshness: QuoteFreshness;
  readonly assetTypes: readonly string[];
  /** `true` si le fournisseur peut réellement être interrogé maintenant. */
  readonly usable: boolean;
  /** Nom de la variable attendue — jamais sa valeur. */
  readonly apiKeyEnvVar: string | null;
  /** `true` si une clé est présente dans l'environnement. Jamais la clé. */
  readonly apiKeyPresent: boolean;
  readonly documentationUrl: string;
};

function buildRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();

  registry.register({
    id: "mock",
    label: "Fournisseur simulé",
    capabilities: createMockProvider({ instruments: [] }).capabilities(),
    verification: "FIXTURE_TESTED",
    blockedBy:
      "Données simulées et déterministes. Elles ne remplacent aucun fournisseur réel " +
      "et sont marquées « Manuel » ou « Dernière NAV » dans toute l'interface.",
    apiKeyEnvVar: null,
    documentationUrl: "packages/market-data/src/mock-provider.ts",
    create: () => createMockProvider({ instruments: [] }),
  });

  for (const candidate of CANDIDATE_PROVIDERS) {
    registry.register(candidate);
  }

  return registry;
}

export function listProviderStatus(
  env: Readonly<Record<string, string | undefined>> = process.env,
): readonly ProviderStatus[] {
  return buildRegistry()
    .list()
    .map((registration) => {
      const key = registration.apiKeyEnvVar;
      return {
        id: registration.id,
        label: registration.label,
        verification: registration.verification,
        verificationLabel: VERIFICATION_LABEL[registration.verification],
        blockedBy: registration.blockedBy,
        bestFreshness: registration.capabilities.bestFreshness,
        assetTypes: registration.capabilities.assetTypes,
        usable: registration.create(env) !== null,
        apiKeyEnvVar: key,
        // Seule la présence est exposée, jamais la valeur ni sa longueur.
        apiKeyPresent: key !== null && typeof env[key] === "string" && env[key] !== "",
        documentationUrl: registration.documentationUrl,
      };
    });
}
