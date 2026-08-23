# Audit fonctionnel — Release candidate 1.0

Date : 23 août 2026. Base : `main` après fusion du Lot 09.

Cet audit confronte l'application **à ce que les documents de référence
exigent**, pas à ce qui a été construit. Chaque ligne porte un état vérifié et,
quand l'état n'est pas « livré », la raison précise.

Un état ne vaut que s'il est vérifiable. Les mentions « livré » renvoient à des
tests réellement exécutés ; celles qui ne le sont pas le disent.

---

## Parcours critiques — `QUALITY_GATES.md`

| #   | Parcours                                   | État          | Vérification                                                                                     |
| --- | ------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------ |
| 1   | Authentification                           | **non livré** | machine d'états et détection de configuration seulement — voir « Écart bloquant »                |
| 2   | Création d'un compte                       | livré         | E2E, quatre gabarits                                                                             |
| 3   | Ajout d'une action                         | livré         | E2E, quatre gabarits                                                                             |
| 4   | Ajout d'un fonds par ISIN                  | **partiel**   | résolution par ISIN implémentée et testée ; aucun écran de recherche — bloqué fournisseur        |
| 5   | Ajout d'une option guidée                  | **partiel**   | parcours en cinq étapes livré et testé ; l'enregistrement depuis cet écran attend un fournisseur |
| 6   | Réception d'un tick simulé                 | livré         | tests d'intégration sur de vraies sockets ; le trajet navigateur exige un secret configuré       |
| 7   | Consultation du dashboard                  | livré         | E2E, quatre gabarits                                                                             |
| 8   | Affichage d'une donnée périmée             | livré         | badges de fraîcheur, E2E                                                                         |
| 9   | Redémarrage hors ligne avec dernier état   | livré         | E2E sur build de production, sans données                                                        |
| 10  | Modification et suppression d'une position | livré         | ajouté au Lot 10 — la suppression existait, la modification manquait                             |

## Écrans obligatoires — `PRODUCT_SPEC.md`

| Écran                  | État        | Réserve                                                                                        |
| ---------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| 1. Accueil             | livré       | « principales positions » non listées sur l'accueil : elles sont sur `/positions`, à un onglet |
| 2. Positions           | **partiel** | recherche, filtres et tri absents — voir « Écarts non bloquants »                              |
| 3. Ajouter             | **partiel** | pas de recherche fournisseur ni de prévisualisation avant confirmation                         |
| 4. Détail position     | livré       | pas de graphique historique par position — l'historique est au niveau du portefeuille          |
| 5. Analyse             | livré       | —                                                                                              |
| 6. Réglages et données | livré       | —                                                                                              |

Le `§9` de la commande ajoute un écran d'**onboarding**. Il n'existe pas comme
route distincte : l'état vide de l'accueil en tient lieu — il explique le
produit, dit ce que l'application ne fait pas, et mène à la première action.
C'est une lecture assumée, signalée ici plutôt que passée sous silence.

## États obligatoires

| État                   | Conçu              | Où                                                       |
| ---------------------- | ------------------ | -------------------------------------------------------- |
| Chargement             | oui                | rendu serveur ; aucun écran ne clignote sur un état vide |
| Aucun résultat         | oui                | portefeuille vide, historique vide, aucune option        |
| Erreur réseau          | oui                | bandeau hors ligne, « Données indisponibles »            |
| Instrument non couvert | oui                | position non valorisée, motif affiché                    |
| Marché fermé           | **implicite**      | rendu comme « dernière clôture » ; aucun libellé propre  |
| Cours différé          | oui                | badge de fraîcheur                                       |
| Dernière NAV           | oui                | écran Fonds, date de valeur et fréquence                 |
| Donnée périmée         | oui                | `STALE`, distinct d'« indisponible »                     |
| Mode hors ligne        | oui                | bandeau daté, page de secours                            |
| Session expirée        | **non applicable** | dépend de l'authentification, non livrée                 |

---

## Écart bloquant pour une mise en production

### L'authentification n'est pas implémentée

`server.ts` le dit sans détour : aucun cookie n'est lu, et l'état honnête
renvoyé est « anonyme ». Ce qui existe :

- la machine d'états de session, testée ;
- la détection de configuration Supabase, testée ;
- des écrans qui **refusent d'afficher un patrimoine** sans identité établie ;
- RLS active et forcée en base, testée sur PostgreSQL réel.

Ce qui manque : l'écran de connexion et la lecture réelle de la session.

**Pourquoi ce n'est pas comblé ici.** Brancher Supabase Auth demande un projet
Supabase — donc un compte externe. Écrire le flux sans pouvoir l'exécuter une
seule fois produirait du code qui _paraît_ intégré, et un rapport qui
l'annoncerait comme livré. C'est exactement ce que la commande interdit.

**Conséquence.** L'application ne doit pas être exposée publiquement en l'état.
Le mode démonstration, seul moyen actuel d'obtenir une identité, est refusé en
production par une garde explicite — c'est ce qui empêche aujourd'hui de
contourner l'absence d'authentification.

---

## Écarts non bloquants

| Écart                                                 | Effet                                                      | Pourquoi il reste                                                                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Pas de recherche fournisseur (nom, ticker, ISIN)      | seuls les instruments déjà enregistrés sont proposés       | aucun fournisseur intégré ; suggérer un titre que rien n'a résolu donnerait une fausse assurance sur son identité                 |
| Pas de prévisualisation avant confirmation d'un ajout | l'utilisateur valide sans voir la valorisation             | dépend d'un cours réel                                                                                                            |
| Enregistrement d'option depuis l'écran guidé          | la saisie manuelle reste nécessaire                        | dépend d'un fournisseur ; l'écran renvoie explicitement vers elle                                                                 |
| Recherche, filtres et tri sur `/positions`            | liste simple, ordonnée par compte puis nom                 | six positions de démonstration ne justifiaient pas de bâtir des filtres non éprouvés ; à faire dès qu'un portefeuille réel existe |
| Pas de graphique par position                         | l'historique est au niveau du portefeuille                 | un historique par position demande des snapshots par ligne, non prévus par `DATA_MODEL.md`                                        |
| Snapshot quotidien automatique                        | l'enregistrement est manuel                                | demande un ordonnanceur, qui demande un fournisseur                                                                               |
| Import d'une sauvegarde                               | l'export permet de repartir manuellement, pas de recharger | jamais spécifié ; le runbook le dit                                                                                               |
| Libellé « marché fermé »                              | rendu comme « dernière clôture »                           | demande un calendrier de places, hors périmètre des lots                                                                          |
| `'unsafe-inline'` sur `script-src`                    | politique moins stricte qu'idéale                          | une politique par nonce demande un middleware dédié                                                                               |
| Actions GitHub sur Node 20                            | avertissement de CI                                        | dépendance externe, sans effet fonctionnel                                                                                        |

---

## Couverture marché réelle

**Aucune.** Zéro cours réel n'a jamais transité par cette application.

| Fournisseur | Statut       | Motif                                                          |
| ----------- | ------------ | -------------------------------------------------------------- |
| Twelve Data | `UNVERIFIED` | ni clé, ni accès réseau                                        |
| Massive     | `UNVERIFIED` | ni clé, ni accès réseau                                        |
| EODHD       | `UNVERIFIED` | ni clé, ni accès réseau                                        |
| OpenFIGI    | `UNVERIFIED` | ni clé, ni accès réseau ; ne fournit de toute façon aucun prix |

La matrice de couverture rapporte 19 instruments × 4 fournisseurs en `NOT_RUN`,
jamais en `NOT_FOUND` — « pas essayé » et « introuvable » sont deux faits
différents, et les confondre transformerait un blocage en conclusion.

**Aucune recommandation de fournisseur n'est formulée.** Elle ne pourrait
reposer que sur les affirmations commerciales des vendeurs, que
`MARKET_DATA.md` interdit explicitement de prendre pour argent comptant.

---

## Séparation des données de démonstration et des données réelles

| Garde                                                       | Mécanisme                                          | Vérifié par                                      |
| ----------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| Le mode démonstration ne peut pas s'activer en production   | exception au démarrage si `NODE_ENV=production`    | test unitaire                                    |
| Les données de démonstration sont reconnaissables           | ISIN en `XX`, noms « Démo », comptes « Démo … »    | seed, revue                                      |
| Aucun cours n'est présenté comme réel                       | fixtures marquées `MANUAL` ou `NAV`, jamais `LIVE` | E2E : le mot « En direct » n'apparaît nulle part |
| L'utilisateur voit en permanence qu'il est en démonstration | bandeau sur chaque écran                           | E2E, quatre gabarits                             |
| Aucune donnée financière réelle dans le dépôt               | seed entièrement fictif, scan de secrets en CI     | CI                                               |
| Le seed n'est jamais appliqué automatiquement               | appliqué explicitement, jamais par les migrations  | revue                                            |

---

## Conclusion de l'audit

L'application fait **ce qu'elle annonce**, et n'annonce pas ce qu'elle ne fait
pas. Les calculs sont exacts et réconciliés, les données personnelles sont
cloisonnées et supprimables, aucune donnée n'est présentée comme plus fraîche
ou plus fiable qu'elle ne l'est.

Elle n'est **pas prête pour une mise en production exposée** : l'authentification
manque, et la couverture marché est nulle. Ces deux points dépendent
d'éléments extérieurs — un projet Supabase, une clé d'API, un accès réseau — et
aucun ne peut être comblé honnêtement depuis cet environnement.

Pour un usage **local et personnel**, avec une base PostgreSQL propre, le
produit est utilisable : saisie, valorisation, historique, analyse, sauvegarde
et suppression fonctionnent de bout en bout.
