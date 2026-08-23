import { expect, test } from "@playwright/test";

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

test.describe("PWA", () => {
  test("le manifeste est servi et décrit une application installable", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);
    const manifest = (await response.json()) as Record<string, unknown>;
    expect(manifest["display"]).toBe("standalone");
    expect(manifest["start_url"]).toBe("/");
    expect(manifest["theme_color"]).toBe("#0B0E11");
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
