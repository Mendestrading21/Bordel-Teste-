import type { EnvRecord } from "@/lib/auth/config";

/**
 * Mode d'exécution de la couche de données.
 *
 * PortfolioLab doit être utilisable en local avant qu'un projet Supabase
 * existe. Le mode démonstration remplace donc l'authentification par un
 * utilisateur fixe — mais il est verrouillé par deux conditions cumulatives,
 * et l'interface l'annonce en permanence.
 *
 * Sans ces garde-fous, un déploiement mal configuré servirait les données de
 * n'importe qui sans authentification.
 */
export type DataMode =
  | { readonly kind: "demo"; readonly userId: string }
  | { readonly kind: "database" }
  | { readonly kind: "unavailable"; readonly reason: string };

/** Utilisateur du seed de démonstration. */
export const DEMO_USER_ID = "00000000-0000-4000-8000-0000000dec00";

export class DemoModeInProductionError extends Error {
  constructor() {
    super(
      "PORTFOLIO_LAB_DEMO_MODE ne peut pas être activé en production : " +
        "il contournerait l'authentification.",
    );
    this.name = "DemoModeInProductionError";
  }
}

/**
 * Détermine le mode courant.
 *
 * Lève plutôt que de dégrader silencieusement si le mode démonstration est
 * demandé en production : échouer au démarrage est très préférable à servir
 * des données sans authentification.
 */
export function resolveDataMode(env: EnvRecord = process.env): DataMode {
  const demoRequested = env["PORTFOLIO_LAB_DEMO_MODE"] === "true";
  const isProduction = env["NODE_ENV"] === "production";

  if (demoRequested && isProduction) {
    throw new DemoModeInProductionError();
  }

  if (demoRequested) {
    return { kind: "demo", userId: DEMO_USER_ID };
  }

  if (typeof env["DATABASE_URL"] === "string" && env["DATABASE_URL"] !== "") {
    return { kind: "database" };
  }

  return {
    kind: "unavailable",
    reason:
      "Aucune base de données configurée. Renseigner DATABASE_URL, ou activer " +
      "PORTFOLIO_LAB_DEMO_MODE=true pour explorer l'application avec le jeu de démonstration.",
  };
}

/** `true` si l'interface doit afficher le bandeau de démonstration. */
export function isDemoMode(mode: DataMode): mode is Extract<DataMode, { kind: "demo" }> {
  return mode.kind === "demo";
}
