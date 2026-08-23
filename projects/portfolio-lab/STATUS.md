# PortfolioLab — Status

Dernière mise à jour : 23 août 2026

## Phase

**Lot 06 — Fonds de placement et NAV**

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

## Lot 06 — livrables vérifiés

- calendrier de publication : fraîcheur calculée en **jours ouvrés**, tolérance
  dépendant de la fréquence déclarée du fonds, jours fériés fournis par
  l'appelant et non codés en dur ;
- état `FUTURE_DATED` distinct : une NAV datée dans le futur est une anomalie de
  la source, pas une donnée fraîche ;
- résolution par ISIN exclusive — aucune substitution de classe de parts
  voisine, ambiguïté remontée à l'utilisateur ;
- devise contredisant l'ISIN signalée comme `MISMATCH`, jamais acceptée ;
- migration `0003_fund_metadata.sql` : `fund_details` et `fund_nav_history`,
  avec date de valeur distincte de l'instant de récupération ;
- ingestion NAV programmée, l'échec d'un fonds n'interrompant pas les autres ;
- contrôles stricts : type de prix, devise, valeur positive, horodatage lisible ;
- écran Fonds affichant NAV, date de valeur, classe de parts, devise, fréquence
  et explication de l'état en jours ouvrés ;
- une NAV inexploitable laisse la position **non valorisée**, jamais remplacée
  par une valeur de repli.

## Preuves d'exécution — Lot 06

| Commande                                  | Résultat                               |
| ----------------------------------------- | -------------------------------------- |
| `pnpm run format:check`                   | tous les fichiers conformes            |
| `pnpm run lint`                           | 0 erreur, 0 avertissement              |
| `pnpm run typecheck`                      | 8 packages, 0 erreur                   |
| `pnpm run test:unit`                      | 467 tests — verts                      |
| `pnpm run test:integration`               | 147 tests — verts, sur PostgreSQL réel |
| `pnpm run build`                          | build de production réussi             |
| `pnpm run test:e2e` (sans données)        | 84 tests — verts                       |
| `pnpm run test:e2e` (portefeuille peuplé) | 192 tests — verts                      |

67 tests portent spécifiquement sur les fonds : calendrier de jours ouvrés,
week-ends, jours fériés, absence de publication, résolution par ISIN, refus de
substitution de classe de parts, contrôles d'ingestion.

Un défaut de formulation trouvé et corrigé : l'écran affichait « Publiée
aujourd'hui » pour une NAV du vendredi lue le dimanche — zéro jour ouvré écoulé,
mais pas une publication du jour.

## Lot 05 — livrables vérifiés

- passerelle WebSocket persistante, canal `/live` authentifié ;
- jetons HMAC-SHA256 de cinq minutes, comparaison en temps constant, signature
  vérifiée avant l'expiration ;
- jeton transporté par le sous-protocole WebSocket, jamais par l'URL ;
- déduplication des abonnements par comptage de références, période de grâce de
  30 secondes ;
- cache du dernier cours rejetant les messages hors ordre et les valeurs
  inchangées ;
- péremption par nature de donnée — une NAV n'est pas périmée après une heure,
  une saisie manuelle ne se périme jamais ;
- diffusion groupée toutes les 250 ms, chaque client ne recevant que ses
  symboles ;
- backoff exponentiel avec gigue et disjoncteur par fournisseur ;
- heartbeat et fermeture des connexions silencieuses ;
- route `/api/live-token` côté PWA, sans cache ;
- hook client avec reconnexion, et indicateur d'état visible en permanence ;
- `DEMO_INSTRUMENTS` partagé entre passerelle et seed.

## Preuves d'exécution — Lot 05

| Commande                                  | Résultat                                         |
| ----------------------------------------- | ------------------------------------------------ |
| `pnpm run format:check`                   | tous les fichiers conformes                      |
| `pnpm run lint`                           | 0 erreur, 0 avertissement                        |
| `pnpm run typecheck`                      | 8 packages, 0 erreur                             |
| `pnpm run test:unit`                      | 400 tests — verts                                |
| `pnpm run test:integration`               | 133 tests — verts, dont 17 sur de vraies sockets |
| `pnpm run build`                          | build de production réussi                       |
| `pnpm run test:e2e` (sans données)        | 84 tests — verts                                 |
| `pnpm run test:e2e` (portefeuille peuplé) | 164 tests — verts                                |

Vérification en conditions réelles : la passerelle a été démarrée, `/health` a
répondu `liveChannel: "ready"`, et un client WebSocket réel a reçu le message de
bienvenue puis des cours après abonnement. Aucun message ne contenait le secret
partagé.

**Un défaut trouvé par cette vérification** : la passerelle instanciait le
fournisseur simulé avec une liste d'instruments vide. Elle démarrait, se
déclarait prête, acceptait les connexions et ne résolvait jamais aucun symbole.
Aucun test unitaire ne pouvait le voir. Corrigé, et couvert par un test dédié.

## Lot 04 — livrables vérifiés

- contrat `MarketDataProvider` sans aucun type propre à un vendeur ;
- fournisseur simulé déterministe, plafonné à la fraîcheur `MANUAL` ;
- suite d'assertions de conformité partagée, exportée hors de l'entrée
  principale pour ne pas imposer `vitest` aux consommateurs du package ;
- registre avec statuts de vérification ordonnés
  `UNVERIFIED` → `FIXTURE_TESTED` → `SANDBOX_TESTED` → `PRODUCTION_TESTED` ;
- matrice de couverture : 19 instruments, 8 catégories, conforme aux minimums de
  `MARKET_DATA.md` (2 actions US, 3 actions CH/EU, 2 ETF US, 2 ETF EU/CH,
  3 fonds Pictet de classes distinctes, 2 autres fonds, 3 options US sur 2
  sous-jacents, USD/CHF et EUR/CHF) ;
- rapport reproductible en JSON et Markdown, vérifié par la CI ;
- écran d'état des fournisseurs dans Réglages ;
- guide d'intégration `docs/market-data-integration.md`.

## Blocage majeur du Lot 04

**Aucun fournisseur réel n'a pu être interrogé, ni même documenté.**

Deux causes cumulées :

1. aucune clé d'API n'a été fournie ;
2. l'accès réseau aux fournisseurs est refusé par la politique de sortie de
   l'environnement — `twelvedata.com`, `eodhd.com`, `massive.com` et
   `openfigi.com` sont tous bloqués, documentation comprise.

Conséquence assumée : **aucun adaptateur réel n'a été écrit**. En écrire un dans
ces conditions produirait du code qui paraît intégré et une matrice qui
rapporterait comme testé ce qui ne l'a jamais été.

**Aucune recommandation de fournisseur ne peut donc être formulée à ce stade.**
La procédure pour lever le blocage est dans `docs/market-data-integration.md`.

## Preuves d'exécution — Lot 04

| Commande                                  | Résultat                               |
| ----------------------------------------- | -------------------------------------- |
| `pnpm run format:check`                   | tous les fichiers conformes            |
| `pnpm run lint`                           | 0 erreur, 0 avertissement              |
| `pnpm run typecheck`                      | 8 packages, 0 erreur                   |
| `pnpm run test:unit`                      | 288 tests — verts                      |
| `pnpm run test:integration`               | 114 tests — verts, sur PostgreSQL réel |
| `pnpm run build`                          | build de production réussi             |
| `pnpm run coverage:matrix`                | 19 instruments × 5 fournisseurs        |
| `pnpm run test:e2e` (sans données)        | 84 tests — verts                       |
| `pnpm run test:e2e` (portefeuille peuplé) | 156 tests — verts                      |

Résultat de la matrice : fournisseur simulé 9 résolus / 10 introuvables ;
Twelve Data, Massive, EODHD et OpenFIGI **19 jamais interrogés** chacun.

## Lot 03 — livrables vérifiés

- `packages/portfolio-engine` : moteur pur, sans entrée/sortie ni horloge
  implicite ; valorisation, P&L latent, variation du jour, allocation ;
- une donnée manquante produit une **raison** et jamais un zéro ; les positions
  non valorisées sont exclues du total et annoncées à l'écran ;
- chargeur de fixtures validé, refusant toute donnée fictive marquée `LIVE` ;
- mode démonstration verrouillé : littéral exact requis, exception levée si
  `NODE_ENV=production`, bandeau permanent non masquable ;
- CRUD comptes et positions par actions serveur, identité revalidée côté serveur
  à chaque action ;
- écrans : tableau de bord, liste des positions, fiche détaillée avec provenance
  complète, formulaire d'ajout, analyse, réglages ;
- badges de fraîcheur sur chaque ligne, méthode de valorisation, fournisseur,
  horodatage, taux FX appliqué et version du moteur visibles.

## Preuves d'exécution — Lot 03

Node 22.22.2 / pnpm 10.4.1 / PostgreSQL 16.13 :

| Commande                                  | Résultat                               |
| ----------------------------------------- | -------------------------------------- |
| `pnpm run format:check`                   | tous les fichiers conformes            |
| `pnpm run lint`                           | 0 erreur, 0 avertissement              |
| `pnpm run typecheck`                      | 8 packages, 0 erreur                   |
| `pnpm run test:unit`                      | 230 tests — verts                      |
| `pnpm run test:integration`               | 114 tests — verts, sur PostgreSQL réel |
| `pnpm run build`                          | 7 routes, dont 6 dynamiques            |
| `pnpm run test:e2e` (sans données)        | 84 tests sur 4 tailles — verts         |
| `pnpm run test:e2e` (portefeuille peuplé) | 140 tests sur 4 tailles — verts        |

Total du portefeuille de démonstration : **32 343.8925 CHF**, vérifié à la main
dans `tests/integration/demo-valuation.test.ts` et à l'écran.

Deux défauts trouvés par les tests pendant ce lot et corrigés :

1. une conversion de devise identité dégradait la fraîcheur d'un fonds NAV en
   « Manuel » ;
2. sans session mais avec une base, l'accueil affichait « aucun placement
   enregistré » au lieu de signaler l'absence d'authentification.

## Lot 02 — livrables vérifiés

- migration `0001_initial_schema.sql` : 13 tables, 10 types énumérés, contraintes
  de validation et déclencheurs `updated_at` ;
- migration `0002_row_level_security.sql` : RLS activée **et forcée** sur les 13
  tables, quatre politiques par table utilisateur, lecture seule sur le
  référentiel de marché, aucune politique sur le journal d'exploitation ;
- validation ISIN en base, format **et** clé de contrôle Luhn ;
- déclencheurs de cohérence hiérarchique empêchant de rattacher une ressource au
  portefeuille d'un tiers ;
- runner de migrations avec empreinte SHA-256 et détection de dérive ;
- `packages/database` : configuration validée, client avec `numeric` préservé en
  chaîne, repositories typés, traduction d'erreurs sans fuite de détail SQL ;
- `apps/web/src/lib/auth` : résolution d'état de session à quatre cas, détection
  d'une clé `service_role` exposée au navigateur ;
- seed de démonstration entièrement fictif, **sans aucun cours** ;
- CI dotée d'un service PostgreSQL 16 réel, avec garde-fou contre un saut
  silencieux des tests RLS.

## Preuves d'exécution — Lot 02

Commandes réellement exécutées le 23 août 2026, sur Node 22.22.2 / pnpm 10.4.1 /
PostgreSQL 16.13 :

| Commande                    | Résultat                                          |
| --------------------------- | ------------------------------------------------- |
| `pnpm run format:check`     | tous les fichiers conformes                       |
| `pnpm run lint`             | 0 erreur, 0 avertissement                         |
| `pnpm run typecheck`        | 8 packages, 0 erreur                              |
| `pnpm run test:unit`        | 149 tests, 13 fichiers — verts                    |
| `pnpm run test:integration` | 99 tests, 6 fichiers — verts, sur PostgreSQL réel |
| `pnpm run build`            | build de production réussi                        |
| `pnpm run test:e2e`         | 84 tests sur 4 tailles d'écran — verts            |

Vérification de la qualité des tests RLS par mutation : remplacer
`using (user_id = current_user_id())` par `using (true)` sur `portfolios` fait
échouer 3 tests. Les assertions ne sont donc pas vides.

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
  s'appelle PortfolioLab ;
- **aucun projet Supabase n'existe** : le schéma, les politiques et la résolution
  de session sont écrits et testés, mais le flux d'authentification réel
  (échange de cookie, rappel OAuth) n'est branché sur rien. L'interface l'annonce
  explicitement plutôt que de simuler une session.

## Journal

| Date       | Événement                            | Preuve                                           |
| ---------- | ------------------------------------ | ------------------------------------------------ |
| 2026-08-23 | Initialisation du dépôt d'incubation | commit initial README                            |
| 2026-08-23 | Création de la branche du skill      | `skill/portfolio-lab-master`                     |
| 2026-08-23 | Rédaction du Lot 00                  | fichiers de spécification et skill               |
| 2026-08-23 | Fusion du Lot 00 dans `main`         | PR #1                                            |
| 2026-08-23 | Lot 01 — fondation du workspace      | branche `claude/portfolio-lab-lot-01-foundation` |
