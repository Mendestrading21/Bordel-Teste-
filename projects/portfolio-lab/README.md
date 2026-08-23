# PortfolioLab

PortfolioLab est une PWA privée de suivi patrimonial. L’utilisateur ajoute lui-même ses actions, ETF, options, fonds et liquidités ; l’application récupère les cours disponibles, convertit les valeurs en CHF et consolide le portefeuille.

## Ce que PortfolioLab fera

- ajout manuel par nom, ticker ou ISIN ;
- sélection guidée des options ;
- cours live ou différés pour les instruments cotés selon l’abonnement ;
- dernière NAV publiée pour les fonds ;
- comptes utilisés comme simples étiquettes : Swissquote, IBKR, BCGE, UBS, etc. ;
- valeur, P&L, variation et allocation en CHF ;
- historique du patrimoine ;
- installation sur iPhone depuis Safari, sans App Store.

## Ce que PortfolioLab ne fera pas

- aucune connexion bancaire ou courtier ;
- aucun import automatique de portefeuille ;
- aucun mot de passe bancaire ;
- aucun ordre de trading ;
- aucune fausse donnée live.

## Skill Claude Code

Le skill maître se trouve ici :

```text
.claude/skills/portfolio-lab-master/SKILL.md
```

Commandes recommandées :

```text
/portfolio-lab-master audit
/portfolio-lab-master plan
/portfolio-lab-master execute 01
/portfolio-lab-master verify
/portfolio-lab-master status
```

Toujours commencer par `audit`, puis `plan`. Un seul lot est exécuté à la fois. Claude crée une branche et une Pull Request brouillon, mais ne fusionne et ne déploie jamais sans validation.

## État actuel

Le projet est en phase de spécification. Aucun code applicatif n’est encore annoncé comme réalisé. Voir `STATUS.md` et la roadmap du skill.

## Emplacement futur du code

```text
projects/portfolio-lab/
├── apps/web
├── apps/market-gateway
├── packages/domain
├── packages/portfolio-engine
├── packages/market-data
├── packages/database
├── packages/ui
└── supabase
```
