import { expect, test, type Page } from "@playwright/test";

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

  test("montre le patrimoine total dès le haut de l'écran", async ({ page }, testInfo) => {
    /*
     * Le contrôle qui a motivé la refonte de la coquille.
     *
     * L'en-tête d'écran et le bandeau de démonstration occupaient à eux seuls
     * près de 290 px : sur un iPhone, l'utilisateur ouvrait l'application et
     * devait faire défiler pour voir le chiffre pour lequel il l'avait ouverte.
     *
     * Ce qui est borné ici est la **hauteur de tout ce qui précède le chiffre**,
     * et non sa simple présence dans la fenêtre. Un seuil « au-dessus de la
     * ligne de flottaison » ne mordrait pas : sur un écran de 844 px, le total
     * pourrait glisser de 200 px de plus sans jamais en sortir, et la
     * régression passerait inaperçue.
     *
     * Le budget est absolu parce que le bandeau et l'en-tête ne dépendent
     * pratiquement pas de la largeur : mesuré à 199 px sur tablette et desktop,
     * 224 px sur les deux iPhone.
     */
    const CHROME_BUDGET_PX = 280;

    await page.goto("/");
    const total = page.getByText(TOTAL_CHF).first();
    await expect(total).toBeVisible();

    const box = await total.boundingBox();
    expect(box, "le total doit avoir une boîte mesurable").not.toBeNull();

    // Garde-fou : la mesure n'a de sens qu'en haut du document.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    expect(
      Math.round(box?.y ?? Number.POSITIVE_INFINITY),
      `${testInfo.project.name} : le total commence trop bas`,
    ).toBeLessThanOrEqual(CHROME_BUDGET_PX);
  });

  test("n'affiche aucun montant tronqué", async ({ page }, testInfo) => {
    /*
     * Un chiffre financier coupé est pire qu'absent : il se lit encore.
     * « CHF 31'297.30 » rendu « CHF 31'297… » ressemble à un montant valide et
     * en désigne un autre.
     *
     * Le défaut s'est produit deux fois — au Lot 08 dans un tableau
     * d'exposition, puis ici avec trois montants en colonne sur 390 px. Le
     * contrôle est donc permanent plutôt que ponctuel.
     *
     * On compare `scrollWidth` à `clientWidth` : c'est ce que fait réellement
     * le navigateur quand il tronque, et c'est indépendant de la police, de la
     * langue et de la longueur du montant.
     */
    await page.goto("/");

    const truncated = await page.evaluate(() =>
      [...document.querySelectorAll(".pl-numeric, dd, td, th")]
        .filter(
          (element) => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1,
        )
        .map((element) => (element.textContent ?? "").trim().slice(0, 40)),
    );

    expect(truncated, `${testInfo.project.name} : montants tronqués`).toEqual([]);
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
    /*
     * La fraîcheur du portefeuille suit sa position la plus dégradée. Le badge
     * est désigné par son attribut plutôt que par son libellé : chercher le
     * mot « Manuel » n'importe où dans la page faisait dépendre le test de la
     * prose, et n'importe quelle phrase citant un type de cours pouvait devenir
     * la première occurrence trouvée.
     */
    const badge = page.locator('[data-pl-freshness="MANUAL"]').first();
    await expect(badge).toBeVisible();
    // `toContainText` et non `toHaveText` : le badge porte aussi la source et
    // l'horodatage dans un texte réservé aux lecteurs d'écran.
    await expect(badge).toContainText("Manuel");
  });

  test("explique pourquoi la variation du jour n'est pas calculable", async ({ page }) => {
    await page.goto("/");
    /*
     * Le fonds n'a pas de clôture précédente : un total partiel serait
     * trompeur. L'explication doit rester **visible** et non reléguée dans une
     * infobulle — sur un téléphone il n'y a pas de survol.
     */
    await expect(page.getByText("non calculable")).toBeVisible();
    await expect(page.getByText(/clôture précédente connue/)).toBeVisible();
  });

  test("affiche P&L latent, performance et capital investi", async ({ page }) => {
    await page.goto("/");
    for (const label of ["P&L latent", "Performance", "Investi"]) {
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

  test("n'affiche un badge que sur la ligne dont la fraîcheur diffère", async ({ page }) => {
    await page.goto("/positions");

    /*
     * Cinq lignes valorisées « Manuel » et un fonds en NAV. Répéter « Manuel »
     * cinq fois n'apprend rien et noierait la seule ligne à remarquer : la
     * fraîcheur commune est donc énoncée une fois, et le fonds seul garde son
     * badge.
     */
    await expect(page.locator("[data-pl-common-freshness]")).toHaveText(/manuel/i);

    const badges = page.getByRole("main").locator("[data-pl-freshness]");
    await expect(badges).toHaveCount(1);
    await expect(badges.first()).toHaveAttribute("data-pl-freshness", "NAV");
  });

  test("ne cache jamais la fraîcheur d'une ligne isolée par un filtre", async ({ page }) => {
    await page.goto("/positions");

    /*
     * Une fois le fonds seul à l'écran, il n'y a plus de « cas normal » à
     * résumer : la fraîcheur doit alors rester sur la ligne elle-même. C'est
     * le piège de ce genre de règle — à force de masquer le répétitif, elle
     * finit par masquer l'unique. Filtrer ne doit jamais effacer
     * l'information, seulement la déplacer.
     */
    await page.getByRole("button", { name: /Fonds/ }).click();
    await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(1);
    await expect(page.locator("[data-pl-common-freshness]")).toHaveCount(0);

    const badges = page.getByRole("main").locator("[data-pl-freshness]");
    await expect(badges).toHaveCount(1);
    await expect(badges.first()).toHaveAttribute("data-pl-freshness", "NAV");
  });

  test("le fonds affiche « Dernière NAV » et jamais un cours intraday", async ({ page }) => {
    await page.goto("/positions");
    const fund = page.getByRole("listitem").filter({ hasText: "Démo Fonds Équilibré" });
    await expect(fund.locator("[data-pl-freshness]")).toHaveAttribute("data-pl-freshness", "NAV");
    await expect(fund).toContainText("Dernière NAV");
  });

  test("la recherche réduit la liste au titre saisi", async ({ page }) => {
    await page.goto("/positions");
    const items = page.getByRole("main").getByRole("listitem");
    await expect(items).toHaveCount(6);

    await page.getByRole("searchbox").fill("Fonds");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("Démo Fonds Équilibré");
  });

  test("la recherche porte aussi sur le compte, pas seulement sur le titre", async ({ page }) => {
    await page.goto("/positions");
    const items = page.getByRole("main").getByRole("listitem");
    await expect(items).toHaveCount(6);

    /*
     * « Démo Actions » est un nom de compte qui n'apparaît dans aucun nom
     * d'instrument, et qui regroupe quatre des six lignes. Si le filtre ne
     * regardait que le titre, la recherche ne renverrait rien ; s'il ne
     * filtrait pas du tout, elle en renverrait six.
     *
     * « Tout ce que je détiens chez tel établissement » est une question
     * aussi courante que « où est mon Nestlé ».
     */
    await page.getByRole("searchbox").fill("Démo Actions");
    await expect(items).toHaveCount(4);
    await expect(items.first()).toContainText("Démo Actions");
  });

  test("un filtre de classe ne garde que cette classe", async ({ page }) => {
    await page.goto("/positions");
    const items = page.getByRole("main").getByRole("listitem");

    await page.getByRole("button", { name: /Fonds/ }).click();
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("Fonds de placement");
  });

  test("dit explicitement qu'aucune position ne correspond", async ({ page }) => {
    await page.goto("/positions");
    await page.getByRole("searchbox").fill("zzzzzzzz");

    // Une liste vide sans phrase se lit comme un écran cassé.
    await expect(page.getByText(/Aucune position ne correspond/)).toBeVisible();
    await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(0);
  });

  test("sans JavaScript, la liste reste entière et ne feint pas de filtrer", async ({
    browser,
  }) => {
    /*
     * La liste est rendue par le serveur : elle doit rester lisible même si
     * aucun script ne s'exécute. La recherche et les filtres, eux, ne peuvent
     * pas fonctionner — ils doivent donc être inertes, et le dire, plutôt que
     * d'avaler les lettres sans rien filtrer.
     */
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/positions");
    await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(6);
    await expect(page.getByRole("searchbox")).toBeDisabled();

    await context.close();
  });

  test("rappelle la devise des montants une seule fois", async ({ page }) => {
    await page.goto("/positions");
    // Répété sur chaque ligne, le code devise vole la place du montant sur un
    // écran de 390 px ; absent, la colonne devient ambiguë.
    await expect(page.getByText(/Montants en CHF/)).toHaveCount(1);
  });
});

test.describe("détail d'une position", () => {
  test("expose la provenance complète de la donnée", async ({ page }) => {
    await page.goto("/positions");
    await page.getByRole("link", { name: /Démo Technologies CALL/ }).click();

    await expect(page.getByRole("heading", { level: 1 })).toContainText("CALL");

    // La provenance est repliée par défaut : elle sert à vérifier un chiffre
    // contesté, pas à être lue chaque jour. Le test l'ouvre donc comme le
    // ferait un utilisateur, mais exige qu'elle reste atteignable sans quitter
    // la fiche.
    await page.getByText("Détails de valorisation").click();

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

  test("le cours unitaire tient compte du multiplicateur de l'option", async ({ page }) => {
    await page.goto("/positions");
    await page.getByRole("link", { name: /Démo Technologies CALL/ }).click();

    // 1 240 USD pour 2 contrats × 100 : le cours unitaire vaut 6.20, pas 620.
    // Une régression sur le multiplicateur afficherait ici un cours cent fois
    // trop élevé tout en laissant le total juste — invisible autrement.
    const quote = page.locator("section").filter({ hasText: "Cours retenu" });
    await expect(quote).toContainText("6.20");
    await expect(quote).not.toContainText("620.00");
  });

  test("ne trace aucune courbe tant qu'aucun historique n'existe", async ({ page }) => {
    await page.goto("/positions");
    await page.getByRole("link", { name: /Démo Technologies CALL/ }).click();

    // Une courbe inventée serait la seule faute impardonnable de cet écran :
    // l'absence d'historique doit être écrite, pas comblée.
    const history = page.locator("section").filter({ hasText: "Historique" });
    await expect(history).toContainText(/Aucun historique/);
    await expect(history.locator("svg")).toHaveCount(0);
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
  /**
   * Ouvre la section avancée.
   *
   * Exposition options, réconciliation et enregistrement d'un point sont des
   * outils de vérification, pas des questions quotidiennes : ils sont repliés
   * par défaut. Le parcours les déplie comme le ferait un utilisateur, mais
   * exige qu'ils restent atteignables sans quitter l'écran.
   */
  async function ouvrirDetails(page: Page): Promise<void> {
    await page.getByText("Détails avancés").click();
  }

  test("répartit l'exposition par classe, compte et devise", async ({ page }) => {
    await page.goto("/analyse");
    for (const title of [
      "Répartition par classe d'actifs",
      "Par compte",
      "Par devise de cotation",
    ]) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
  });

  test("propose de choisir la fenêtre de lecture de la courbe", async ({ page }) => {
    await page.goto("/analyse");

    /*
     * Le seed couvre le 4 au 8 mai puis aujourd'hui : plusieurs fenêtres
     * contiennent donc des courbes réellement différentes, et le sélecteur
     * doit les proposer. Une fenêtre n'est jamais offerte si elle ne contient
     * pas deux points enregistrés — rien n'est interpolé.
     */
    const group = page.getByRole("group", { name: "Période affichée" });
    await expect(group).toBeVisible();

    const boutons = group.getByRole("button");
    expect(await boutons.count()).toBeGreaterThanOrEqual(2);
    await expect(boutons.last()).toHaveText("Tout");
  });

  test("changer de fenêtre change réellement la courbe affichée", async ({ page }) => {
    await page.goto("/analyse");
    const chart = page.getByRole("img", { name: /Patrimoine du .* au .*/ });
    const avant = await chart.getAttribute("aria-label");

    const boutons = page.getByRole("group", { name: "Période affichée" }).getByRole("button");
    await boutons.last().click();

    // Un sélecteur qui ne change rien est pire qu'aucun sélecteur : il laisse
    // croire qu'on regarde une autre période.
    await expect(chart).not.toHaveAttribute("aria-label", avant ?? "");
    await expect(boutons.last()).toHaveAttribute("aria-pressed", "true");
  });

  test("double chaque barre d'une valeur chiffrée", async ({ page }) => {
    await page.goto("/analyse");
    // Les graphiques ne remplacent jamais les chiffres.
    await expect(page.getByText(/%/).first()).toBeVisible();
    await expect(page.getByText(/CHF/).first()).toBeVisible();
  });

  test("trace la courbe du patrimoine et la double d'un tableau de valeurs", async ({ page }) => {
    await page.goto("/analyse");
    await expect(page.getByRole("heading", { name: "Évolution" })).toBeVisible();

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

  test("ne montre jamais deux fois la même journée", async ({ page }) => {
    await page.goto("/analyse");

    // La fenêtre la plus large : c'est là que toutes les journées sont
    // présentes, y compris celle qui porte deux snapshots.
    const boutons = page.getByRole("group", { name: "Période affichée" }).getByRole("button");
    if ((await boutons.count()) > 0) await boutons.last().click();

    await page.getByText(/Valeurs chiffrées/).click();

    /*
     * Le seed porte une journée avec DEUX snapshots — un après publication des
     * données, un après une modification manuelle. L'historique quotidien doit
     * retenir le second et n'afficher la journée qu'une fois.
     *
     * L'assertion ne cite aucune date : les dates du seed sont relatives à son
     * installation, précisément pour que l'historique de démonstration ne sorte
     * pas des fenêtres de lecture en vieillissant.
     */
    const jours = await page.getByRole("rowheader").allInnerTexts();
    expect(jours.length).toBeGreaterThan(1);
    expect(new Set(jours).size).toBe(jours.length);
  });

  test("affiche la contribution de chaque position au P&L", async ({ page }) => {
    await page.goto("/analyse");
    await expect(page.getByRole("heading", { name: /Contribution au P&L/ })).toBeVisible();
  });

  test("distingue valeur de marché et notionnel des options", async ({ page }) => {
    await page.goto("/analyse");
    await ouvrirDetails(page);
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
    await ouvrirDetails(page);
    const panel = page.locator("section").filter({ hasText: "Réconciliation" });
    await expect(panel.getByText(/correspond exactement/)).toBeVisible();
    // Aucun écart : le panneau d'alerte ne doit pas apparaître.
    await expect(page.getByText("Écart de réconciliation")).toHaveCount(0);
  });

  test("enregistre un point d'historique sur demande explicite", async ({ page }) => {
    await page.goto("/analyse");
    await ouvrirDetails(page);

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
  /** Amène le parcours à l'étape de saisie via la carte demandée. */
  async function choisir(page: Page, label: string): Promise<void> {
    await page.goto("/ajouter");
    await page.getByRole("button", { name: new RegExp(label) }).click();
  }

  test("demande d'abord ce que l'on ajoute, pas les six champs à la fois", async ({ page }) => {
    await page.goto("/ajouter");

    /*
     * Le premier écran ne pose qu'une question. Les six champs d'un bloc ne
     * laissaient pas atteindre « Quantité » sur 390 px, alors que la réponse à
     * « qu'est-ce que j'ajoute ? » écarte déjà presque tous les choix suivants.
     */
    await expect(page.getByRole("heading", { name: /Qu'ajoutez-vous/ })).toBeVisible();
    await expect(page.getByLabel("Quantité")).toHaveCount(0);
    await expect(page.getByLabel("Instrument")).toHaveCount(0);
  });

  test("le choix d'une classe n'expose que les instruments de cette classe", async ({ page }) => {
    await choisir(page, "Fonds");

    await expect(page.getByLabel("Instrument")).toBeVisible();
    const options = page.getByLabel("Instrument").locator("option:not([disabled])");
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText("Démo Fonds Équilibré");
  });

  test("le champ masqué n'est pas seulement caché : il n'est pas soumis", async ({ page }) => {
    /*
     * Un champ rendu puis masqué en CSS partirait quand même au serveur, et
     * l'étape n'aurait plus rien d'une étape. Le DOM doit être vide, pas
     * invisible.
     */
    await page.goto("/ajouter");
    await expect(page.locator("input[name='quantity']")).toHaveCount(0);
    await expect(page.locator("select[name='instrumentId']")).toHaveCount(0);
  });

  test("on peut revenir en arrière et changer de classe", async ({ page }) => {
    await choisir(page, "Action");
    await expect(page.getByLabel("Instrument")).toBeVisible();

    await page.getByRole("button", { name: "Changer" }).click();
    await expect(page.getByRole("heading", { name: /Qu'ajoutez-vous/ })).toBeVisible();
    await expect(page.getByLabel("Instrument")).toHaveCount(0);
  });

  test("une carte sans instrument enregistré est inerte et dit pourquoi", async ({ page }) => {
    await page.goto("/ajouter");

    // Le référentiel de démonstration ne contient ni obligation ni crypto :
    // « Autre » doit donc être désactivé — et l'expliquer, plutôt que de rester
    // grisé sans raison, ce qui se lit comme une panne.
    const autre = page.getByRole("button", { name: /Autre/ });
    await expect(autre).toBeDisabled();
    await expect(autre).toContainText("Aucun enregistré");
  });

  test("les options passent par la sélection guidée, pas par la saisie libre", async ({ page }) => {
    await page.goto("/ajouter");

    // Un symbole d'option mal tapé désigne un autre contrat existant, pas une
    // erreur : rien ne le signalerait.
    const option = page.getByRole("link", { name: /Option/ });
    await expect(option).toHaveAttribute("href", "/ajouter/option");
  });

  test("le bouton d'enregistrement reste atteignable sans faire défiler", async ({
    page,
  }, testInfo) => {
    // Garde-fou pour le plus petit écran ciblé : c'est là que le formulaire
    // déborde en premier, et un bouton hors de portée du pouce est la
    // principale raison d'abandonner une saisie.
    test.skip(testInfo.project.name !== "iphone-390", "Garde-fou propre au plus petit écran.");

    await choisir(page, "Action");
    const box = await page.getByRole("button", { name: "Enregistrer la position" }).boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();

    // La navigation basse recouvre le bas de l'écran : le bouton doit tenir
    // au-dessus d'elle, pas seulement dans la fenêtre.
    const navHeight = (await page.getByRole("navigation").boundingBox())?.height ?? 0;
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
      (viewport?.height ?? 0) - navHeight,
    );
  });

  test("les champs de montant ne sont pas de type number", async ({ page }) => {
    await choisir(page, "Action");
    // `type="number"` accepte la notation exponentielle et normalise selon la
    // locale du navigateur : deux comportements indésirables ici.
    await expect(page.getByLabel("Quantité")).toHaveAttribute("inputmode", "decimal");
    await expect(page.getByLabel("Quantité")).toHaveAttribute("type", "text");
  });

  test("refuse une quantité nulle avec un message explicite", async ({ page }) => {
    await choisir(page, "Action");
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

    /*
     * L'assertion portait sur « Lot 04 », un numéro de lot depuis longtemps
     * livré : l'écran promettait donc une fonctionnalité pour une étape déjà
     * passée. Elle porte désormais sur ce que l'utilisateur doit comprendre —
     * la liste est limitée, et pourquoi.
     */
    await expect(page.getByText(/Seuls les instruments déjà enregistrés/)).toBeVisible();
    await expect(page.getByText(/fausse assurance sur l'identité du titre/)).toBeVisible();
    // Aucun renvoi à un numéro de lot ne doit atteindre l'utilisateur.
    await expect(page.getByText(/Lot \d/)).toHaveCount(0);
  });
});

test.describe("état des fournisseurs de données", () => {
  test("liste les fournisseurs, y compris ceux jamais appelés", async ({ page }) => {
    await page.goto("/reglages");
    await expect(page.getByRole("heading", { name: "Fournisseurs de données" })).toBeVisible();
    for (const label of ["Twelve Data", "Massive", "EODHD", "CoinGecko", "OpenFIGI"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("ne présente aucun fournisseur comme éprouvé en production", async ({ page }) => {
    /*
     * L'invariant produit, formulé sur ce qui doit rester vrai plutôt que sur
     * l'état du moment. Quatre adaptateurs existent désormais et sont testés
     * sur fixtures ; aucun n'a pour autant jamais parlé à son API, et écrire un
     * client HTTP ne prouve pas qu'il fonctionne.
     *
     * La version précédente comptait les « jamais appelé » : elle mesurait
     * l'absence d'implémentation, pas l'absence de preuve. Elle serait devenue
     * fausse dès le premier adaptateur écrit, ce qui est exactement ce qui
     * vient d'arriver.
     */
    await page.goto("/reglages");
    const body = (await page.textContent("body")) ?? "";
    expect(body).not.toContain("Appel production réellement effectué");
    expect(body).not.toContain("Appel sandbox réellement effectué");
  });

  test("indique le nom de la variable de clé, jamais une valeur", async ({ page }) => {
    await page.goto("/reglages");
    await expect(page.getByText("TWELVE_DATA_API_KEY")).toBeVisible();
    const body = (await page.textContent("body")) ?? "";
    // Une clé réelle est une longue chaîne alphanumérique ; le nom de variable
    // n'en est pas une.
    expect(body).not.toMatch(/[A-Za-z0-9]{32,}/);
  });

  test("dit pour chaque fournisseur ce qui manque encore", async ({ page }) => {
    /*
     * Un fournisseur listé sans motif de blocage se lirait comme prêt. Chacun
     * doit donc porter la raison qui l'empêche de monter d'un cran : soit
     * l'adaptateur n'existe pas, soit il n'a jamais été confronté à l'API.
     */
    await page.goto("/reglages");
    const body = (await page.textContent("body")) ?? "";
    expect(body).toContain("Adaptateur non implémenté");
    expect(body).toContain("testé sur fixtures");
  });
});

test.describe("canal temps réel", () => {
  test("un jeton n'est émis que sur une réponse 200, jamais sur un refus", async ({ request }) => {
    /*
     * L'ancienne version acceptait 200, 401 ou 503 sans rien vérifier du corps :
     * elle passait quel que soit le contenu, et n'aurait pas vu un jeton émis
     * dans une réponse d'erreur. Elle ratait aussi le 429 de la limitation de
     * débit, qui est un refus parfaitement légitime.
     *
     * Ce qui doit tenir, quelle que soit la réponse : un jeton n'apparaît que
     * dans un succès.
     */
    const response = await request.post("/api/live-token");
    const body = (await response.json()) as Record<string, unknown>;

    if (response.status() === 200) {
      expect(typeof body["token"]).toBe("string");
    } else {
      expect(body["token"]).toBeUndefined();
      expect(typeof body["error"]).toBe("string");
    }
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

test.describe("limitation de débit", () => {
  test("une rafale sur la route de jeton finit par être refusée, avec un délai", async ({
    request,
  }, testInfo) => {
    // Une seule voie : quarante requêtes par gabarit satureraient le compteur
    // pour les autres parcours du même serveur.
    test.skip(testInfo.project.name !== "iphone-390", "Un seul gabarit suffit.");

    /*
     * Ce parcours a besoin d'une session : sans elle la route répond 401 avant
     * toute limitation, et le test ne prouverait rien. Il vit donc dans la voie
     * de démonstration.
     *
     * L'assertion ne suppose pas que le premier appel passe : les quatre
     * tailles d'écran tournent en parallèle contre le même serveur et partagent
     * le compteur. Ce qui doit tenir, c'est qu'une rafale finisse refusée.
     */
    let refusal: { status: number; retryAfter: string | undefined } | null = null;

    for (let attempt = 0; attempt < 40 && refusal === null; attempt += 1) {
      const response = await request.post("/api/live-token");
      if (response.status() === 429) {
        refusal = { status: 429, retryAfter: response.headers()["retry-after"] };
      }
    }

    expect(refusal, "aucune requête refusée après 40 appels").not.toBeNull();
    expect(Number(refusal?.retryAfter)).toBeGreaterThan(0);
  });

  test("le refus n'expose ni secret ni détail interne", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone-390", "Un seul gabarit suffit.");

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await request.post("/api/live-token");
      if (response.status() === 429) {
        const body = await response.text();
        expect(body).not.toContain("MARKET_GATEWAY_SHARED_SECRET");
        expect(body).toContain("Réessayez");
        return;
      }
    }
    throw new Error("aucune requête refusée : la limitation ne s'est pas déclenchée");
  });
});

test.describe("sauvegarde", () => {
  test("produit un fichier complet, versionné et honnête sur son contenu", async ({
    request,
  }, testInfo) => {
    /*
     * Un seul gabarit d'écran.
     *
     * L'export est une charge JSON, pas une interface : le rejouer sur quatre
     * tailles n'apprend rien et consomme la limite de débit de la route.
     */
    test.skip(testInfo.project.name !== "iphone-390", "Charge JSON : un seul gabarit suffit.");

    const response = await request.get("/api/export");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-disposition"]).toContain("attachment");
    expect(response.headers()["content-disposition"]).toMatch(
      /portfolio-lab-\d{4}-\d{2}-\d{2}\.json/,
    );
    // Une sauvegarde de patrimoine ne doit transiter par aucun cache partagé.
    expect(response.headers()["cache-control"]).toContain("no-store");

    const raw = await response.text();
    const payload = JSON.parse(raw) as Record<string, unknown>;

    expect(payload["formatVersion"]).toBe(1);
    expect(payload["baseCurrency"]).toBe("CHF");
    expect((payload["positions"] as unknown[]).length).toBe(6);
    // Au moins les six points du seed. Le nombre n'est pas figé : le parcours
    // d'enregistrement d'historique en ajoute légitimement.
    expect((payload["snapshots"] as unknown[]).length).toBeGreaterThanOrEqual(6);

    // Le fichier dit ce qu'il contient : oublié dans un dossier de
    // téléchargements, il ne le dirait pas autrement.
    expect(payload["notice"]).toContain("positions");
    expect(payload["notice"]).toContain("aucun identifiant bancaire");

    // Aucun cours : ils changeront au prochain chargement, et les inclure
    // ferait croire que la sauvegarde fige une valorisation.
    for (const absent of ["quotes", "marks", "fxRates"]) {
      expect(Object.keys(payload)).not.toContain(absent);
    }

    // Les décimales restent des chaînes : relues comme nombres JSON, elles ne
    // seraient plus exactement les quantités sauvegardées.
    expect(raw).toContain('"quantity": "150.750000000000"');
  });
});

test.describe("suppression des données", () => {
  test("le bouton reste inactif tant que le mot n'est pas recopié", async ({ page }) => {
    await page.goto("/reglages");

    const button = page.getByRole("button", { name: /Supprimer définitivement/ });
    await expect(button).toBeDisabled();

    await page.getByLabel(/Recopiez/).fill("supprimer");
    await expect(button).toBeDisabled();

    await page.getByLabel(/Recopiez/).fill("SUPPRIMER");
    await expect(button).toBeEnabled();
  });

  test("annonce clairement qu'aucune sauvegarde n'est conservée", async ({ page }) => {
    await page.goto("/reglages");

    const section = page.locator("section").filter({ hasText: "Supprimer toutes mes données" });
    await expect(section.getByText(/ne peut pas être annulée/)).toBeVisible();
    await expect(section.getByText(/aucune sauvegarde n'est conservée/)).toBeVisible();
  });

  test("propose la sauvegarde avant la suppression", async ({ page }) => {
    await page.goto("/reglages");

    const download = page.getByRole("link", { name: /Télécharger ma sauvegarde/ });
    await expect(download).toBeVisible();

    // La sauvegarde précède la suppression dans l'ordre de lecture de la page.
    const downloadBox = await download.boundingBox();
    const deleteBox = await page
      .getByRole("heading", { name: "Supprimer toutes mes données" })
      .boundingBox();
    expect(downloadBox?.y ?? 0).toBeLessThan(deleteBox?.y ?? 0);
  });
});

test.describe("modification d'une position", () => {
  /*
   * Parcours critique n° 10 de QUALITY_GATES.md : « modification et suppression
   * d'une position ». La suppression existait ; la modification manquait.
   *
   * Un seul gabarit : le parcours écrit en base, et le rejouer sur quatre
   * tailles ferait quatre modifications concurrentes sur la même position.
   */
  test("modifie la quantité et la retrouve sur la fiche", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone-390", "Le parcours écrit en base.");

    await page.goto("/positions");
    const first = page.getByRole("main").getByRole("link").first();
    const href = await first.getAttribute("href");
    await first.click();

    const quantity = page.getByLabel("Quantité");
    const before = await quantity.inputValue();
    const after = String(Number(before) + 1);

    await quantity.fill(after);
    await page.getByRole("button", { name: /Enregistrer les modifications/ }).click();
    await expect(page.getByText("Position modifiée.")).toBeVisible();

    // La valeur persiste après un rechargement complet : elle vient de la base,
    // pas d'un état de formulaire resté en mémoire.
    await page.goto(href ?? "/positions");
    await expect(page.getByLabel("Quantité")).toHaveValue(after);

    // Remise dans l'état initial pour ne pas dépendre de l'ordre des parcours.
    await page.getByLabel("Quantité").fill(before);
    await page.getByRole("button", { name: /Enregistrer les modifications/ }).click();
    await expect(page.getByText("Position modifiée.")).toBeVisible();
  });

  test("refuse une quantité nulle avec un message explicite", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone-390", "Le parcours soumet un formulaire.");

    await page.goto("/positions");
    await page.getByRole("main").getByRole("link").first().click();

    await page.getByLabel("Quantité").fill("0");
    await page.getByRole("button", { name: /Enregistrer les modifications/ }).click();

    await expect(page.getByText(/quantité nulle/)).toBeVisible();
  });

  test("n'offre de changer ni l'instrument ni le compte", async ({ page }) => {
    await page.goto("/positions");
    await page.getByRole("main").getByRole("link").first().click();

    const form = page.locator("form").filter({ hasText: "Enregistrer les modifications" });
    // Changer l'instrument réécrirait le passé de la position.
    await expect(form.locator('select[name="instrumentId"]')).toHaveCount(0);
    await expect(form.locator('select[name="accountId"]')).toHaveCount(0);
    await expect(page.getByText(/réécrirait le passé/)).toBeVisible();
  });
});
