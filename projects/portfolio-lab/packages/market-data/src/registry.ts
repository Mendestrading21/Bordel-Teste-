import type { AssetType } from "@portfolio-lab/domain";

import type { MarketDataProvider, ProviderCapabilities } from "./contract.js";

/**
 * Statut de vérification d'un adaptateur.
 *
 * Cette énumération existe pour rendre **impossible** de confondre un
 * adaptateur écrit avec un adaptateur prouvé. `MARKET_DATA.md` exige que le
 * choix d'un fournisseur découle d'une matrice de couverture exécutée, pas
 * d'une promesse.
 */
export const VERIFICATION_STATUS = [
  /** Aucun appel n'a jamais été fait. Code écrit d'après la documentation. */
  "UNVERIFIED",
  /** Testé uniquement contre des fixtures locales. */
  "FIXTURE_TESTED",
  /** Un appel a réellement abouti sur l'environnement de test du fournisseur. */
  "SANDBOX_TESTED",
  /** Un appel a réellement abouti en production, avec un abonnement actif. */
  "PRODUCTION_TESTED",
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUS)[number];

export const VERIFICATION_LABEL: Readonly<Record<VerificationStatus, string>> = {
  UNVERIFIED: "Non vérifié — jamais appelé",
  FIXTURE_TESTED: "Testé sur fixtures locales uniquement",
  SANDBOX_TESTED: "Appel sandbox réellement effectué",
  PRODUCTION_TESTED: "Appel production réellement effectué",
};

export type ProviderRegistration = {
  readonly id: string;
  readonly label: string;
  readonly capabilities: ProviderCapabilities;
  readonly verification: VerificationStatus;
  /**
   * Ce qui manque pour progresser d'un cran de vérification.
   *
   * `null` seulement pour un fournisseur `PRODUCTION_TESTED`.
   */
  readonly blockedBy: string | null;
  /** Nom de la variable d'environnement portant la clé, jamais sa valeur. */
  readonly apiKeyEnvVar: string | null;
  readonly documentationUrl: string;
  /** Instancie l'adaptateur, ou `null` si sa clé est absente. */
  readonly create: (env: Readonly<Record<string, string | undefined>>) => MarketDataProvider | null;
};

/** Registre des fournisseurs connus, par identifiant. */
export class ProviderRegistry {
  private readonly registrations = new Map<string, ProviderRegistration>();

  register(registration: ProviderRegistration): this {
    if (this.registrations.has(registration.id)) {
      throw new Error(`Fournisseur déjà enregistré : ${registration.id}`);
    }
    this.registrations.set(registration.id, registration);
    return this;
  }

  list(): readonly ProviderRegistration[] {
    return [...this.registrations.values()];
  }

  get(id: string): ProviderRegistration | undefined {
    return this.registrations.get(id);
  }

  /**
   * Fournisseurs réellement instanciables dans cet environnement.
   *
   * Un fournisseur dont la clé manque n'est pas une erreur : il est simplement
   * absent, et l'écran d'état des fournisseurs l'indique.
   */
  available(env: Readonly<Record<string, string | undefined>>): readonly MarketDataProvider[] {
    return this.list()
      .map((registration) => registration.create(env))
      .filter((provider): provider is MarketDataProvider => provider !== null);
  }

  /**
   * Fournisseurs capables de traiter une classe d'actifs, du plus fiable au
   * moins fiable.
   *
   * L'ordre suit le statut de vérification : un adaptateur jamais appelé ne
   * doit pas passer devant un adaptateur éprouvé.
   */
  forAssetType(
    assetType: AssetType,
    env: Readonly<Record<string, string | undefined>>,
  ): readonly MarketDataProvider[] {
    const rank: Readonly<Record<VerificationStatus, number>> = {
      PRODUCTION_TESTED: 0,
      SANDBOX_TESTED: 1,
      FIXTURE_TESTED: 2,
      UNVERIFIED: 3,
    };

    return this.list()
      .filter((registration) => registration.capabilities.assetTypes.includes(assetType))
      .sort((a, b) => rank[a.verification] - rank[b.verification])
      .map((registration) => registration.create(env))
      .filter((provider): provider is MarketDataProvider => provider !== null);
  }
}
