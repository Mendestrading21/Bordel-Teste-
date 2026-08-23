/**
 * Point d'entrée des utilitaires de test.
 *
 * Séparé de `index.ts` parce que `contract-suite` importe `vitest` : le laisser
 * dans l'entrée principale forcerait tout consommateur du package — y compris
 * l'application web et les scripts d'outillage — à charger le harnais de test.
 *
 * Importer via `@portfolio-lab/market-data/testing`.
 */
export * from "./contract-suite.js";
