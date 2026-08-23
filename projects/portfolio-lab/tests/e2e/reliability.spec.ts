import { expect, test } from "@playwright/test";

/**
 * `true` quand la suite tourne sur la voie de démonstration.
 *
 * Elle utilise `next dev` — le mode démonstration est refusé en production — et
 * dispose d'une session. Les parcours qui vérifient un refus anonyme n'y ont
 * donc pas de sens.
 */
const DEMO_MODE = process.env["PORTFOLIO_LAB_DEMO_MODE"] === "true";

/**
 * Fiabilité, hors ligne et sécurité.
 *
 * Ces parcours n'ont pas besoin d'un portefeuille peuplé : ils vérifient
 * comment l'application se comporte quand le réseau manque, ce qu'elle refuse
 * de mettre en cache, et ce qu'elle ne laisse jamais fuir.
 */

/*
 * Le service worker n'est **pas** enregistré en développement : un cache actif
 * pendant qu'on modifie le code servirait des versions périmées à chaque
 * rechargement. Les parcours qui en dépendent tournent donc sur le build de
 * production — la seule configuration où il est réellement actif.
 *
 * Conséquence assumée : le hors-ligne est vérifié sans session, donc sur la
 * page d'accueil non authentifiée. Le mécanisme testé — mise en cache de la
 * navigation, service depuis le cache, bandeau d'âge — est le même quelle que
 * soit la page.
 */
test.describe("service worker", () => {
  test.skip(DEMO_MODE, "Le service worker n'est pas enregistré par `next dev`.");

  test("est enregistré et prend le contrôle de la page", async ({ page }) => {
    await page.goto("/");

    const controlled = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.active !== null;
    });

    expect(controlled).toBe(true);
  });

  test("la page de secours hors ligne est servie sans session ni données", async ({ page }) => {
    const response = await page.goto("/hors-ligne");

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Hors ligne" })).toBeVisible();
    // Elle explique l'absence plutôt que de laisser un écran muet.
    await expect(page.getByText(/jamais été affiché/)).toBeVisible();
  });
});

test.describe("dégradation hors ligne", () => {
  test.skip(DEMO_MODE, "Le service worker n'est pas enregistré par `next dev`.");

  test("réaffiche le dernier état connu en annonçant son âge", async ({ page, context }) => {
    // Première visite en ligne : le service worker met la page en cache.
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Un second passage garantit que la réponse réseau a bien été recopiée.
    await page.reload();
    await page.evaluate(() => navigator.serviceWorker.ready);

    /*
     * Attendre que **tous** les scripts de la page soient en cache.
     *
     * Sans cette attente, le test court après le service worker : la page peut
     * être en cache avant ses chunks. La première version de ce test passait
     * en local et échouait en CI sur les quatre gabarits, pour cette seule
     * raison — la page revenait du cache sans son JavaScript, donc sans
     * bandeau.
     *
     * On attend donc la précondition réelle du hors ligne — « l'application a
     * été utilisée en ligne au moins une fois » — au lieu de la supposer.
     */
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const scripts = [...document.querySelectorAll("script[src]")].map(
              (node) => (node as HTMLScriptElement).src,
            );
            for (const src of scripts) {
              if ((await caches.match(src)) === undefined) {
                return false;
              }
            }
            return scripts.length > 0;
          }),
        { timeout: 15_000, message: "les scripts de la page ne sont pas tous en cache" },
      )
      .toBe(true);

    await context.setOffline(true);
    await page.reload();

    // La page revient depuis le cache…
    await expect(page.getByRole("heading", { name: "Accueil" })).toBeVisible();

    /*
     * …et c'est le **service worker** qui l'a signalée, pas le veilleur client.
     *
     * Les deux posent le même attribut avec une valeur différente. Exiger
     * `cache` prouve que l'avertissement vient du HTML servi, et non d'un effet
     * React — donc qu'il survivrait à une hydratation qui n'aboutit pas, ce qui
     * est précisément la situation d'une page hors ligne.
     */
    await expect(page.locator("html")).toHaveAttribute("data-pl-offline", "cache");
    // …et ne se fait jamais passer pour un état à jour.
    const notice = page.getByRole("status").filter({ hasText: "Hors ligne" });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/dernière connexion/);
    await expect(notice).toContainText(/il y a /);

    await context.setOffline(false);
  });

  test("un écran jamais consulté renvoie la page de secours, pas une erreur brute", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.goto("/positions/00000000-0000-4000-8000-000000000000");

    await expect(page.getByRole("heading", { name: "Hors ligne" })).toBeVisible();

    await context.setOffline(false);
  });

  test("le bandeau disparaît dès le retour du réseau", async ({ page, context }) => {
    await page.goto("/");
    await context.setOffline(true);
    await expect(page.getByRole("status").filter({ hasText: "Hors ligne" })).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByRole("status").filter({ hasText: "Hors ligne" })).toHaveCount(0);
  });
});

test.describe("ce qui n'est jamais mis en cache", () => {
  test.skip(DEMO_MODE, "Le service worker n'est pas enregistré par `next dev`.");

  test("aucune route d'API ne finit dans un cache du navigateur", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);

    // On force un appel aux deux routes sensibles.
    await page.evaluate(async () => {
      await fetch("/api/live-token", { method: "POST" }).catch(() => undefined);
      await fetch("/api/export").catch(() => undefined);
    });

    const cachedApiUrls = await page.evaluate(async () => {
      const names = await caches.keys();
      const found: string[] = [];
      for (const name of names) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          if (new URL(request.url).pathname.startsWith("/api/")) {
            found.push(request.url);
          }
        }
      }
      return found;
    });

    /*
     * Un jeton de canal rejoué depuis un cache, ou une sauvegarde périmée
     * servie silencieusement, seraient tous deux pires qu'une erreur franche.
     */
    expect(cachedApiUrls).toEqual([]);
  });
});

test.describe("ordre des refus", () => {
  test.skip(DEMO_MODE, "La voie de démonstration dispose d'une session.");

  test("un appelant anonyme n'apprend rien de la configuration du serveur", async ({ request }) => {
    /*
     * La route vérifiait son secret partagé avant d'authentifier, et répondait
     * donc 503 « canal non configuré » à n'importe qui. L'identité doit être
     * exigée en premier : le reste ne regarde pas un appelant anonyme.
     */
    const response = await request.post("/api/live-token");

    expect(response.status()).toBe(401);
    const body: unknown = await response.json();
    expect(JSON.stringify(body)).not.toContain("configur");
  });

  test("la sauvegarde exige elle aussi une session", async ({ request }) => {
    const response = await request.get("/api/export");
    expect(response.status()).toBe(401);
  });
});

test.describe("étanchéité des secrets", () => {
  test("aucune variable d'environnement serveur n'atteint le navigateur", async ({ page }) => {
    await page.goto("/reglages");
    const html = await page.content();

    for (const marker of [
      "MARKET_GATEWAY_SHARED_SECRET",
      "SUPABASE_SERVICE_ROLE_KEY",
      "postgresql://",
      "postgres://",
    ]) {
      expect(html, `marqueur « ${marker} » présent dans la page`).not.toContain(marker);
    }
  });

  test("la sauvegarde n'est jamais servie depuis un cache partagé", async ({ request }) => {
    const response = await request.get("/api/export");
    const cacheControl = response.headers()["cache-control"] ?? "";

    expect(cacheControl).toContain("no-store");
  });
});

test.describe("politique de sécurité du contenu", () => {
  test("est appliquée et n'autorise aucune ressource tierce", async ({ request }) => {
    const response = await request.get("/");
    const csp = response.headers()["content-security-policy"] ?? "";

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  test("n'autorise `eval` qu'en développement, jamais dans un build de production", async ({
    request,
  }) => {
    const csp = (await request.get("/")).headers()["content-security-policy"] ?? "";

    if (DEMO_MODE) {
      /*
       * La voie de démonstration tourne sur `next dev`, qui compile avec des
       * source maps en `eval()`. Sans cette autorisation le navigateur refuse
       * tout le bundle client : l'application s'affiche — le rendu serveur
       * suffit — mais **aucun composant client n'est hydraté**, et les
       * formulaires continuent de fonctionner par soumission native, ce qui
       * masque entièrement le problème.
       */
      expect(csp).toContain("'unsafe-eval'");
    } else {
      expect(csp).not.toContain("'unsafe-eval'");
    }
  });

  test("les composants clients sont réellement hydratés", async ({ page, context }) => {
    // Ce parcours ne dépend pas du service worker : le bandeau réagit à
    // l'événement `offline` du navigateur, pas au cache.
    /*
     * Garde-fou contre la régression ci-dessus : sans JavaScript client, ce
     * bandeau — qui n'existe que côté navigateur — n'apparaîtrait jamais, et
     * tous les autres parcours continueraient de passer.
     */
    await page.goto("/");
    await context.setOffline(true);
    await expect(page.getByRole("status").filter({ hasText: "Hors ligne" })).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe("le bandeau hors ligne ne dépend pas du JavaScript", () => {
  test("le seul CSS suffit à le révéler, scripts désactivés", async ({ browser }) => {
    /*
     * La garantie centrale de ce lot, vérifiée frontalement.
     *
     * Une première version montait le bandeau depuis un effet client. Il
     * disparaissait donc exactement quand il comptait : une page servie hors
     * ligne est précisément la situation où l'hydratation peut ne pas aboutir.
     *
     * Ici les scripts de page sont désactivés, et la réponse est marquée comme
     * le fait le service worker quand il sert depuis son cache. Si le bandeau
     * apparaît, c'est que le CSS seul y suffit.
     */
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.route("**/*", async (route) => {
      if (route.request().resourceType() !== "document") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      // Même transformation que `markAsCached` dans `public/sw.js`.
      const body = (await response.text()).replace(/<html\b/i, '<html data-pl-offline="cache"');
      await route.fulfill({ response, body });
    });

    await page.goto("/");

    const notice = page.locator(".pl-offline");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Hors ligne");
    await expect(notice).toContainText(/dernière connexion/);
    // L'horodatage absolu est rendu par le serveur : il est lisible sans JS.
    await expect(notice.locator("time")).toHaveAttribute("datetime", /\d{4}-\d{2}-\d{2}T/);

    await context.close();
  });

  test("reste masqué sur une page servie normalement, scripts désactivés", async ({ browser }) => {
    // Contrôle négatif : sans la marque, le bandeau ne doit jamais apparaître.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/");
    await expect(page.locator(".pl-offline")).toBeHidden();

    await context.close();
  });
});
