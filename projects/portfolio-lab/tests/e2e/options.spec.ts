import { expect, test } from "@playwright/test";

/**
 * Parcours guidé de sélection d'un contrat d'option.
 *
 * Critère d'acceptation du Lot 07 : une option sélectionnée correspond
 * exactement au contrat du fournisseur, et sa valorisation indique la méthode.
 */
const CHAIN = "/ajouter/option";

test.describe("sélection guidée d'une option", () => {
  test("présente les cinq étapes dans l'ordre", async ({ page }) => {
    await page.goto(CHAIN);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("option");
    await expect(page.getByText("Sous-jacent", { exact: true })).toBeVisible();
    // Les étapes suivantes n'apparaissent qu'une fois la précédente choisie.
    await expect(page.getByText("Sens du contrat")).toHaveCount(0);
  });

  test("dévoile les étapes au fur et à mesure", async ({ page }) => {
    await page.goto(`${CHAIN}?underlying=DEMOT`);
    await expect(page.getByText("Sens du contrat")).toBeVisible();
    await expect(page.getByText("Échéance", { exact: true })).toHaveCount(0);

    await page.goto(`${CHAIN}?underlying=DEMOT&type=CALL`);
    await expect(page.getByText("Échéance", { exact: true })).toBeVisible();
  });

  test("trie les strikes numériquement", async ({ page }) => {
    await page.goto(`${CHAIN}?underlying=DEMOT&type=CALL&expiration=2027-01-15`);
    const strikes = await page.getByRole("link", { name: /^(90|100|110|200)$/ }).allTextContents();
    // Un tri de chaînes placerait « 100 » avant « 90 ».
    expect(strikes).toEqual(["90", "100", "110", "200"]);
  });

  test("affiche le symbole canonique et le multiplicateur du contrat", async ({ page }) => {
    await page.goto(`${CHAIN}?underlying=DEMOT&type=CALL&expiration=2027-01-15&strike=100`);
    await expect(page.getByText("Symbole canonique")).toBeVisible();
    await expect(page.getByText("DEMOT 270115C00100000")).toBeVisible();
    await expect(page.getByText("Multiplicateur")).toBeVisible();
  });

  test("indique toujours la méthode de valorisation retenue", async ({ page }) => {
    await page.goto(`${CHAIN}?underlying=DEMOT&type=CALL&expiration=2027-01-15&strike=100`);
    await expect(page.getByText("Méthode de valorisation")).toBeVisible();
    // Contrat liquide : le milieu de fourchette doit être retenu.
    await expect(page.getByText("Milieu de fourchette bid/ask")).toBeVisible();
  });

  test("explique en français pourquoi le midpoint est écarté", async ({ page }) => {
    // Contrat illiquide : fourchette 0.05 / 1.90.
    await page.goto(`${CHAIN}?underlying=DEMOT&type=CALL&expiration=2027-01-15&strike=200`);
    await expect(page.getByText("Dernier échange").first()).toBeVisible();
    await expect(page.getByText(/fourchette trop large/i)).toBeVisible();
    // L'identifiant interne ne doit jamais atteindre l'utilisateur.
    const body = (await page.textContent("body")) ?? "";
    expect(body).not.toContain("SPREAD_TOO_WIDE");
  });

  test("avertit sur un multiplicateur non standard", async ({ page }) => {
    await page.goto(`${CHAIN}?underlying=DEMOT&type=CALL&expiration=2028-01-21&strike=100`);
    // C'est l'erreur la plus coûteuse du domaine : elle fausse la valeur d'un
    // facteur entier sans rien casser.
    await expect(page.getByText(/Multiplicateur inhabituel/)).toBeVisible();
    await expect(page.getByText(/split/)).toBeVisible();
  });

  test("signale un contrat expiré", async ({ page }) => {
    await page.goto(`${CHAIN}?underlying=DEMOT&type=CALL&expiration=2026-06-19&strike=100`);
    await expect(page.getByText(/arrivé à échéance/)).toBeVisible();
  });

  test("refuse un contrat inexistant sans proposer d'approchant", async ({ page }) => {
    await page.goto(`${CHAIN}?underlying=DEMOT&type=CALL&expiration=2027-01-15&strike=137`);
    await expect(page.getByText(/Aucun contrat ne correspond exactement/)).toBeVisible();
    await expect(page.getByText(/ce serait un autre contrat/)).toBeVisible();
  });

  test("annonce qu'aucune sensibilité n'est calculée", async ({ page }) => {
    await page.goto(`${CHAIN}?underlying=DEMOT&type=CALL&expiration=2027-01-15&strike=100`);
    // « Greeks seulement si sourcés » : un delta issu de nos hypothèses ne
    // serait pas une donnée de marché.
    await expect(page.getByText(/n'en calcule aucune/)).toBeVisible();
  });

  test("affiche les jours restants avant échéance", async ({ page }) => {
    await page.goto(`${CHAIN}?underlying=DEMOT&type=CALL&expiration=2027-01-15&strike=100`);
    await expect(page.getByText("Jours avant échéance")).toBeVisible();
  });

  test("est accessible depuis l'écran Ajouter", async ({ page }) => {
    await page.goto("/ajouter");
    await page.getByRole("link", { name: /Sélection guidée/ }).click();
    await expect(page).toHaveURL(/\/ajouter\/option$/);
  });

  test("n'affiche aucun débordement horizontal", async ({ page }) => {
    await page.goto(`${CHAIN}?underlying=DEMOT&type=CALL&expiration=2027-01-15&strike=100`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
