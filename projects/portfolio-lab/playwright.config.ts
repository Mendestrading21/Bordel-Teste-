import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Binaire Chromium à utiliser.
 *
 * En CI, `playwright install chromium` télécharge la build correspondant
 * exactement à la version de `@playwright/test` et cette variable reste vide.
 * Sur un poste ou un conteneur qui fournit déjà un Chromium — cas des
 * environnements pré-provisionnés — la pointer ici évite un second
 * téléchargement et une incompatibilité de numéro de build.
 */
const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE"];

const chromium = {
  ...devices["Desktop Chrome"],
  ...(executablePath ? { launchOptions: { executablePath } } : {}),
};

/**
 * Parcours E2E sur les tailles réellement ciblées par le produit.
 *
 * L'application est buildée puis servie en mode production : c'est la seule
 * configuration où le service worker, les en-têtes de sécurité et le manifeste
 * se comportent comme en usage réel.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    locale: "fr-CH",
    timezoneId: "Europe/Zurich",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "iphone-390",
      use: { ...chromium, viewport: { width: 390, height: 844 } },
    },
    {
      name: "iphone-430",
      use: { ...chromium, viewport: { width: 430, height: 932 } },
    },
    {
      name: "tablette",
      use: { ...chromium, viewport: { width: 768, height: 1024 } },
    },
    {
      name: "desktop",
      use: { ...chromium, viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: "pnpm --filter @portfolio-lab/web run start",
    url: BASE_URL,
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
