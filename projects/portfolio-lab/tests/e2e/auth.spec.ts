import { expect, test } from "@playwright/test";

/**
 * État d'authentification affiché par l'application.
 *
 * Ces parcours tournent sans Supabase configuré — l'état actuel du dépôt. Ils
 * vérifient précisément ce qui doit se passer dans ce cas : l'application reste
 * utilisable, explique son état, et n'affiche aucune donnée.
 */
test.describe("session non authentifiée", () => {
  test("l'accueil annonce l'état de configuration sans planter", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Accueil");
    const notice = page.getByRole("status");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/Configuration requise|Non connecté|Session expirée/);
  });

  test("aucun chiffre de patrimoine n'est affiché avant authentification", async ({ page }) => {
    await page.goto("/");
    const body = (await page.textContent("body")) ?? "";
    // Aucun montant en CHF ne doit apparaître : ni vrai, ni de démonstration.
    expect(body).not.toMatch(/CHF\s*[\d'’]/);
    await expect(page.getByRole("heading", { name: "Patrimoine privé" })).toBeVisible();
  });

  test("le message explique que rien n'est affiché sans session", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/visibles qu'une fois votre session ouverte/)).toBeVisible();
  });

  test("aucune clé Supabase de type service_role n'atteint le navigateur", async ({ page }) => {
    await page.goto("/");
    const html = await page.content();
    expect(html).not.toContain("service_role");
    expect(html).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  test("aucune chaîne de connexion PostgreSQL n'est exposée", async ({ page }) => {
    await page.goto("/");
    const html = await page.content();
    expect(html).not.toMatch(/postgres(ql)?:\/\//);
    expect(html).not.toContain("DATABASE_URL");
  });

  test("le bandeau d'état est annoncé aux lecteurs d'écran", async ({ page }) => {
    await page.goto("/");
    // `role="status"` implique aria-live=polite : le changement d'état est
    // annoncé sans interrompre la lecture en cours.
    await expect(page.getByRole("status")).toHaveCount(1);
  });
});
