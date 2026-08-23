# PortfolioLab — Status

Dernière mise à jour : 23 août 2026

## Phase

**Spécification / Lot 00**

## État global

- Produit défini : oui
- Skill Claude Code : préparé sur branche dédiée
- Architecture documentée : oui
- Fournisseur de marché choisi : non, volontairement
- Matrice de couverture exécutée : non
- Code PWA : non commencé
- Base de données : non commencée
- Déploiement : aucun

## Décisions actées

- l’utilisateur ajoute lui-même toutes les positions ;
- aucune connexion à une banque ou un courtier ;
- CHF comme devise de consolidation ;
- actions/ETF/options live ou différés selon le fournisseur ;
- fonds valorisés avec leur dernière NAV ;
- architecture multi-fournisseurs ;
- clés uniquement côté serveur ;
- application privée, installable comme PWA ;
- style sombre obsidienne/cuivre ;
- aucune fusion ou production sans validation explicite.

## Travail courant

Branche de spécification : `skill/portfolio-lab-master`

Livrables du Lot 00 :

- `CLAUDE.md`
- skill `portfolio-lab-master`
- spécification produit
- architecture
- stratégie données de marché
- modèle de données
- UX/UI
- roadmap
- quality gates
- README projet

## Prochaine étape après validation et fusion du Lot 00

```text
/portfolio-lab-master audit
```

Puis :

```text
/portfolio-lab-master plan
```

Et, après validation du plan :

```text
/portfolio-lab-master execute 01
```

## Blocages connus

- aucun abonnement data ne doit être choisi avant le Lot 04 et la matrice de couverture ;
- les clés API réelles ne doivent jamais être placées dans Git ;
- le dépôt porte encore le nom d’incubation `Bordel-Teste-`, même si le projet s’appelle PortfolioLab.

## Journal

| Date | Événement | Preuve |
|---|---|---|
| 2026-08-23 | Initialisation du dépôt d’incubation | commit initial README |
| 2026-08-23 | Création de la branche du skill | `skill/portfolio-lab-master` |
| 2026-08-23 | Rédaction du Lot 00 | fichiers de spécification et skill |
