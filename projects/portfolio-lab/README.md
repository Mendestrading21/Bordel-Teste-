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

Voir `STATUS.md` pour l'état vérifié lot par lot.

## Installation locale

Prérequis : Node.js 22 ou supérieur, et `pnpm` 10.

```bash
cd projects/portfolio-lab
pnpm install
cp .env.example .env.local   # aucune clé n'est nécessaire pour démarrer
pnpm run dev                 # PWA sur http://localhost:3100
pnpm run dev:gateway         # passerelle de marché sur http://localhost:4100
```

Aucune clé de fournisseur n'est requise : `MARKET_DATA_PROVIDER=mock` est la
valeur par défaut.

## Commandes

| Commande                    | Effet                                        |
| --------------------------- | -------------------------------------------- |
| `pnpm run dev`              | PWA en développement, port 3100              |
| `pnpm run dev:gateway`      | Passerelle de marché, port 4100              |
| `pnpm run format:check`     | Vérifie le formatage Prettier                |
| `pnpm run lint`             | ESLint sur tout le workspace                 |
| `pnpm run typecheck`        | `tsc --noEmit` sur chaque package            |
| `pnpm run test`             | Tests unitaires puis d'intégration           |
| `pnpm run test:unit`        | Logique pure uniquement                      |
| `pnpm run test:integration` | Socket local, fichiers, base                 |
| `pnpm run test:e2e`         | Playwright sur 390, 430, tablette et desktop |
| `pnpm run build`            | Build de production de tous les packages     |
| `pnpm run icons`            | Régénère les icônes PWA                      |

`pnpm run test:e2e` a besoin d'un Chromium. En local :
`pnpm exec playwright install chromium`. Si l'environnement en fournit déjà un,
pointer `PLAYWRIGHT_CHROMIUM_EXECUTABLE` vers ce binaire évite un second
téléchargement et une incompatibilité de numéro de build.

## Structure

```text
projects/portfolio-lab/
├── apps/
│   ├── web/                 PWA Next.js (App Router)
│   └── market-gateway/      processus Node persistant, WebSockets fournisseurs
├── packages/
│   ├── domain/              types, décimales exactes, énumérations de marché
│   ├── portfolio-engine/    valorisation et performance (Lot 03)
│   ├── market-data/         contrat et adaptateurs fournisseurs (Lot 04)
│   ├── database/            accès typé PostgreSQL (Lot 02)
│   └── ui/                  tokens visuels et formatage
├── supabase/migrations/
├── tests/
│   ├── e2e/
│   ├── fixtures/
│   └── coverage-matrix/
├── docs/adr/                décisions d'architecture
└── scripts/
```

## Installation sur l'écran d'accueil d'un iPhone

1. Ouvrir l'application dans **Safari** — Chrome iOS ne propose pas
   l'installation.
2. Toucher le bouton **Partager**.
3. Choisir **Sur l'écran d'accueil**.
4. Confirmer.

L'application se lance ensuite en plein écran, sans barre d'adresse, avec son
icône propre. Aucun passage par l'App Store n'est nécessaire.

## Variables d'environnement

Toutes les variables attendues sont décrites dans `.env.example`, avec pour
chacune son lot d'introduction et son niveau de sensibilité. Aucune valeur réelle
n'est versionnée : `.gitignore` exclut tous les `.env*` sauf ce modèle.
