import { expect, test, type Page } from "@playwright/test";

import { colorTokens } from "@portfolio-lab/ui";

const ROUTES = [
  { path: "/", heading: "Accueil" },
  { path: "/positions", heading: "Positions" },
  { path: "/ajouter", heading: "Ajouter un placement" },
  { path: "/analyse", heading: "Analyse" },
  { path: "/reglages", heading: "Réglages" },
] as const;

test.describe("coquille applicative", () => {
  for (const route of ROUTES) {
    test(`${route.path} affiche son titre et la navigation`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(route.heading);
      await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
    });
  }

  test("la navigation basse expose cinq onglets, Ajouter au centre", async ({ page }) => {
    await page.goto("/");
    const links = page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link");
    await expect(links).toHaveCount(5);
    await expect(links.nth(2)).toContainText("Ajouter");
  });

  test("l'onglet actif est signalé par aria-current, pas seulement par la couleur", async ({
    page,
  }) => {
    await page.goto("/positions");
    const nav = page.getByRole("navigation", { name: "Navigation principale" });
    await expect(nav.getByRole("link", { name: /Positions/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.getByRole("link", { name: /Accueil/ })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("la navigation entre onglets fonctionne", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("navigation")
      .getByRole("link", { name: /Analyse/ })
      .click();
    await expect(page).toHaveURL(/\/analyse$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Analyse");
  });
});

test.describe("mise en page", () => {
  test("aucun débordement horizontal", async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route.path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `débordement sur ${route.path}`).toBeLessThanOrEqual(0);
    }
  });

  test("chaque cible tactile de la navigation atteint 44 px", async ({ page }) => {
    await page.goto("/");
    const links = page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link");
    const count = await links.count();
    for (let index = 0; index < count; index += 1) {
      const box = await links.nth(index).boundingBox();
      expect(box, `lien ${index} sans boîte`).not.toBeNull();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});

/**
 * Mise en page en mode installé, sur un iPhone à encoche.
 *
 * Ce mode ne peut pas être atteint par un navigateur de test : il faut avoir
 * ajouté l'application à l'écran d'accueil. Les valeurs de `env(safe-area-*)`
 * y valent 47 à 59 px en haut, contre 0 dans un onglet — et c'est précisément
 * dans cet écart que se cachait le défaut : un padding fixe de 24 px laissait
 * la première ligne de chaque écran sous l'heure et l'îlot dynamique.
 *
 * Les zones sûres passent donc par des variables CSS, redéfinissables. Ces
 * parcours leur donnent les valeurs d'un iPhone réel et vérifient que la mise
 * en page en tient compte.
 */
test.describe("mode installé sur iPhone", () => {
  /** Zones sûres d'un iPhone à îlot dynamique, en portrait. */
  const NOTCH = { top: 59, bottom: 34 };

  async function simulateNotch(page: Page): Promise<void> {
    await page.addStyleTag({
      content: `:root {
        --pl-safe-top: ${NOTCH.top}px;
        --pl-safe-bottom: ${NOTCH.bottom}px;
      }`,
    });
  }

  test("le contenu descend sous la barre d'état", async ({ page }) => {
    await page.goto("/");

    const main = page.locator("#contenu-principal");
    const before = await main.evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingTop));

    await simulateNotch(page);
    const after = await main.evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingTop));

    /*
     * Sans zone sûre, le padding ne bouge pas d'un pixel : c'est exactement
     * l'état d'avant, et le titre restait sous l'heure.
     */
    expect(after - before).toBeCloseTo(NOTCH.top, 0);
  });

  test("le premier titre reste sous l'encoche, jamais dessous", async ({ page }) => {
    await page.goto("/");
    await simulateNotch(page);

    const heading = page.getByRole("heading", { level: 1 }).first();
    const box = await heading.boundingBox();

    expect(box, "le titre principal doit être visible").not.toBeNull();
    // Le haut du titre doit se trouver sous la zone occupée par l'îlot.
    expect(box?.y ?? 0).toBeGreaterThanOrEqual(NOTCH.top);
  });

  test("la barre de navigation garde sa marge basse", async ({ page }) => {
    await page.goto("/");
    await simulateNotch(page);

    const nav = page.getByRole("navigation", { name: "Navigation principale" });
    const padding = await nav.evaluate((node) =>
      Number.parseFloat(getComputedStyle(node).paddingBottom),
    );

    // Sur iPhone, la barre d'accueil occupe le bas de l'écran : sans cette
    // marge, le dernier onglet est à moitié sous le trait.
    expect(padding).toBeCloseTo(NOTCH.bottom, 0);
  });

  test("aucune zone sûre en onglet : rien n'est réservé pour rien", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Navigation principale" });
    const padding = await nav.evaluate((node) =>
      Number.parseFloat(getComputedStyle(node).paddingBottom),
    );

    // `env(..., 0px)` doit retomber sur zéro dans un navigateur ordinaire :
    // réserver une bande vide en haut d'un onglet serait aussi visible que
    // l'inverse.
    expect(padding).toBe(0);
  });
});

test.describe("PWA", () => {
  test("le manifeste est servi et décrit une application installable", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);
    const manifest = (await response.json()) as Record<string, unknown>;
    expect(manifest["display"]).toBe("standalone");
    expect(manifest["start_url"]).toBe("/");
    // Lu depuis le token : le manifeste peint la barre d'état iOS, un endroit
    // qu'aucune capture de l'application ne montre.
    expect(manifest["theme_color"]).toBe(colorTokens.backgroundCanvas);
    expect(Array.isArray(manifest["icons"])).toBe(true);
  });

  test("les icônes déclarées existent", async ({ request }) => {
    for (const icon of [
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/apple-touch-icon.png",
    ]) {
      const response = await request.get(icon);
      expect(response.status(), icon).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/png");
    }
  });

  test("l'application privée refuse l'indexation", async ({ page, request }) => {
    const robots = await request.get("/robots.txt");
    expect(await robots.text()).toContain("Disallow: /");
    await page.goto("/");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});

test.describe("sécurité", () => {
  test("les en-têtes de sécurité sont appliqués", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"]).toBeUndefined();

    const csp = headers["content-security-policy"] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  test("aucune clé de fournisseur n'atteint le navigateur", async ({ page }) => {
    await page.goto("/");
    const html = await page.content();
    for (const marker of [
      "TWELVE_DATA_API_KEY",
      "MASSIVE_API_KEY",
      "EODHD_API_KEY",
      "SERVICE_ROLE",
    ]) {
      expect(html, `${marker} présent dans le HTML`).not.toContain(marker);
    }
  });
});

test.describe("accessibilité", () => {
  test("respecte « animations réduites » sur les éléments réellement animés", async ({
    browser,
  }) => {
    /*
     * Le réglage système doit valoir pour tout l'écran, pas seulement pour les
     * composants qui pensaient à réécrire leur durée. Le test lit la durée
     * calculée par le navigateur, pas la feuille de style : c'est la seule
     * mesure qui prouve que le réglage arrive jusqu'au pixel.
     */
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");

    const durations = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("*")]
        .map((node) => getComputedStyle(node))
        .filter((style) => style.transitionProperty !== "none" && style.transitionProperty !== "")
        .map((style) => style.transitionDuration),
    );

    expect(durations.length).toBeGreaterThan(0);
    for (const duration of durations) {
      // « 0s » sous toutes ses formes ; toute valeur non nulle est un oubli.
      expect(duration.split(",").every((part) => Number.parseFloat(part) === 0)).toBe(true);
    }

    await context.close();
  });

  test("anime réellement lorsque le réglage ne demande rien", async ({ browser }) => {
    // Contrôle négatif : sans lui, le test précédent passerait aussi si plus
    // rien n'était animé nulle part.
    const context = await browser.newContext({ reducedMotion: "no-preference" });
    const page = await context.newPage();
    await page.goto("/");

    const durations = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("*")]
        .map((node) => getComputedStyle(node))
        .filter((style) => style.transitionProperty !== "none" && style.transitionProperty !== "")
        .map((style) => style.transitionDuration),
    );

    expect(durations.some((duration) => Number.parseFloat(duration) > 0)).toBe(true);

    await context.close();
  });
});
