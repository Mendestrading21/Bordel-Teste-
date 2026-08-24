/**
 * Captures d'écran de revue visuelle.
 *
 * Sert à produire les paires AVANT / APRÈS de chaque lot de la refonte Design
 * V2. Une revue de design qui ne repose que sur la lecture du diff CSS ne voit
 * pas ce qui compte : ce qui tient dans le premier écran, ce qui déborde, ce
 * qui se retrouve tronqué.
 *
 * Le serveur doit déjà tourner sur `BASE_URL` — le script ne le démarre pas,
 * pour qu'une même instance serve les deux campagnes de captures et que la
 * comparaison ne mélange pas deux builds.
 *
 * Usage : node scripts/design-shots.mjs <dossier-de-sortie> [url-de-base]
 */
import { mkdir } from "node:fs/promises";

import { chromium } from "@playwright/test";

const OUT = process.argv[2];
const BASE_URL = process.argv[3] ?? "http://127.0.0.1:3100";

if (OUT === undefined) {
  console.error("Usage : node scripts/design-shots.mjs <dossier-de-sortie> [url-de-base]");
  process.exit(1);
}

/**
 * Les trois tailles exigées par la revue. Le format iPhone 390 est le plus
 * contraignant et sert de référence ; le desktop est capturé en pleine hauteur
 * pour montrer la page entière plutôt que le seul premier écran.
 */
const VIEWPORTS = [
  { name: "390x844", width: 390, height: 844, fullPage: false },
  { name: "430x932", width: 430, height: 932, fullPage: false },
  { name: "desktop", width: 1280, height: 900, fullPage: true },
];

const ROUTES = [
  { name: "accueil", path: "/" },
  { name: "positions", path: "/positions" },
  { name: "ajouter", path: "/ajouter" },
  { name: "analyse", path: "/analyse" },
  { name: "reglages", path: "/reglages" },
  { name: "fonds", path: "/fonds" },
  { name: "option", path: "/ajouter/option" },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  ...(process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE"] === undefined
    ? {}
    : { executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE"] }),
});

let written = 0;

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    locale: "fr-CH",
    timezoneId: "Europe/Zurich",
  });
  const page = await context.newPage();

  for (const route of ROUTES) {
    await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "networkidle" });
    // Laisse retomber les transitions d'entrée avant de figer l'image.
    await page.waitForTimeout(350);
    await page.screenshot({
      path: `${OUT}/${viewport.name}-${route.name}.png`,
      fullPage: viewport.fullPage,
    });
    written += 1;
  }

  // La fiche détaillée n'a pas d'URL stable : on l'atteint par la liste.
  await page.goto(`${BASE_URL}/positions`, { waitUntil: "networkidle" });
  const first = page.getByRole("main").getByRole("link").first();
  if ((await first.count()) > 0) {
    await first.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(350);
    await page.screenshot({
      path: `${OUT}/${viewport.name}-detail.png`,
      fullPage: viewport.fullPage,
    });
    written += 1;
  } else {
    // Le signaler plutôt que de produire silencieusement une campagne
    // incomplète : une capture manquante se remarque mal dans un dossier.
    console.warn(`[${viewport.name}] aucune position : fiche détaillée non capturée`);
  }

  await context.close();
}

await browser.close();
console.log(`${written} captures écrites dans ${OUT}`);
