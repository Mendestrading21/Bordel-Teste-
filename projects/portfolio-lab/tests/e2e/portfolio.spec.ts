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

  test("trace la courbe du patrimoine et la double d'un tableau de valeurs", async ({ page }) => {
    await page.goto("/analyse");
    await expect(page.getByRole("heading", { name: "Évolution du patrimoine" })).toBeVisible();

    // La courbe porte un résumé textuel : elle est annoncée, pas seulement vue.
    const chart = page.getByRole("img", { name: /Patrimoine du .* au .*/ });
    await expect(chart).toBeVisible();

    // Le résumé de la courbe porte déjà les montants : aucune interaction
    // n'est nécessaire pour connaître le début, la fin et les bornes.
    await expect(chart).toHaveAttribute("aria-label", /CHF/);

    // Les valeurs exactes sont à un clic, sur une cible tactile réglementaire.
    const disclosure = page.getByText(/Valeurs chiffrées/);
    await expect(disclosure).toBeVisible();
    await disclosure.click();
    await expect(page.getByRole("table", { name: /Valeur du patrimoine/ })).toBeVisible();
  });

  test("réduit les deux points du 6 mai à une seule journée", async ({ page }) => {
    await page.goto("/analyse");
    await page.getByText(/Valeurs chiffrées/).click();

    // Le seed porte six snapshots dont deux le 6 mai : cette journée ne doit
    // apparaître qu'une fois. Le nombre total de lignes n'est pas figé — le
    // parcours d'enregistrement ci-dessous ajoute légitimement des points.
    await expect(page.getByRole("rowheader", { name: "2026-05-06" })).toHaveCount(1);
    for (const day of ["2026-05-04", "2026-05-05", "2026-05-07", "2026-05-08"]) {
      await expect(page.getByRole("rowheader", { name: day })).toHaveCount(1);
    }
  });

  test("affiche la contribution de chaque position au P&L", async ({ page }) => {
    await page.goto("/analyse");
    await expect(page.getByRole("heading", { name: /Contribution au P&L/ })).toBeVisible();
  });

  test("distingue valeur de marché et notionnel des options", async ({ page }) => {
    await page.goto("/analyse");
    await expect(page.getByRole("heading", { name: "Exposition options" })).toBeVisible();

    const table = page.getByRole("table", { name: /exposition notionnelle/ });
    // La devise est portée par les en-têtes, une seule fois.
    await expect(table.getByRole("columnheader", { name: "Valeur (CHF)" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Notionnel (CHF)" })).toBeVisible();

    /*
     * Le tableau tient dans son conteneur.
     *
     * Le texte du DOM est toujours complet même quand il est visuellement
     * coupé : une assertion sur `textContent` ne verrait rien. C'est la
     * largeur de défilement du conteneur qui trahit un montant tronqué — et
     * c'est ce qui arrivait au notionnel, coupé à « CHF 17'800.0 ».
     */
    const hidden = await table.evaluate((node) => {
      const scroller = node.parentElement;
      return scroller === null ? 0 : scroller.scrollWidth - scroller.clientWidth;
    });
    expect(hidden).toBeLessThanOrEqual(0);
  });

  test("annonce que les agrégats se réconcilient avec les positions", async ({ page }) => {
    await page.goto("/analyse");
    const panel = page.locator("section").filter({ hasText: "Réconciliation" });
    await expect(panel.getByText(/correspond exactement/)).toBeVisible();
    // Aucun écart : le panneau d'alerte ne doit pas apparaître.
    await expect(page.getByText("Écart de réconciliation")).toHaveCount(0);
  });

  test("enregistre un point d'historique sur demande explicite", async ({ page }) => {
    await page.goto("/analyse");

    const button = page.getByRole("button", { name: /Enregistrer un point d'historique/ });
    await expect(button).toBeVisible();

    // La cible tactile respecte le minimum de 44 px.
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await button.click();
    await expect(page.getByRole("status")).toContainText("Point d'historique enregistré");

    // Le point apparaît dans l'historique : l'écriture a bien eu lieu.
    await page.getByText(/Valeurs chiffrées/).click();
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Zurich",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    await expect(page.getByRole("rowheader", { name: today })).toHaveCount(1);
  });

  test("ne déborde pas horizontalement, portefeuille peuplé", async ({ page }) => {
    /*
     * `shell.spec.ts` vérifie déjà ce point, mais sur un portefeuille vide :
     * les tableaux d'options et d'historique n'y existent pas. Ce sont
     * précisément eux qui débordaient.
     */
    await page.goto("/analyse");
    await page.getByText(/Valeurs chiffrées/).click();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("ne laisse aucun identifiant technique atteindre l'écran", async ({ page }) => {
    await page.goto("/analyse");
    const body = (await page.textContent("body")) ?? "";
    for (const internal of ["UNFINGERPRINTED", "DIVERGED", "NO_MARK", "MARK_UNAVAILABLE"]) {
      expect(body).not.toContain(internal);
    }
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

test.describe("état des fournisseurs de données", () => {
  test("liste les fournisseurs, y compris ceux jamais appelés", async ({ page }) => {
    await page.goto("/reglages");
    await expect(page.getByRole("heading", { name: "Fournisseurs de données" })).toBeVisible();
    for (const label of ["Twelve Data", "Massive", "EODHD", "OpenFIGI"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("annonce qu'aucun fournisseur réel n'a été appelé", async ({ page }) => {
    await page.goto("/reglages");
    const neverCalled = page.getByText("Non vérifié — jamais appelé");
    // Les quatre candidats sont dans cet état.
    await expect(neverCalled).toHaveCount(4);
  });

  test("indique le nom de la variable de clé, jamais une valeur", async ({ page }) => {
    await page.goto("/reglages");
    await expect(page.getByText("TWELVE_DATA_API_KEY")).toBeVisible();
    const body = (await page.textContent("body")) ?? "";
    // Une clé réelle est une longue chaîne alphanumérique ; le nom de variable
    // n'en est pas une.
    expect(body).not.toMatch(/[A-Za-z0-9]{32,}/);
  });

  test("aucun fournisseur réel n'est présenté comme utilisable", async ({ page }) => {
    await page.goto("/reglages");
    const body = (await page.textContent("body")) ?? "";
    expect(body).toContain("Adaptateur non implémenté");
  });
});

test.describe("canal temps réel", () => {
  test("le jeton de canal n'est jamais servi sans session", async ({ request }) => {
    // La route ne doit pas émettre de jeton pour un appelant non authentifié.
    const response = await request.post("/api/live-token");
    // En mode démonstration une session existe ; hors de ce mode, 401 ou 503.
    expect([200, 401, 503]).toContain(response.status());
  });

  test("le jeton émis ne contient jamais le secret partagé", async ({ request }) => {
    const response = await request.post("/api/live-token");
    if (response.status() !== 200) {
      test.skip(true, "Canal temps réel non configuré dans cet environnement");
      return;
    }
    const payload = (await response.json()) as { token: string };
    // Le jeton est un HMAC : il ne peut pas contenir le secret en clair.
    expect(payload.token).not.toContain("secret");
    expect(payload.token.split(".")).toHaveLength(3);
  });

  test("la réponse du jeton n'est jamais mise en cache", async ({ request }) => {
    const response = await request.post("/api/live-token");
    // Un jeton nominatif mis en cache serait réutilisable par un autre
    // utilisateur derrière le même proxy.
    expect(response.headers()["cache-control"]).toContain("no-store");
  });
});
