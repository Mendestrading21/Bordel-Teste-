# Règles Claude Code — Bordel-Teste-

## Projet actif

Le projet actuellement spécifié est **PortfolioLab**, dans `projects/portfolio-lab/`.

## Démarrage obligatoire d’une session

1. Lire ce fichier.
2. Lire `projects/portfolio-lab/STATUS.md`.
3. Invoquer `/portfolio-lab-master audit` ou `/portfolio-lab-master plan` avant toute implémentation importante.
4. Lire uniquement les références du skill utiles au lot courant.

## Invariants non négociables

- PortfolioLab est une application patrimoniale personnelle et privée.
- L’utilisateur ajoute lui-même ses positions. Aucune connexion à UBS, BCGE, Swissquote, IBKR ou une autre banque/courtier.
- Aucun scraping d’espace bancaire.
- Aucun ordre d’achat ou de vente. Le produit est strictement en lecture seule côté marché.
- Les actions, ETF et options peuvent recevoir des cours live ou différés selon l’abonnement du fournisseur.
- Les fonds de placement utilisent leur dernière NAV publiée ; ne jamais présenter une NAV comme un cours tick par tick.
- La devise de consolidation est le CHF, mais la devise native doit toujours être conservée.
- La source, la méthode de valorisation et l’horodatage de chaque cours doivent être visibles.
- Aucun secret, token API, relevé bancaire ou donnée personnelle réelle dans Git.
- Les calculs monétaires utilisent des décimales exactes, jamais des nombres flottants JavaScript bruts.

## Discipline Git

- Une branche dédiée par lot : `claude/portfolio-lab-lot-XX-description`.
- Ne jamais développer directement sur `main`.
- Commits atomiques et descriptifs.
- Ouvrir une Pull Request brouillon avec résumé, tests, risques et captures si l’interface change.
- Ne jamais fusionner une Pull Request et ne jamais déployer sans validation explicite de l’utilisateur.
- Ne pas modifier les autres projets du dépôt sans demande explicite.

## Qualité minimale

Avant d’annoncer un lot terminé :

- formatage, lint et typecheck réussis ;
- tests unitaires et d’intégration réussis ;
- build de production réussi ;
- parcours mobile principal vérifié ;
- aucune clé ou donnée sensible dans le diff ;
- `projects/portfolio-lab/STATUS.md` mis à jour.
