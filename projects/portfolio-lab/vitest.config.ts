import { defineConfig } from "vitest/config";

/**
 * Deux projets de test distincts pour que `test:unit` et `test:integration`
 * aient un sens dès le Lot 01.
 *
 * - `unit` : logique pure, aucun accès réseau ni base.
 * - `integration` : composants qui ouvrent un socket local, lisent un fichier
 *   ou parleront à PostgreSQL. Aucun appel à une API fournisseur payante, dans
 *   aucun des deux projets.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
          // Le seul test de `apps/*/src` qui ouvre un socket : il relève de
          // l'intégration. Énumérer les fichiers unitaires un par un ferait
          // silencieusement oublier tout nouveau test.
          exclude: [
            "**/node_modules/**",
            // Ces deux suites ouvrent de vraies sockets : elles relèvent de
            // l'intégration.
            "apps/market-gateway/src/server.test.ts",
            "apps/market-gateway/src/live/ws-server.test.ts",
          ],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          include: [
            "apps/market-gateway/src/server.test.ts",
            "apps/market-gateway/src/live/ws-server.test.ts",
            "tests/integration/**/*.test.ts",
          ],
          environment: "node",
        },
      },
    ],
    // Horloge et fuseau déterministes : les tests financiers ne doivent jamais
    // dépendre du fuseau de la machine qui les exécute.
    env: { TZ: "UTC" },
    clearMocks: true,
    restoreMocks: true,
  },
});
