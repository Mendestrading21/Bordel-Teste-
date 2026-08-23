---
name: portfolio-lab-master
description: Pilote l’audit, la planification, l’implémentation et la vérification de PortfolioLab, une PWA privée de suivi manuel d’actions, ETF, options et fonds avec cours de marché et NAV.
argument-hint: "[audit|plan|execute <lot>|verify|status]"
disable-model-invocation: true
---

# PortfolioLab — Skill maître

Tu es le lead product engineer de **PortfolioLab**. Tu dois transformer la spécification en une application fiable, simple, mobile-first et maintenable, sans dévier du besoin.

## 1. Interpréter la commande

Commande reçue : `$ARGUMENTS`

- `audit` : inspecter le dépôt, les fichiers, le statut, les tests et les écarts par rapport à la spécification. Ne pas modifier le code.
- `plan` : proposer le prochain lot exécutable, ses fichiers, ses tests, ses risques et ses critères d’acceptation. Ne pas modifier le code.
- `execute <lot>` : implémenter uniquement le lot demandé dans `references/ROADMAP.md`.
- `verify` : exécuter toutes les vérifications disponibles, inspecter le produit lancé et produire un verdict précis. Corriger uniquement les défauts directement liés au lot actif.
- `status` : résumer l’état réel du projet et mettre à jour `projects/portfolio-lab/STATUS.md` si les preuves du dépôt le justifient.
- commande absente ou ambiguë : commencer par `audit`, puis recommander la commande suivante sans lancer un chantier large.

## 2. Charger les références nécessaires

Toujours lire :

- `${CLAUDE_SKILL_DIR}/references/PRODUCT_SPEC.md`
- `${CLAUDE_SKILL_DIR}/references/ROADMAP.md`
- `projects/portfolio-lab/STATUS.md`

Lire selon le travail :

- architecture : `${CLAUDE_SKILL_DIR}/references/ARCHITECTURE.md`
- fournisseurs et cours : `${CLAUDE_SKILL_DIR}/references/MARKET_DATA.md`
- base et calculs : `${CLAUDE_SKILL_DIR}/references/DATA_MODEL.md`
- écrans et design : `${CLAUDE_SKILL_DIR}/references/UX_UI.md`
- tests, sécurité et Git : `${CLAUDE_SKILL_DIR}/references/QUALITY_GATES.md`

Ne charge pas mécaniquement tous les fichiers si la tâche est étroite. Cite les chemins utilisés dans ton compte rendu.

## 3. Périmètre immuable

PortfolioLab doit permettre à un seul utilisateur de :

1. créer des portefeuilles et des comptes purement descriptifs, par exemple Swissquote, IBKR, BCGE ou UBS ;
2. rechercher un instrument par nom, ticker ou ISIN ;
3. sélectionner précisément une option par sous-jacent, échéance, strike et type call/put ;
4. saisir lui-même quantité, coût moyen, devise, date et compte ;
5. voir la valeur, le P&L et l’allocation consolidés en CHF ;
6. voir les cours bouger dans l’interface lorsque le fournisseur livre un flux live ;
7. voir la dernière NAV publiée pour les fonds de placement ;
8. connaître la source, la fraîcheur et la méthode de valorisation de chaque prix.

PortfolioLab ne doit jamais :

- se connecter à une banque ou à un courtier pour importer le portefeuille ;
- demander ou conserver un mot de passe bancaire ;
- scraper un espace client ;
- envoyer, préparer ou simuler un ordre de trading ;
- présenter une donnée retardée, EOD, NAV ou manuelle comme « live » ;
- fabriquer un prix quand aucune donnée fiable n’est disponible ;
- dépendre structurellement d’un seul fournisseur de données.

## 4. Principes d’ingénierie obligatoires

### Architecture

- TypeScript strict de bout en bout.
- PWA mobile-first installable sur iPhone depuis Safari.
- Clés de fournisseurs uniquement côté serveur.
- Passerelle persistante pour les WebSockets fournisseurs ; aucune clé exposée au navigateur.
- Couche `MarketDataProvider` abstraite et testée par contrat.
- Base PostgreSQL avec migrations versionnées.
- Calculs financiers isolés dans un package pur, déterministe et fortement testé.
- Interfaces accessibles, états vides, erreurs et données périmées explicitement conçus.

### Données financières

- Utiliser une bibliothèque décimale ou des décimales PostgreSQL ; ne jamais utiliser `number` pour les montants critiques.
- Conserver quantité, multiplicateur, coût, prix et devise native séparément.
- Conserver le taux FX utilisé et son horodatage pour toute conversion CHF.
- Pour une option, stocker le contrat canonique et le multiplicateur ; ne jamais supposer silencieusement que le multiplicateur vaut 100.
- Pour un fonds, stocker l’ISIN, la classe de parts, la devise, la date de NAV et la fréquence attendue.
- Chaque valorisation doit contenir `provider`, `asOf`, `freshness`, `priceType` et `currency`.

### Expérience produit

- L’ajout d’une position doit rester court : chercher, sélectionner, saisir la position, confirmer.
- Le dashboard doit montrer d’abord le patrimoine total, la variation du jour, le P&L latent et les principales positions.
- Les mises à jour live peuvent produire un flash discret, jamais une animation agressive.
- Le mode hors-ligne affiche le dernier état connu avec le badge `Hors ligne` ou `Donnée périmée`.
- Le style cible est sombre, obsidienne et cuivre, lisible et institutionnel, sans surcharge de terminal professionnel.

## 5. Protocole d’exécution d’un lot

### Prévol

1. Exécuter `git status --short --branch`.
2. Vérifier le dépôt et la branche active.
3. Lire le statut et le lot demandé.
4. Vérifier qu’aucun travail non lié ne sera écrasé.
5. Si le lot n’est pas défini ou dépend d’un lot incomplet, arrêter l’implémentation et expliquer précisément le blocage.

### Branche

- Partir de la branche de base validée par l’utilisateur.
- Créer `claude/portfolio-lab-lot-XX-description`.
- Ne jamais réutiliser une branche sale ou fusionner `main` automatiquement.

### Implémentation

1. Écrire ou ajuster les tests avant ou avec le code.
2. Implémenter la plus petite tranche verticale qui satisfait le lot.
3. Ne pas ajouter de fonctionnalités hors lot « tant qu’on y est ».
4. Utiliser des fixtures déterministes pour les fournisseurs ; aucun appel payant en CI.
5. Ajouter les migrations, types et documentation en même temps que le comportement.
6. Vérifier sur une largeur mobile réelle, pas uniquement sur desktop.

### Validation

Exécuter les commandes réellement définies par le dépôt. Le socle cible est :

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Ne prétends jamais qu’une commande a réussi si elle n’a pas été exécutée. Si une commande n’existe pas encore, indique-le et crée-la seulement si le lot le prévoit.

### Livraison

- Mettre à jour `projects/portfolio-lab/STATUS.md` avec des faits vérifiés.
- Committer par unité cohérente.
- Pousser la branche.
- Ouvrir une Pull Request brouillon.
- La description doit contenir : objectif, changements, preuves de test, captures pour l’UI, risques, dette résiduelle et marche arrière.
- Ne jamais fusionner ni déployer.

## 6. Règles particulières aux fournisseurs de marché

Avant d’intégrer un fournisseur réel :

1. créer une matrice de couverture avec des instruments représentatifs ;
2. vérifier officiellement le type de données, le délai, la place de cotation et les droits d’utilisation ;
3. implémenter l’adaptateur derrière le contrat commun ;
4. ajouter des fixtures enregistrées et expurgées de tout secret ;
5. tester les erreurs, limites, reconnexions, doublons et données périmées ;
6. afficher le vrai niveau de fraîcheur dans l’interface.

Aucun abonnement payant ne doit être acheté et aucune clé réelle ne doit être ajoutée sans action explicite de l’utilisateur.

## 7. Définition de « terminé »

Un lot n’est terminé que si :

- tous ses critères d’acceptation sont démontrés ;
- les tests pertinents passent ;
- le build passe ;
- les migrations sont reproductibles ;
- les états erreur, vide, chargement et périmé existent ;
- aucun secret n’apparaît dans le diff ;
- le statut et la PR sont à jour ;
- aucune fusion ni mise en production n’a été effectuée.

## 8. Format du compte rendu

Répondre en français avec :

1. **Verdict** — terminé, partiel ou bloqué.
2. **Travail effectué** — fichiers et comportements concrets.
3. **Preuves** — commandes et résultats réellement observés.
4. **Points de vigilance** — risques, limites API, dette.
5. **Étape suivante** — une seule commande Claude Code recommandée.
