import { expect, test } from "@playwright/test";

/**
 * Parcours complets sur un portefeuille peuplé.
 *
 * Ces tests n'existent que si le mode démonstration est actif et qu'une base
 * contenant le seed est disponible ; `playwright.config.ts` les exclut sinon,
 * plutôt que de les laisser échouer sur un portefeuille vide.
 *
 * Le portefeuille de démonstration vaut 32 343.8925 CHF — total calculé à la
 * main dans `tests/integration/demo-valuation.test.ts`.
 */
const TOTAL_CHF = "32'343.89";

test.describe("tableau de bord", () => {
  test("affiche le patrimoine total consolidé en CHF", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Patrimoine total" })).toBeVisible();
    await expect(page.getByText(TOTAL_CHF)).toBeVisible();
  });

  test("annonce en permanence que les données sont fictives", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("note");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Mode démonstration");
    await expect(banner).toContainText("fictifs");
  });

  test("ne présente aucun cours comme étant en direct", async ({ page }) => {
    await page.goto("/");
    const body = (await page.textContent("body")) ?? "";
    expect(body).not.toContain("En direct");
    // La fraîcheur du portefeuille suit sa position la plus dégradée.
    await expect(page.getByText("Manuel").first()).toBeVisible();
  });

  test("explique pourquoi la variation du jour n'est pas calculable", async ({ page }) => {
    await page.goto("/");
    // Le fonds n'a pas de clôture précédente : un total partiel serait trompeur.
    await expect(page.getByText(/Non calculable/)).toBeVisible();
  });

  test("affiche P&L latent, performance et capital investi", async ({ page }) => {
    await page.goto("/");
    for (const label of ["P&L latent", "Performance", "Capital investi"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });
});

test.describe("liste des positions", () => {
  test("affiche les six positions de démonstration", async ({ page }) => {
    await page.goto("/positions");
    // Scopé au contenu principal : la barre de navigation est elle aussi une
    // liste de liens et serait comptée sinon.
    const items = page.getByRole("main").getByRole("listitem");
    await expect(items).toHaveCount(6);
  });

  test("chaque position porte un badge de fraîcheur", async ({ page }) => {
    await page.goto("/positions");
    const badges = page.getByText(/Manuel|Dernière NAV|Donnée périmée|Indisponible/);
    expect(await badges.count()).toBeGreaterThanOrEqual(6);
  });

  test("le fonds affiche « Dernière NAV » et jamais un cours intraday", async ({ page }) => {
    await page.goto("/positions");
    const fund = page.getByRole("link", { name: /Démo Fonds Équilibré/ });
    await expect(fund).toContainText("Dernière NAV");
  });
});

test.describe("détail d'une position", () => {
  test("expose la provenance complète de la donnée", async ({ page }) => {
    await page.goto("/positions");
    await page.getByRole("link", { name: /Démo Technologies CALL/ }).click();

    await expect(page.getByRole("heading", { level: 1 })).toContainText("CALL");
    for (const label of [
      "Méthode de valorisation",
      "Fournisseur",
      "Horodatage du cours",
      "Taux de change appliqué",
      "Version du moteur de calcul",
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("affiche le multiplicateur du contrat d'option", async ({ page }) => {
    await page.goto("/positions");
    await page.getByRole("link", { name: /Démo Technologies CALL/ }).click();
    await expect(page.getByText("Multiplicateur", { exact: true })).toBeVisible();
    // 2 contrats × 100 × 6.20 USD = 1 240 USD
    await expect(page.getByText("1'240.00")).toBeVisible();
  });

  test("répond 404 pour une position inexistante", async ({ page }) => {
    const response = await page.goto("/positions/11111111-1111-4111-8111-111111111111");
    expect(response?.status()).toBe(404);
  });
});

test.describe("analyse", () => {
  test("répartit l'exposition par classe, compte et devise", async ({ page }) => {
    await page.goto("/analyse");
    for (const title of ["Par classe d'actifs", "Par compte", "Par devise de cotation"]) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
  });

  test("double chaque barre d'une valeur chiffrée", async ({ page }) => {
    await page.goto("/analyse");
    // Les graphiques ne remplacent jamais les chiffres.
    await expect(page.getByText(/%/).first()).toBeVisible();
    await expect(page.getByText(/CHF/).first()).toBeVisible();
  });
});

test.describe("comptes", () => {
  test("liste les trois comptes de démonstration", async ({ page }) => {
    await page.goto("/reglages");
    for (const name of ["Démo Actions", "Démo Options", "Démo Fonds"]) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
  });

  test("le formulaire de compte ne demande aucun identifiant bancaire", async ({ page }) => {
    await page.goto("/reglages");
    const form = page.locator("form").filter({ hasText: "Créer le compte" });
    await expect(form.locator('input[type="password"]')).toHaveCount(0);
    // Les champs préfixés `$ACTION_` sont ceux que React injecte pour ses
    // actions serveur ; seuls les champs applicatifs nous intéressent.
    const names = await form
      .locator("input")
      .evaluateAll((nodes) =>
        nodes
          .map((node) => (node as HTMLInputElement).name)
          .filter((name) => !name.startsWith("$ACTION")),
      );
    expect(names.sort()).toEqual(["institutionLabel", "name"]);
    // Aucun champ ne peut recevoir un identifiant bancaire.
    for (const forbidden of ["password", "iban", "login", "pin", "secret", "token"]) {
      expect(names.some((name) => name.toLowerCase().includes(forbidden))).toBe(false);
    }
  });

  test("crée un compte puis le retrouve dans la liste", async ({ page }) => {
    await page.goto("/reglages");
    const unique = `Compte test ${Date.now()}`;
    await page.getByLabel("Nom du compte").fill(unique);
    await page.getByRole("button", { name: "Créer le compte" }).click();
    await expect(page.getByRole("status")).toContainText("créé");
    await expect(page.getByText(unique, { exact: true })).toBeVisible();
  });
});

test.describe("ajout d'une position", () => {
  test("le formulaire propose comptes et instruments", async ({ page }) => {
    await page.goto("/ajouter");
    await expect(page.getByLabel("Compte")).toBeVisible();
    await expect(page.getByLabel("Instrument")).toBeVisible();
    await expect(page.getByLabel("Quantité")).toBeVisible();
    await expect(page.getByLabel("Coût moyen unitaire")).toBeVisible();
  });

  test("les champs de montant ne sont pas de type number", async ({ page }) => {
    await page.goto("/ajouter");
    // `type="number"` accepte la notation exponentielle et normalise selon la
    // locale du navigateur : deux comportements indésirables ici.
    await expect(page.getByLabel("Quantité")).toHaveAttribute("inputmode", "decimal");
    await expect(page.getByLabel("Quantité")).toHaveAttribute("type", "text");
  });

  test("refuse une quantité nulle avec un message explicite", async ({ page }) => {
    await page.goto("/ajouter");
    await page.getByLabel("Compte").selectOption({ index: 1 });
    await page.getByLabel("Instrument").selectOption({ index: 1 });
    await page.getByLabel("Quantité").fill("0");
    await page.getByLabel("Coût moyen unitaire").fill("100");
    await page.getByRole("button", { name: "Enregistrer la position" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText(/quantité nulle/)).toBeVisible();
  });

  test("annonce qu'aucune recherche fournisseur n'existe encore", async ({ page }) => {
    await page.goto("/ajouter");
    await expect(page.getByText(/Lot 04/)).toBeVisible();
  });
});
