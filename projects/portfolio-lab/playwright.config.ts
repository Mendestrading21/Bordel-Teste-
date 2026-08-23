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

/**
 * `true` quand la suite doit couvrir les parcours avec données.
 *
 * Ces parcours ont besoin d'un portefeuille peuplé, donc du mode démonstration
 * et d'une base contenant le seed.
 */
const demoMode = process.env["PORTFOLIO_LAB_DEMO_MODE"] === "true";

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
  // Les parcours avec données ne sont collectés que lorsque le mode
  // démonstration est actif ; sinon ils échoueraient sur un portefeuille vide.
  testIgnore: demoMode ? [] : ["**/portfolio.spec.ts"],
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
    /*
     * Le mode démonstration est volontairement refusé en production — il
     * contournerait l'authentification. `next start` force
     * `NODE_ENV=production`, donc les parcours de démonstration tournent sur le
     * serveur de développement, seule configuration où ce mode est autorisé.
     *
     * Les autres parcours tournent sur le build de production : c'est là que le
     * service worker, les en-têtes et le manifeste se comportent réellement.
     */
    command: demoMode
      ? "pnpm --filter @portfolio-lab/web run dev"
      : "pnpm --filter @portfolio-lab/web run start",
    url: BASE_URL,
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
    env: {
      ...(demoMode ? { PORTFOLIO_LAB_DEMO_MODE: "true" } : {}),
      ...(process.env["DATABASE_URL"] === undefined
        ? {}
        : { DATABASE_URL: process.env["DATABASE_URL"] }),
    },
  },
});
