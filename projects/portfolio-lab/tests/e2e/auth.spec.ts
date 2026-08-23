import { expect, test } from "@playwright/test";

/*
 * En mode démonstration, des données sont volontairement affichées sans
 * session : ces parcours décrivent l'état opposé et n'y ont pas de sens.
 */
const demoMode = process.env["PORTFOLIO_LAB_DEMO_MODE"] === "true";
test.skip(demoMode, "Parcours réservés au mode sans données");

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
    // L'invariant est là : aucun montant en CHF, ni vrai ni de démonstration.
    expect(body).not.toMatch(/CHF\s*[\d'’]/);
    await expect(page.getByRole("heading", { name: "Patrimoine total" })).toHaveCount(0);
  });

  test("explique son état plutôt que de laisser un écran muet", async ({ page }) => {
    await page.goto("/");
    /*
     * Deux états sont légitimes ici selon la configuration : « patrimoine privé »
     * quand une base existe mais qu'aucune session n'est ouverte, « données
     * indisponibles » quand aucune source n'est configurée. Le test vérifie
     * que l'un des deux est présenté, jamais un écran vide sans explication.
     */
    const explanations = page.getByRole("heading", {
      name: /Patrimoine privé|Données indisponibles/,
    });
    await expect(explanations).toHaveCount(1);
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
    /*
     * C'est la *valeur* qui est sensible, pas le nom de la variable : un
     * message d'installation peut légitimement citer `DATABASE_URL`, alors
     * qu'une chaîne `postgresql://...` contiendrait un mot de passe.
     */
    expect(html).not.toMatch(/postgres(ql)?:\/\//);
    expect(html).not.toMatch(/DATABASE_URL\s*=\s*\S/);
  });

  test("le bandeau d'état est annoncé aux lecteurs d'écran", async ({ page }) => {
    await page.goto("/");
    // `role="status"` implique aria-live=polite : le changement d'état est
    // annoncé sans interrompre la lecture en cours.
    await expect(page.getByRole("status")).toHaveCount(1);
  });
});
