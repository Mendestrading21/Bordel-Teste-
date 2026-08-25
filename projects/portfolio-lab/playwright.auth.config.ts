import { defineConfig, devices } from "@playwright/test";

/**
 * Voie de test de l'authentification.
 *
 * Séparée de la voie principale parce qu'elle exige l'inverse de celle-ci : un
 * serveur en mode **base de données**, avec un propriétaire et une phrase
 * secrète configurés. Le mode démonstration délivre une identité fixe et
 * court-circuiterait exactement ce qui est vérifié ici.
 *
 * Le serveur n'est pas démarré par Playwright : les trois secrets viennent de
 * l'environnement de l'exécutant, jamais du dépôt.
 */
export default defineConfig({
  testDir: "./tests/auth",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: process.env["PORTFOLIO_LAB_AUTH_BASE_URL"] ?? "http://localhost:3101",
    ...devices["Desktop Chrome"],
    ...(process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE"] === undefined
      ? {}
      : { launchOptions: { executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE"] } }),
  },
});
