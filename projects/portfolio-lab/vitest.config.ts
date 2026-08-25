import { fileURLToPath } from "node:url";

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

/**
 * Alias `@/` de l'application web, repris de son `tsconfig.json`.
 *
 * Sans lui, tout module important par `@/` était intestable : le fichier se
 * compilait et se déployait, mais aucune suite ne pouvait le charger. Les rares
 * tests du dossier `apps/web` contournaient la difficulté par des imports
 * relatifs — ce qui excluait de fait les routes et les composants, c'est-à-dire
 * précisément le code qui parle au réseau et à la session.
 */
const WEB_ALIAS = {
  "@/": `${fileURLToPath(new URL("./apps/web/src", import.meta.url))}/`,
  /*
   * `server-only` est un marqueur qui **lève** dès qu'il est chargé hors d'un
   * contexte serveur. Le paquet publie pour cela deux fichiers et choisit entre
   * eux par la condition d'export `react-server`, que Vitest ne pose pas.
   *
   * Le résoudre vers `empty.js` — exactement ce que reçoit un composant serveur
   * — permet de tester les routes sans affaiblir la garantie : la frontière est
   * toujours appliquée par Next au moment du bundle, qui reste seul juge de ce
   * qui part au navigateur.
   */
  "server-only": fileURLToPath(new URL("./tests/helpers/server-only-stub.ts", import.meta.url)),
};

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
        resolve: { alias: WEB_ALIAS },
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
        resolve: { alias: WEB_ALIAS },
      },
    ],
    // Horloge et fuseau déterministes : les tests financiers ne doivent jamais
    // dépendre du fuseau de la machine qui les exécute.
    env: { TZ: "UTC" },
    clearMocks: true,
    restoreMocks: true,
  },
});
