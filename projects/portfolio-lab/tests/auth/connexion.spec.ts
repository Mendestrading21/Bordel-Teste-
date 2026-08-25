import { expect, test } from "@playwright/test";

/**
 * Parcours de connexion, en mode base de données.
 *
 * Ces cas ne peuvent pas tourner dans la voie de démonstration : celle-ci
 * délivre une identité fixe et court-circuite précisément ce qu'il faut
 * vérifier. Ils s'exécutent contre un serveur lancé en mode base, avec un
 * propriétaire et une phrase secrète configurés.
 *
 * C'est le maillon qui manquait : jusqu'ici, treize points d'accès de
 * l'application ne délivraient d'identité qu'en démonstration. Déployée,
 * l'application était vide et rien ne pouvait la remplir.
 */

const PASSPHRASE = "phrase-de-test-suffisamment-longue";

test.describe("connexion du propriétaire", () => {
  test("sans session, le patrimoine reste fermé et l'entrée est proposée", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Patrimoine privé")).toBeVisible();
    // Aucune position ne doit fuir avant authentification.
    await expect(page.getByText("Démo Industrie SA")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Se connecter" })).toBeVisible();
  });

  test("une phrase incorrecte est refusée sans rien dire de plus", async ({ page }) => {
    await page.goto("/connexion");
    await page.getByLabel("Phrase secrète").fill("mauvaise-phrase-mais-longue");
    await page.getByRole("button", { name: "Entrer" }).click();

    const error = page.locator("[data-pl-login-error]");
    await expect(error).toBeVisible();
    // Un message qui distinguerait les cas dirait à un visiteur s'il approche.
    await expect(error).toHaveText("Phrase secrète incorrecte.");
    await expect(page).toHaveURL(/\/connexion/u);
  });

  test("la bonne phrase ouvre le portefeuille", async ({ page }) => {
    await page.goto("/connexion");
    await page.getByLabel("Phrase secrète").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Entrer" }).click();

    await page.waitForURL("**/");
    // La preuve que tout le chemin fonctionne : une position réelle, lue en
    // base sous l'identité du propriétaire, apparaît à l'écran.
    await expect(page.getByText("Patrimoine privé")).toHaveCount(0);
    await page.goto("/positions");
    await expect(page.getByText("Démo Industrie SA")).toBeVisible();
  });

  test("le cookie de session n'est pas lisible depuis JavaScript", async ({ page }) => {
    await page.goto("/connexion");
    await page.getByLabel("Phrase secrète").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Entrer" }).click();
    await page.waitForURL("**/");

    /*
     * `HttpOnly` : une injection de script ne doit pas pouvoir exfiltrer la
     * session. C'est la seule protection qui tienne si jamais du code tiers
     * s'exécutait dans la page.
     */
    const visible = await page.evaluate(() => document.cookie);
    expect(visible).not.toContain("pl_session");
  });

  test("la déconnexion referme l'accès", async ({ page }) => {
    await page.goto("/connexion");
    await page.getByLabel("Phrase secrète").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Entrer" }).click();
    await page.waitForURL("**/");

    await page.goto("/reglages");
    await page.getByRole("button", { name: "Fermer la session" }).click();
    await page.waitForURL("**/connexion");

    await page.goto("/");
    await expect(page.getByText("Patrimoine privé")).toBeVisible();
  });
});

/**
 * Redirection des écrans protégés.
 *
 * Cinq pages ne verifiaient rien. Elles ne fuyaient pas — l'identite etait
 * nulle et RLS bloquait le reste — mais elles affichaient « aucune position »
 * a quelqu'un de simplement deconnecte, qui pouvait croire ses donnees
 * perdues. Ces parcours verifient le comportement reel dans un navigateur, la
 * ou la suite unitaire ne verifie que la presence de la garde dans le source.
 */
test.describe("écrans protégés", () => {
  const PROTECTED = [
    "/positions",
    "/analyse",
    "/fonds",
    "/ajouter",
    "/reglages",
    "/positions/d0000000-0000-4000-8000-000000000001",
  ] as const;

  for (const route of PROTECTED) {
    test(`${route} renvoie vers la connexion sans session`, async ({ page }) => {
      await page.goto(route);

      await expect(page).toHaveURL(/\/connexion/u);
      await expect(page.getByLabel("Phrase secrète")).toBeVisible();
    });
  }

  test("aucune donnée de portefeuille n'apparaît avant connexion", async ({ page }) => {
    for (const route of PROTECTED) {
      const response = await page.goto(route);
      const body = (await page.textContent("body")) ?? "";

      // Ni le nom d'un instrument, ni un montant consolidé.
      expect(body, `${route} laisse voir un instrument`).not.toContain("Démo Industrie");
      expect(response?.status(), `${route} répond en erreur`).toBeLessThan(400);
    }
  });

  test("une fois connecté, les écrans s'ouvrent", async ({ page }) => {
    await page.goto("/connexion");
    await page.getByLabel("Phrase secrète").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Entrer" }).click();
    await page.waitForURL("**/");

    for (const route of ["/positions", "/analyse", "/reglages"] as const) {
      await page.goto(route);
      // La redirection ne doit pas se déclencher une fois la session ouverte :
      // une garde trop zélée est aussi cassée qu'une garde absente.
      await expect(page, `${route} redirige alors que la session est ouverte`).not.toHaveURL(
        /\/connexion/u,
      );
    }
  });
});
