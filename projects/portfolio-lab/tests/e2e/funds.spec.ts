import { expect, test } from "@playwright/test";

/**
 * Écran des fonds de placement.
 *
 * Critère d'acceptation du Lot 06 : chaque fonds couvert affiche la bonne
 * classe, la bonne devise, la dernière NAV et sa date.
 */
test.describe("fonds de placement", () => {
  test("affiche la NAV, sa date, la classe de parts et la devise", async ({ page }) => {
    await page.goto("/fonds");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fonds de placement");

    // La NAV et sa date de valeur sont au premier plan.
    await expect(page.getByText("Dernière NAV", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/au \d{2}\.\d{2}\.\d{4}/).first()).toBeVisible();

    /*
     * Les caractéristiques du fonds sont repliées : elles servent à vérifier
     * qu'on regarde la bonne classe de parts, question décisive mais posée une
     * fois. Elles doivent rester atteignables sans quitter l'écran.
     */
    await page.getByText("Caractéristiques du fonds").first().click();
    for (const label of ["Classe de parts", "Devise", "Fréquence de publication"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test("identifie le fonds par son ISIN", async ({ page }) => {
    await page.goto("/fonds");
    // L'ISIN est le seul identifiant distinguant deux classes de parts.
    await expect(page.getByText("XX000000DE35")).toBeVisible();
  });

  test("porte le badge « Dernière NAV » et jamais « En direct »", async ({ page }) => {
    await page.goto("/fonds");
    // Désigné par son attribut : voir la note du même contrôle dans
    // `portfolio.spec.ts`.
    const badge = page.locator('[data-pl-freshness="NAV"]').first();
    await expect(badge).toBeVisible();
    // `toContainText` et non `toHaveText` : le badge porte aussi la source et
    // l'horodatage dans un texte réservé aux lecteurs d'écran.
    await expect(badge).toContainText("Dernière NAV");
    const body = (await page.textContent("body")) ?? "";
    // Un fonds n'a pas de cours intraday.
    expect(body).not.toContain("En direct");
    expect(body).not.toContain("Différé");
  });

  test("explique l'état de la NAV en jours ouvrés", async ({ page }) => {
    await page.goto("/fonds");
    // Un badge « périmé » sans motif ne permettrait pas de distinguer un retard
    // de publication d'une panne de récupération.
    await expect(page.getByText(/jour(s)? ouvré/).first()).toBeVisible();
  });

  test("rappelle qu'aucune NAV n'est interpolée", async ({ page }) => {
    await page.goto("/fonds");
    await expect(page.getByText(/n'est interpolée/)).toBeVisible();
  });

  test("est accessible depuis l'écran Analyse", async ({ page }) => {
    await page.goto("/analyse");
    await page.getByRole("link", { name: /détail des fonds/ }).click();
    await expect(page).toHaveURL(/\/fonds$/);
  });

  test("montre ce qui est détenu, pas seulement la NAV du fonds", async ({ page }) => {
    await page.goto("/fonds");

    /*
     * Un écran « Fonds » qui affiche la NAV sans les parts détenues ne répond
     * qu'à la moitié de la question : la NAV est une donnée de marché, ce que
     * l'on possède est la raison d'ouvrir cet écran.
     */
    const carte = page.getByRole("listitem").filter({ hasText: "Démo Fonds Équilibré" });
    await expect(carte).toContainText("Ma position");
    await expect(carte).toContainText(/parts/);
    // La valeur de la position, distincte de la NAV unitaire.
    await expect(carte).toContainText("15'803.12");
  });

  test("garde la NAV et sa date au premier plan", async ({ page }) => {
    await page.goto("/fonds");
    const carte = page.getByRole("listitem").filter({ hasText: "Démo Fonds Équilibré" });

    await expect(carte).toContainText("Dernière NAV");
    await expect(carte).toContainText("104.83");
    // Une NAV sans sa date de valeur ne dit pas ce qu'elle vaut.
    await expect(carte).toContainText(/au \d{2}\.\d{2}\.\d{4}/);
  });

  test("replie les caractéristiques sans les perdre", async ({ page }) => {
    await page.goto("/fonds");
    const carte = page.getByRole("listitem").filter({ hasText: "Démo Fonds Équilibré" });

    // La classe de parts décide de quel fonds on parle : elle doit rester
    // atteignable, même repliée par défaut.
    await expect(carte.getByText("Classe de parts")).toBeHidden();
    await carte.getByText("Caractéristiques du fonds").click();
    await expect(carte.getByText("Classe de parts")).toBeVisible();
  });

  test("n'affiche aucun débordement horizontal", async ({ page }) => {
    await page.goto("/fonds");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
