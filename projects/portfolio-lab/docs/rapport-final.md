# Rapport final — PortfolioLab

Développement complet, du Lot 01 au Lot 10. Dernier commit de `main` :
**`0a6e87a9dfc3eebd731b33023b6044adc9159671`**.

---

## 1. État global

PortfolioLab est une **application patrimoniale personnelle et privée**. On y
saisit soi-même ses placements — actions, ETF, fonds, options, liquidités,
autres actifs manuels — et on obtient un total consolidé en francs suisses,
avec la provenance et la fraîcheur de chaque donnée.

Les onze lots prévus sont développés, testés et fusionnés dans `main`. Le
produit est utilisable **en local**, de bout en bout.

Il n'est **pas** prêt pour une exposition publique : l'authentification n'est
pas implémentée, et aucun cours de marché réel n'a jamais transité. Ces deux
points dépendent d'éléments extérieurs à cet environnement.

**Verdict : release candidate, pas release.**

---

## 2. Fonctionnalités réellement terminées

Vérifiées par des tests exécutés, dont la sortie a été observée.

| Domaine        | Détail                                                                         |
| -------------- | ------------------------------------------------------------------------------ |
| Comptes        | création, archivage ; étiquettes libres, aucun identifiant bancaire            |
| Positions      | ajout, **modification**, suppression, fiche détaillée                          |
| Valorisation   | décimale exacte, multi-devises, multiplicateurs, positions vendeuses           |
| Réconciliation | identité comptable recalculée à chaque rendu et **affichée**                   |
| Fonds          | NAV avec date de valeur, fraîcheur en **jours ouvrés**, classe de parts        |
| Options        | symbole OSI exact, parcours guidé en cinq étapes, mark auditable               |
| Analyse        | allocations, historique quotidien, contribution au P&L, exposition notionnelle |
| Historique     | points mesurés, jamais reconstitués ; empreinte des composants                 |
| PWA            | installable, dégradation hors ligne **annoncée et datée**                      |
| Données        | sauvegarde JSON, suppression complète **vérifiée table par table**             |
| Sécurité       | RLS activée et forcée, journal expurgé, limitation de débit                    |
| Passerelle     | WebSocket authentifiée, déduplication, backoff, disjoncteur                    |

## 3. Fonctionnalités reposant sur des fixtures

Elles fonctionnent réellement, mais sur des données inventées.

| Fonctionnalité           | Source                           | Marquage                                         |
| ------------------------ | -------------------------------- | ------------------------------------------------ |
| Cours des actions et ETF | `tests/fixtures/demo-marks.json` | `MANUAL`, jamais `LIVE`                          |
| Taux de change           | même fixture                     | `MANUAL`                                         |
| NAV des fonds            | seed                             | `NAV`, avec date de valeur                       |
| Chaîne d'options         | fixture                          | couvre liquide, illiquide, sans cotation, expiré |
| Flux temps réel          | fournisseur simulé déterministe  | plafonné à `MANUAL`                              |

Aucune de ces données n'est présentée comme réelle. Un test E2E vérifie que la
mention « En direct » n'apparaît **nulle part**.

## 4. Intégrations en attente d'une clé

| Intégration   | Manque                  | Conséquence                                  |
| ------------- | ----------------------- | -------------------------------------------- |
| Twelve Data   | clé **et** accès réseau | adaptateur non écrit                         |
| Massive       | clé **et** accès réseau | adaptateur non écrit                         |
| EODHD         | clé **et** accès réseau | adaptateur non écrit                         |
| OpenFIGI      | clé **et** accès réseau | adaptateur non écrit ; ne fournit aucun prix |
| Supabase Auth | projet Supabase         | authentification non implémentée             |

Les quatre fournisseurs sont enregistrés avec `create: () => null`,
**systématiquement** : renseigner une clé n'active rien. C'est délibéré — un
adaptateur écrit sans avoir pu appeler le service une seule fois produirait du
code qui _paraît_ intégré. La procédure pour lever le blocage est dans
`market-data-integration.md`.

## 5. Fournisseurs recommandés

**Aucune recommandation n'est formulée.**

Les quatre domaines sont refusés par la politique de sortie de l'environnement,
documentation comprise, et aucune clé n'a été fournie. Une recommandation ne
pourrait donc reposer que sur les affirmations commerciales des vendeurs — ce
que `MARKET_DATA.md` interdit explicitement de prendre pour argent comptant.

Ce serait la partie du rapport la plus susceptible d'être suivie, et la moins
fondée.

La matrice de couverture rapporte 19 instruments × 4 fournisseurs en `NOT_RUN`,
jamais `NOT_FOUND` : « pas essayé » et « introuvable » sont deux faits
différents.

## 6. Tests exécutés et résultats

| Commande                                  | Résultat                       |
| ----------------------------------------- | ------------------------------ |
| `pnpm run format:check`                   | conforme                       |
| `pnpm run lint`                           | 0 erreur, 0 avertissement      |
| `pnpm run typecheck`                      | 9 packages, 0 erreur           |
| `pnpm run test:unit`                      | **632** verts                  |
| `pnpm run test:integration`               | **169** verts, PostgreSQL réel |
| `pnpm run build`                          | réussi                         |
| `pnpm run test:e2e` (sans données)        | **144** verts                  |
| `pnpm run test:e2e` (portefeuille peuplé) | **325** verts, 75 ignorés      |
| `pnpm audit --audit-level moderate`       | aucune vulnérabilité           |

**1 270 tests** au total (632 + 169 + 144 + 325), répartis sur 47 fichiers
unitaires et d'intégration et 6 suites E2E. Les parcours E2E sont comptés une
fois par gabarit d'écran : un même test exécuté sur quatre tailles compte pour
quatre.

Plusieurs assertions ont été **vérifiées par mutation**, pour prouver qu'elles
ne sont pas vides : retirer `force row level security`, falsifier un total,
élargir un tableau au-delà de son conteneur, désactiver le réchauffement du
cache. Chaque fois, le test a bien échoué.

## 7. Architecture finale

```
projects/portfolio-lab/
  apps/
    web/               Next.js 15 App Router, PWA, rendu serveur
    market-gateway/    processus Node autonome, WebSocket
  packages/
    domain/            décimales exactes, devises, fraîcheur
    portfolio-engine/  valorisation et analyse — pur, sans horloge
    market-data/       contrat fournisseur, simulé, NAV, options
    database/          client PostgreSQL, migrations, repositories
    security/          expurgation, journal, limitation de débit
    ui/                tokens de design, formatage suisse
  supabase/migrations/ 3 migrations, 15 tables
  tests/               intégration, E2E, fixtures
  docs/                10 ADR, audit, installation, runbook, matrices
```

Trois principes traversent l'ensemble :

1. **Aucun calcul financier en flottant.** `decimal()` refuse délibérément une
   entrée `number`.
2. **Aucune donnée présentée comme plus fraîche qu'elle ne l'est.** Le moteur
   ne choisit jamais un prix ; il propage celui qu'on lui donne, avec sa
   provenance.
3. **Rien n'est compté à zéro.** Une position non valorisable est exclue du
   total et signalée, jamais additionnée comme nulle.

## 8. Sécurité

| Mesure                        | État                                                       |
| ----------------------------- | ---------------------------------------------------------- |
| Row Level Security            | activée **et forcée**, 4 politiques par table utilisateur  |
| Validation Zod aux frontières | oui                                                        |
| Limitation de débit           | oui, par identité, après authentification                  |
| En-têtes de sécurité          | CSP, HSTS, `nosniff`, `frame-ancestors 'none'`             |
| Canal temps réel              | HMAC-SHA256, comparaison en temps constant, jeton hors URL |
| Journal expurgé               | secrets **par valeur**, montants et identifiants aussi     |
| Erreurs utilisateur           | séparées du détail interne                                 |
| Suppression des données       | complète et **vérifiée table par table**                   |
| Scan de secrets               | historique complet, en CI                                  |
| Dépendances                   | 0 vulnérabilité, CI échoue au niveau `moderate`            |
| Clés fournisseurs             | côté serveur uniquement ; test E2E le vérifie              |

Aucun secret, aucune donnée financière réelle, aucun `.env` n'est versionné.

## 9. Installation locale

Détail complet dans `installation.md`.

```bash
cd projects/portfolio-lab
pnpm install
createdb portfolio_lab
export DATABASE_URL="postgresql://<utilisateur>@localhost:5432/portfolio_lab"
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
pnpm run build && pnpm --filter @portfolio-lab/web run start
```

Données de démonstration, facultatives et entièrement fictives :
`psql "$DATABASE_URL" -f supabase/seed.sql`.

## 10. Installation sur l'écran d'accueil d'un iPhone

Sans App Store, sans compte développeur.

1. ouvrir l'URL dans **Safari** — sur iOS, seul Safari peut ajouter à l'écran
   d'accueil ;
2. bouton **Partager** ;
3. **Sur l'écran d'accueil** ;
4. valider.

L'application s'ouvre en plein écran, sans barre d'adresse, avec son icône et
son thème sombre. Les écrans déjà consultés restent disponibles hors connexion,
assortis d'un bandeau qui annonce leur âge.

Sur une installation locale, l'URL doit être joignable depuis le téléphone :
même réseau, et l'adresse de la machine plutôt que `localhost`.

## 11. Variables d'environnement

| Variable                        | Requise | Rôle                                         |
| ------------------------------- | ------- | -------------------------------------------- |
| `DATABASE_URL`                  | **oui** | connexion PostgreSQL                         |
| `PORTFOLIO_LAB_DEMO_MODE`       | non     | `true` ; **refusé si `NODE_ENV=production`** |
| `LOG_LEVEL`                     | non     | `debug` \| `info` \| `warn` \| `error`       |
| `MARKET_GATEWAY_SHARED_SECRET`  | non     | ≥ 32 caractères ; sinon canal en 503         |
| `MARKET_GATEWAY_URL`            | non     | URL du canal temps réel                      |
| `NEXT_PUBLIC_SUPABASE_URL`      | non     | authentification, non implémentée            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | non     | authentification, non implémentée            |
| `TWELVE_DATA_API_KEY`           | non     | **aucun adaptateur ne la lit**               |
| `MASSIVE_API_KEY`               | non     | idem                                         |
| `EODHD_API_KEY`                 | non     | idem                                         |
| `OPENFIGI_API_KEY`              | non     | idem                                         |
| `DATABASE_URL_TEST`             | tests   | sans elle, les suites base **s'ignorent**    |

Toutes sont documentées dans `.env.example`.

## 12. Limites connues

- **l'authentification n'est pas implémentée** — ne pas exposer publiquement ;
- **aucun cours réel n'a jamais transité** ;
- **Safari n'a jamais été testé**, alors que c'est la cible du produit : les
  gabarits « iPhone » de la suite sont rendus par Chromium, pas par WebKit ;
- pas de recherche d'instrument par nom, ticker ou ISIN ;
- pas de prévisualisation de la valorisation avant confirmation d'un ajout ;
- l'enregistrement d'une option depuis l'écran guidé n'est pas branché ;
- pas de recherche, de filtres ni de tri sur la liste des positions ;
- pas de graphique par position — l'historique est au niveau du portefeuille ;
- snapshot quotidien **manuel** : l'automatiser demande un ordonnanceur ;
- **pas d'import** d'une sauvegarde ;
- le hors ligne n'est vérifié que sans données ;
- limitation de débit **locale au processus**, perdue au redémarrage ;
- « marché fermé » rendu comme « dernière clôture », sans libellé propre ;
- aucun test de charge, aucune exécution multi-instance.

## 13. Dette technique

| Sujet                                 | Impact                                | Effort                                     |
| ------------------------------------- | ------------------------------------- | ------------------------------------------ |
| Authentification Supabase             | bloquant pour une exposition publique | moyen, compte externe requis               |
| Adaptateurs fournisseurs              | aucune donnée réelle                  | moyen par fournisseur, clé et accès requis |
| Import d'une sauvegarde               | pas de restauration                   | moyen                                      |
| `'unsafe-inline'` sur `script-src`    | politique moins stricte               | moyen — middleware à nonce                 |
| Recherche, filtres, tri des positions | confort                               | faible                                     |
| Prévisualisation avant ajout          | confort                               | faible                                     |
| Snapshot quotidien automatique        | enregistrement manuel                 | faible                                     |
| Limitation de débit distribuée        | insuffisante en multi-instance        | faible                                     |
| Actions GitHub sur Node 20            | avertissement CI                      | faible                                     |
| Libellé « marché fermé »              | approximation                         | moyen — calendrier de places               |

## 14. Pull requests

| PR                                                              | Objet                                               |
| --------------------------------------------------------------- | --------------------------------------------------- |
| [#1](https://github.com/Mendestrading21/Bordel-Teste-/pull/1)   | Skill maître et plan d'implémentation               |
| [#3](https://github.com/Mendestrading21/Bordel-Teste-/pull/3)   | Lot 01 — Fondation, PWA, design, CI                 |
| [#4](https://github.com/Mendestrading21/Bordel-Teste-/pull/4)   | Lot 02 — PostgreSQL, migrations, RLS                |
| [#5](https://github.com/Mendestrading21/Bordel-Teste-/pull/5)   | Lot 03 — Comptes, positions, valorisation           |
| [#6](https://github.com/Mendestrading21/Bordel-Teste-/pull/6)   | Lot 04 — Contrat fournisseur, matrice de couverture |
| [#7](https://github.com/Mendestrading21/Bordel-Teste-/pull/7)   | Lot 05 — Passerelle temps réel, canal authentifié   |
| [#8](https://github.com/Mendestrading21/Bordel-Teste-/pull/8)   | Lot 06 — Fonds et NAV                               |
| [#9](https://github.com/Mendestrading21/Bordel-Teste-/pull/9)   | Lot 07 — Options                                    |
| [#10](https://github.com/Mendestrading21/Bordel-Teste-/pull/10) | Lot 08 — Dashboard et analyse                       |
| [#11](https://github.com/Mendestrading21/Bordel-Teste-/pull/11) | Lot 09 — Fiabilité, PWA et sécurité                 |
| [#12](https://github.com/Mendestrading21/Bordel-Teste-/pull/12) | Lot 10 — Release candidate 1.0                      |

Toutes fusionnées, CI verte.

## 15. Dernier commit de `main`

```
0a6e87a9dfc3eebd731b33023b6044adc9159671
Lot 10 — Release candidate 1.0 : audit fonctionnel, modification de position,
rapport de version (#12)
```

## 16. Checklist Release candidate 1.0

| #   | Critère                                                     | État                       |
| --- | ----------------------------------------------------------- | -------------------------- |
| 1   | Parcours critiques                                          | **8/10**                   |
| 2   | Aucun calcul financier en flottant                          | ✅                         |
| 3   | Agrégats réconciliés avec positions et taux                 | ✅                         |
| 4   | Aucune donnée présentée comme plus fraîche qu'elle ne l'est | ✅                         |
| 5   | Aucune donnée fictive présentée comme réelle                | ✅                         |
| 6   | Données personnelles cloisonnées                            | ✅                         |
| 7   | Export et suppression complète                              | ✅                         |
| 8   | Dégradation hors ligne annoncée                             | ✅                         |
| 9   | Aucun secret dans le dépôt                                  | ✅                         |
| 10  | Dépendances auditées                                        | ✅                         |
| 11  | Documentation installation et exploitation                  | ✅                         |
| 12  | Runbook de reprise                                          | ✅                         |
| 13  | Matrice de compatibilité                                    | ✅                         |
| 14  | Couverture marché réelle documentée                         | ✅ **nulle**               |
| 15  | Validation visuelle par l'utilisateur                       | ⛔ **en attente**          |
| 16  | Tag créé                                                    | ⛔ **non, volontairement** |

---

## Interdictions respectées

Aucune connexion bancaire. Aucun import de compte. Aucun mot de passe bancaire.
Aucun scraping. Aucun ordre, sous aucune forme. Aucune fonctionnalité de
trading. Aucune fausse donnée présentée comme live. Aucune clé d'API dans le
navigateur ni dans Git. Aucune donnée financière personnelle réelle dans le
dépôt.

**Aucun déploiement. Aucun tag. Aucune release.** Le tag
`portfolio-lab-v1.0.0-rc.1` est **proposé** dans
`rapport-release-1.0.0-rc.1.md`, et attend votre accord.
