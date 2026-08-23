# PortfolioLab — Status

Dernière mise à jour : 23 août 2026

## Phase

**Lot 01 — Fondation du workspace**

## État global

| Sujet                          | État                                     |
| ------------------------------ | ---------------------------------------- |
| Produit défini                 | oui                                      |
| Skill Claude Code              | fusionné dans `main` (PR #1)             |
| Architecture documentée        | oui                                      |
| Workspace exécutable           | oui                                      |
| PWA installable                | coquille en place, installable           |
| Base de données                | non commencée (Lot 02)                   |
| Authentification               | non commencée (Lot 02)                   |
| Fournisseur de marché choisi   | non, volontairement (décision au Lot 04) |
| Matrice de couverture exécutée | non (Lot 04)                             |
| Clé API réelle en dépôt        | aucune, par conception                   |
| Déploiement                    | aucun                                    |

## Avancement par lot

| Lot | Objet                                             | État              |
| --- | ------------------------------------------------- | ----------------- |
| 00  | Spécification et skill                            | terminé, fusionné |
| 01  | Fondation workspace, PWA, design, CI              | terminé           |
| 02  | Auth, PostgreSQL, RLS                             | à faire           |
| 03  | Comptes et positions manuelles                    | à faire           |
| 04  | Résolution d'instruments et matrice de couverture | à faire           |
| 05  | Actions, ETF et FX live                           | à faire           |
| 06  | Fonds et NAV                                      | à faire           |
| 07  | Options                                           | à faire           |
| 08  | Dashboard et analyse                              | à faire           |
| 09  | Fiabilité, PWA et sécurité                        | à faire           |
| 10  | Release candidate 1.0                             | à faire           |

## Lot 01 — livrables vérifiés

- workspace `pnpm` à 7 packages sous `projects/portfolio-lab/` ;
- `apps/web` : PWA Next.js 15 App Router, TypeScript strict, `typedRoutes` ;
- `apps/market-gateway` : processus Node autonome, configuration validée par
  Zod, journal expurgé, endpoint `/health` — aucune connexion fournisseur ;
- `packages/domain` : décimales exactes (`decimal.js`), devises fermées,
  énumérations de fraîcheur et de type de prix ;
- `packages/ui` : tokens obsidienne/cuivre, contraste AA vérifié par test,
  formatage monétaire suisse ;
- `packages/portfolio-engine`, `market-data`, `database` : frontières posées,
  contenu au lot correspondant ;
- navigation mobile à cinq onglets, `Ajouter` au centre ;
- manifeste PWA, icônes générées, `apple-touch-icon`, service worker minimal ;
- en-têtes de sécurité et `robots: noindex` ;
- `.env.example` documenté, aucun `.env` réel versionné ;
- CI GitHub : format, lint, typecheck, tests, build, E2E, scan de secrets ;
- ADR 0001 consignant les choix techniques.

## Preuves d'exécution — Lot 01

Commandes réellement exécutées le 23 août 2026, sur Node 22.22.2 / pnpm 10.4.1 :

| Commande                    | Résultat                                              |
| --------------------------- | ----------------------------------------------------- |
| `pnpm install`              | 8 projets, lockfile généré                            |
| `pnpm run format:check`     | tous les fichiers conformes                           |
| `pnpm run lint`             | 0 erreur, 0 avertissement                             |
| `pnpm run typecheck`        | 7 packages, 0 erreur                                  |
| `pnpm run test:unit`        | 113 tests, 9 fichiers — verts                         |
| `pnpm run test:integration` | 23 tests, 2 fichiers — verts                          |
| `pnpm run build`            | 7 packages, 6 routes statiques, ~106 kB First Load JS |
| `pnpm run test:e2e`         | 60 tests sur 4 tailles d'écran — verts                |

Captures vérifiées en 390×844, 430×932, 768×1024 et 1280×900.

## Décisions actées

Décisions produit du Lot 00, inchangées :

- l'utilisateur ajoute lui-même toutes les positions ;
- aucune connexion à une banque ou un courtier ;
- CHF comme devise de consolidation ;
- actions/ETF/options live ou différés selon le fournisseur ;
- fonds valorisés avec leur dernière NAV ;
- architecture multi-fournisseurs ;
- clés uniquement côté serveur ;
- application privée, installable comme PWA ;
- style sombre obsidienne/cuivre.

Décisions techniques du Lot 01 (détail dans `docs/adr/0001-socle-technique.md`) :

- `decimal.js` en précision 34, arrondi bancaire, transport en `DecimalString` ;
- locale numérique `de-CH` avec interface française — `fr-CH` mélange point et
  virgule décimale entre devises et pourcentages ;
- Tailwind 4 relié aux tokens `--pl-*` par `@theme inline`, source unique
  vérifiée par test ;
- icônes PWA générées par script, comparées au pixel et non à l'octet ;
- Vitest en deux projets distincts `unit` et `integration`.

## Blocages connus

- aucun abonnement data ne doit être choisi avant le Lot 04 et la matrice de
  couverture ;
- aucune clé API réelle n'est disponible : les intégrations fournisseurs seront
  développées contre des fixtures et un fournisseur `mock` déterministe, et
  resteront explicitement marquées « en attente de clé » ;
- le dépôt porte encore le nom d'incubation `Bordel-Teste-`, même si le projet
  s'appelle PortfolioLab.

## Journal

| Date       | Événement                            | Preuve                                           |
| ---------- | ------------------------------------ | ------------------------------------------------ |
| 2026-08-23 | Initialisation du dépôt d'incubation | commit initial README                            |
| 2026-08-23 | Création de la branche du skill      | `skill/portfolio-lab-master`                     |
| 2026-08-23 | Rédaction du Lot 00                  | fichiers de spécification et skill               |
| 2026-08-23 | Fusion du Lot 00 dans `main`         | PR #1                                            |
| 2026-08-23 | Lot 01 — fondation du workspace      | branche `claude/portfolio-lab-lot-01-foundation` |
