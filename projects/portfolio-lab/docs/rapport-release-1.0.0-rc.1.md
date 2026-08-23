# Rapport de release — PortfolioLab 1.0.0-rc.1

Candidat proposé : **`portfolio-lab-v1.0.0-rc.1`**.

> **Aucun tag n'a été créé, et aucun déploiement n'a été fait.** La commande
> l'interdit sans validation explicite. Ce document propose ; il ne publie pas.

---

## 1. Ce que le produit fait

Une application patrimoniale personnelle où l'utilisateur saisit lui-même ses
placements — actions, ETF, fonds, options, liquidités — et obtient un total
consolidé en francs suisses, avec la provenance et la fraîcheur de chaque
donnée.

| Capacité                                                                  | État          |
| ------------------------------------------------------------------------- | ------------- |
| Saisie manuelle de positions, comptes, contrats d'option                  | livré         |
| Modification et suppression d'une position                                | livré         |
| Valorisation décimale exacte, réconciliée et affichée                     | livré         |
| Conversion multi-devises vers le CHF                                      | livré         |
| Fonds valorisés par NAV, avec date de valeur et fraîcheur en jours ouvrés | livré         |
| Options : identité exacte du contrat, mark auditable                      | livré         |
| Historique du patrimoine, contribution au P&L, exposition options         | livré         |
| PWA installable, dégradation hors ligne annoncée et datée                 | livré         |
| Sauvegarde et suppression complète des données                            | livré         |
| Cloisonnement par Row Level Security                                      | livré         |
| **Authentification**                                                      | **non livré** |
| **Cours de marché réels**                                                 | **non livré** |

## 2. Ce que le produit ne fait pas, et ne fera pas

Aucune connexion bancaire, aucun import de compte, aucun mot de passe bancaire,
aucun scraping d'espace client, aucun ordre, aucune fonctionnalité de trading,
aucune recommandation. Les noms « Swissquote », « IBKR », « UBS », « BCGE » ne
sont que des étiquettes de comptes saisies par l'utilisateur.

---

## 3. Preuves d'exécution

Toutes les commandes ci-dessous ont été **exécutées**, et leur sortie observée.

| Commande                                  | Résultat                             |
| ----------------------------------------- | ------------------------------------ |
| `pnpm run format:check`                   | conforme                             |
| `pnpm run lint`                           | 0 erreur, 0 avertissement            |
| `pnpm run typecheck`                      | 9 packages, 0 erreur                 |
| `pnpm run test:unit`                      | **632** tests verts                  |
| `pnpm run test:integration`               | **169** tests verts, PostgreSQL réel |
| `pnpm run build`                          | build de production réussi           |
| `pnpm run test:e2e` (sans données)        | **144** verts                        |
| `pnpm run test:e2e` (portefeuille peuplé) | **325** verts, 75 ignorés            |
| `pnpm audit --audit-level moderate`       | aucune vulnérabilité connue          |

Les 75 ignorés sont les parcours de session — sans objet en mode démonstration —
ceux qui dépendent du service worker, que `next dev` n'enregistre pas, et ceux
volontairement restreints à un seul gabarit parce qu'ils écrivent en base.

## 4. Checklist Release candidate 1.0

| #   | Critère                                                     | État                                                        |
| --- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | Tous les parcours critiques passent                         | **8/10** — authentification absente, ajout par ISIN partiel |
| 2   | Aucun calcul financier en flottant                          | ✅ vérifié par test                                         |
| 3   | Les agrégats se réconcilient avec les positions et les taux | ✅ affiché et testé                                         |
| 4   | Aucune donnée présentée comme plus fraîche qu'elle ne l'est | ✅                                                          |
| 5   | Aucune donnée fictive présentée comme réelle                | ✅ bandeau permanent, refus du mode démo en production      |
| 6   | Données personnelles cloisonnées                            | ✅ RLS activée **et forcée**, testée par mutation           |
| 7   | Export et suppression complète                              | ✅ suppression vérifiée table par table                     |
| 8   | Dégradation hors ligne annoncée                             | ✅ sans dépendre du JavaScript                              |
| 9   | Aucun secret dans le dépôt                                  | ✅ scan d'historique en CI                                  |
| 10  | Dépendances auditées                                        | ✅ 0 vulnérabilité, échec CI au niveau `moderate`           |
| 11  | Documentation d'installation et d'exploitation              | ✅                                                          |
| 12  | Runbook de reprise                                          | ✅ 11 symptômes                                             |
| 13  | Matrice de compatibilité                                    | ✅ y compris ce qui n'a jamais été exécuté                  |
| 14  | Couverture marché réelle documentée                         | ✅ **nulle**, et documentée comme telle                     |
| 15  | Validation visuelle par l'utilisateur                       | ⛔ **en attente**                                           |
| 16  | Tag créé                                                    | ⛔ **non**, volontairement                                  |

**Verdict : release candidate, pas release.** Les critères 1 et 15 ne sont pas
remplis, et le 15 ne peut pas l'être sans vous.

---

## 5. Ce qui bloque une mise en production

### L'authentification n'est pas implémentée

Machine d'états et détection de configuration existent et sont testées ; l'écran
de connexion et la lecture de session n'existent pas. Brancher Supabase Auth
demande un projet Supabase, donc un compte externe.

Écrire ce flux sans pouvoir l'exécuter une seule fois produirait du code qui
_paraît_ intégré et un rapport qui l'annoncerait comme livré. La commande
l'interdit explicitement.

**Conséquence :** ne pas exposer l'application sur un réseau public. Le mode
démonstration, seul moyen actuel d'obtenir une identité, est refusé en
production par une garde explicite — c'est ce qui empêche de contourner
l'absence d'authentification.

### Aucun cours réel n'a jamais transité

Ni clé d'API, ni accès réseau aux quatre fournisseurs évalués — documentation
comprise. Aucun adaptateur réel n'a donc été écrit, et **aucune recommandation
de fournisseur n'est formulée** : elle ne pourrait reposer que sur des
affirmations commerciales, ce que `MARKET_DATA.md` interdit.

---

## 6. Ce que je recommande de vérifier en premier

1. **Safari sur iPhone.** C'est la cible réelle, et aucun test n'y a tourné.
   Les gabarits « iPhone » de la suite sont des dimensions rendues par Chromium,
   pas par WebKit. Service worker en application installée, `safe-area-inset`,
   formatage des nombres : autant de points où WebKit diffère.
2. **Une saisie réelle.** Créer un compte, saisir trois positions réelles,
   vérifier que les totaux correspondent à ce que vous attendez. Le moteur est
   testé, mais jamais contre votre propre portefeuille.
3. **La lisibilité des écrans** en conditions réelles — c'est le critère 15, et
   il vous appartient.

---

## 7. Dette technique connue

| Sujet                                          | Impact                                      | Effort estimé                                         |
| ---------------------------------------------- | ------------------------------------------- | ----------------------------------------------------- |
| Authentification Supabase                      | bloquant pour une exposition publique       | moyen, dépend d'un compte externe                     |
| Adaptateurs fournisseurs                       | aucune donnée réelle                        | moyen par fournisseur, dépend d'une clé et d'un accès |
| Recherche, filtres et tri sur `/positions`     | confort, invisible à six positions          | faible                                                |
| Prévisualisation avant confirmation d'un ajout | confort                                     | faible, dépend d'un cours                             |
| Enregistrement d'option depuis l'écran guidé   | contournable par la saisie manuelle         | faible, dépend d'un fournisseur                       |
| Import d'une sauvegarde                        | l'export ne permet pas de recharger un état | moyen                                                 |
| Snapshot quotidien automatique                 | l'enregistrement est manuel                 | faible, dépend d'un ordonnanceur                      |
| `'unsafe-inline'` sur `script-src`             | politique moins stricte qu'idéale           | moyen — middleware à nonce                            |
| Limitation de débit locale au processus        | insuffisante en multi-instance              | faible, si le besoin apparaît                         |
| Actions GitHub sur Node 20                     | avertissement de CI                         | faible, dépendance externe                            |
| Libellé « marché fermé »                       | rendu comme « dernière clôture »            | moyen — calendrier de places                          |

---

## 8. Si vous validez

```bash
git tag -a portfolio-lab-v1.0.0-rc.1 -m "PortfolioLab release candidate 1.0"
git push origin portfolio-lab-v1.0.0-rc.1
```

Le préfixe `portfolio-lab-` est délibéré : le dépôt héberge plusieurs projets,
et un tag `v1.0.0` nu laisserait croire qu'il les concerne tous.

**Je n'ai pas exécuté ces commandes.**
