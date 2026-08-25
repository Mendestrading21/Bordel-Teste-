import { expect, test } from "@playwright/test";

/**
 * Première prise en main, sur une base **vide**.
 *
 * C'est la situation réelle de toute installation : un portefeuille, un
 * compte, et zéro instrument. Le sélecteur du formulaire d'ajout lisait la
 * table locale : l'utilisateur se connectait, cliquait « Ajouter », et
 * trouvait une liste sans aucune entrée — sans qu'aucune erreur ne l'explique.
 *
 * Ce parcours va jusqu'au bout : connexion, création d'un instrument, saisie
 * d'une position, et vérification qu'elle s'affiche.
 */

const PASSPHRASE = "phrase-de-test-suffisamment-longue";

test.describe.configure({ mode: "serial" });

test.describe("première prise en main", () => {
  test("se connecter", async ({ page }) => {
    await page.goto("/connexion");
    await page.getByLabel("Phrase secrète").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Entrer" }).click();
    await page.waitForURL("**/");
  });

  test("l'écran d'ajout propose de créer un instrument au lieu d'une liste vide", async ({
    page,
  }) => {
    await page.goto("/connexion");
    await page.getByLabel("Phrase secrète").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Entrer" }).click();
    await page.waitForURL("**/");

    await page.goto("/ajouter");

    await expect(page.getByText("Nouvel instrument")).toBeVisible();
    // Le sélecteur vide ne doit pas être proposé : il n'aurait rien à offrir.
    await expect(page.getByLabel("Instrument", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Qu'ajoutez-vous ?")).toHaveCount(0);
  });

  test("créer un instrument avec son identifiant, puis une position dessus", async ({ page }) => {
    await page.goto("/connexion");
    await page.getByLabel("Phrase secrète").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Entrer" }).click();
    await page.waitForURL("**/");

    await page.goto("/ajouter");

    await page.getByLabel("Nom").fill("Apple Inc");
    await page.getByLabel("Classe").selectOption("STOCK");
    await page.getByLabel("Devise").selectOption("USD");
    await page.getByLabel("Symbole court").fill("AAPL");
    await page.getByLabel("Type").selectOption("TICKER");
    await page.getByLabel("Valeur").fill("AAPL");
    await page.getByRole("button", { name: "Créer l'instrument" }).click();

    /*
     * Le message doit annoncer que le cours sera cherché : c'est la
     * contrepartie de l'identifiant saisi, et le taire laisserait
     * l'utilisateur ignorer ce qu'il vient d'obtenir.
     */
    await expect(page.getByText(/cours sera cherché/u)).toBeVisible();

    /*
     * Le référentiel n'est plus vide : le parcours d'ajout complet apparaît,
     * **sans rechargement**. Le formulaire d'instrument n'est pas démonté au
     * passage — sinon la confirmation ci-dessus disparaîtrait avec lui.
     */
    // Le parcours guidé demande d'abord la classe : c'est lui qui fait
    // apparaître le sélecteur d'instrument.
    await page.getByRole("button", { name: /^Action/u }).click();
    await expect(page.getByLabel("Instrument", { exact: true })).toBeVisible();

    // `selectOption` attend un libellé exact : le sélecteur affiche le nom
    // suivi de la devise.
    await page.getByLabel("Instrument", { exact: true }).selectOption({ label: "Apple Inc · USD" });
    await page.getByLabel("Quantité").fill("10");
    await page.getByLabel(/Coût moyen/u).fill("180");
    await page.getByRole("button", { name: /Enregistrer|Ajouter/u }).click();

    await page.goto("/positions");
    await expect(page.getByText("Apple Inc")).toBeVisible();
  });

  test("un instrument sans identifiant est annoncé comme manuel", async ({ page }) => {
    await page.goto("/connexion");
    await page.getByLabel("Phrase secrète").fill(PASSPHRASE);
    await page.getByRole("button", { name: "Entrer" }).click();
    await page.waitForURL("**/");

    await page.goto("/ajouter");
    await page.getByLabel("Nom").fill("Bien immobilier Genève");
    await page.getByLabel("Classe").selectOption("OTHER");
    await page.getByLabel("Devise").selectOption("CHF");
    await page.getByRole("button", { name: "Créer l'instrument" }).click();

    // Dit franchement ce qui va se passer, plutôt que de laisser la découverte
    // pour le premier rafraîchissement muet.
    await expect(page.getByText(/restera en saisie manuelle/u)).toBeVisible();
  });
});
