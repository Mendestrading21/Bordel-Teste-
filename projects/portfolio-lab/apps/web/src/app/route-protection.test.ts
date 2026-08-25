import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { globSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Toute page qui lit des données exige-t-elle une session ?
 *
 * Cinq pages ne vérifiaient rien. Elles ne fuyaient pas — `currentUserId`
 * renvoyait `null` et RLS bloquait le reste — mais elles affichaient « aucune
 * position » à quelqu'un de simplement déconnecté, qui pouvait croire ses
 * données perdues. Surtout, leur innocuité tenait au hasard : rien
 * n'empêchait la page suivante de lire une donnée avant de vérifier quoi que
 * ce soit.
 *
 * Cette suite énumère les pages plutôt que d'en vérifier une liste écrite à la
 * main : c'est ce qui distingue une garantie d'une série de précautions. Une
 * page ajoutée demain est couverte sans que personne ait à y penser.
 */

const APP_DIR = fileURLToPath(new URL(".", import.meta.url));

/**
 * Pages publiques par nature.
 *
 * `connexion` est l'écran de connexion lui-même : y exiger une session le
 * rendrait inatteignable. `hors-ligne` est servie depuis le cache du service
 * worker, sans serveur pour vérifier quoi que ce soit — et elle n'affiche
 * aucune donnée.
 */
const PUBLIC_PAGES = new Set(["connexion/page.tsx", "hors-ligne/page.tsx"]);

/**
 * L'accueil se garde autrement.
 *
 * Il distingue explicitement « déconnecté » de « portefeuille vide » et
 * propose l'entrée. Le rediriger ferait de la connexion la toute première
 * chose qu'on voit, sans jamais expliquer où l'on est arrivé.
 */
const SELF_GUARDED = new Set(["page.tsx"]);

/** Sources qui font entrer des données de portefeuille dans une page. */
const DATA_LOADERS = ["loadPortfolioView", "loadAnalytics", "loadFundHoldings", "listInstruments"];

function pageFiles(): readonly string[] {
  return globSync("**/page.tsx", { cwd: APP_DIR }).sort();
}

describe("protection des routes", () => {
  it("trouve les pages de l'application", () => {
    // Un glob qui ne trouverait rien ferait passer cette suite au vert sans
    // avoir rien vérifié — le pire résultat possible pour un test de sécurité.
    expect(pageFiles().length).toBeGreaterThanOrEqual(8);
  });

  it("chaque page qui lit des données exige une session", () => {
    const unguarded: string[] = [];

    for (const file of pageFiles()) {
      if (PUBLIC_PAGES.has(file) || SELF_GUARDED.has(file)) continue;

      const source = readFileSync(`${APP_DIR}${file}`, "utf8");
      const readsData = DATA_LOADERS.some((loader) => source.includes(loader));
      if (!readsData) continue;

      if (!source.includes("requireOwner()")) unguarded.push(file);
    }

    expect(unguarded, "pages lisant des données sans exiger de session").toEqual([]);
  });

  it("la garde précède toute lecture de données", () => {
    const tooLate: string[] = [];

    for (const file of pageFiles()) {
      const source = readFileSync(`${APP_DIR}${file}`, "utf8");
      const guard = source.indexOf("await requireOwner()");
      if (guard === -1) continue;

      for (const loader of DATA_LOADERS) {
        const call = source.indexOf(`${loader}(`, source.indexOf("export default"));
        /*
         * Vérifier après avoir lu ne protège de rien : la requête est déjà
         * partie, et son coût comme ses éventuelles erreurs aussi.
         */
        if (call !== -1 && call < guard) tooLate.push(`${file} (${loader})`);
      }
    }

    expect(tooLate, "lecture de données avant la vérification de session").toEqual([]);
  });

  it("l'écran de connexion reste atteignable sans session", () => {
    const source = readFileSync(`${APP_DIR}connexion/page.tsx`, "utf8");
    expect(source).not.toContain("requireOwner()");
  });
});
