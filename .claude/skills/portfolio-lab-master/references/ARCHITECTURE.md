# PortfolioLab — Architecture cible

## Structure du dépôt

PortfolioLab vit sous `projects/portfolio-lab/` dans le dépôt d’incubation.

Structure cible :

```text
projects/portfolio-lab/
├── apps/
│   ├── web/                 # PWA Next.js, interface et API applicative
│   └── market-gateway/      # processus Node persistant, WebSockets fournisseurs
├── packages/
│   ├── domain/              # types, schémas et invariants métier
│   ├── portfolio-engine/    # valorisation et performance
│   ├── market-data/         # contrat et adaptateurs fournisseurs
│   ├── database/            # accès typé et repositories
│   └── ui/                  # composants et tokens visuels
├── supabase/
│   ├── migrations/
│   └── seed.sql
├── tests/
│   ├── fixtures/
│   └── coverage-matrix/
├── .env.example
├── README.md
└── STATUS.md
```

Utiliser un workspace `pnpm`. Turborepo est optionnel ; ne l’ajouter que si les scripts multi-packages le justifient.

## Composants

### `apps/web`

- Next.js avec App Router et TypeScript strict ;
- PWA responsive et installable ;
- authentification privée ;
- écrans, formulaires et graphiques ;
- Route Handlers pour l’API métier ;
- abonnement authentifié à la passerelle de marché ;
- cache local du dernier état pour l’usage hors-ligne.

### `apps/market-gateway`

Processus Node.js/TypeScript long-lived, nécessaire pour maintenir les connexions WebSocket des fournisseurs sans exposer les clés au navigateur.

Responsabilités :

- connecter et authentifier les fournisseurs ;
- dédupliquer les abonnements aux symboles ;
- normaliser les messages ;
- gérer reconnexion, backoff, heartbeat et limites ;
- conserver le dernier cours en mémoire ou cache ;
- transmettre uniquement les symboles autorisés au client authentifié ;
- persister périodiquement des snapshots utiles, pas chaque tick ;
- produire des métriques et journaux sans secrets.

### PostgreSQL / Supabase

- stockage des portefeuilles, comptes, instruments, positions, transactions, mappings, snapshots et paramètres ;
- Supabase Auth pour l’accès privé ;
- Row Level Security obligatoire, même pour un utilisateur unique ;
- migrations versionnées et reproductibles ;
- aucune clé fournisseur dans une table accessible au client.

## Flux de données live

```text
Fournisseur WebSocket
        ↓
Market Gateway
        ↓ normalisation + contrôle de fraîcheur
Cache du dernier cours
        ↓ canal WebSocket/SSE authentifié
PWA PortfolioLab
        ↓
Recalcul local déterministe de la position
```

Le navigateur ne se connecte jamais directement à une API nécessitant une clé permanente.

## Flux fonds de placement

```text
Cron serveur
   ↓
Recherche de la dernière NAV
   ↓
Validation identité ISIN + devise + date
   ↓
Stockage quote/NAV
   ↓
Mise à jour PWA
```

La fréquence suit la publication du fonds. Une absence de nouvelle NAV n’est pas une erreur de flux live ; elle doit être présentée comme telle.

## Contrat fournisseur

Le package `market-data` expose un contrat indépendant des vendeurs :

```ts
export interface MarketDataProvider {
  readonly id: string;
  capabilities(): ProviderCapabilities;
  search(query: InstrumentSearchQuery): Promise<InstrumentCandidate[]>;
  resolve(ref: InstrumentReference): Promise<ResolvedInstrument | null>;
  getSnapshot(instrument: ResolvedInstrument): Promise<NormalizedQuote>;
  getHistory(request: HistoryRequest): Promise<PriceBar[]>;
  subscribe?(
    instruments: ResolvedInstrument[],
    onQuote: (quote: NormalizedQuote) => void,
  ): Promise<SubscriptionHandle>;
}
```

Les types normalisés ne doivent contenir aucun objet spécifique au SDK d’un fournisseur.

## Choix technologiques

- TypeScript strict ;
- pnpm workspaces ;
- Next.js pour la PWA ;
- PostgreSQL/Supabase pour données et authentification ;
- Zod pour validation aux frontières ;
- bibliothèque décimale pour les calculs ;
- Playwright pour les parcours E2E ;
- Vitest ou équivalent pour les tests unitaires ;
- bibliothèque de graphiques compatible mobile et accessible ;
- Tailwind CSS avec tokens de design centralisés.

Ne pas verrouiller de versions dans cette documentation. Au scaffold, utiliser des versions stables compatibles entre elles et enregistrer les versions dans le lockfile.

## Authentification

V1 : accès privé par Supabase Auth, avec une adresse autorisée et session persistante sécurisée. Prévoir MFA ou passkey uniquement après le socle. Toute route de données et tout canal live vérifient l’utilisateur.

## Secrets

Variables attendues, uniquement côté serveur :

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
MARKET_DATA_PROVIDER
TWELVE_DATA_API_KEY
MASSIVE_API_KEY
EODHD_API_KEY
OPENFIGI_API_KEY
```

`.env.example` contient des noms et commentaires, jamais de valeurs réelles.

## Déploiement

Séparer :

- PWA/API web sur une plateforme compatible Next.js ;
- `market-gateway` sur un hébergement supportant un processus persistant et les WebSockets ;
- PostgreSQL/Supabase pour la base.

Ne pas choisir ni déclencher un hébergement payant pendant les lots de développement sans validation explicite.

## Résilience

- backoff exponentiel avec jitter ;
- circuit breaker par fournisseur ;
- heartbeat et détection de connexion morte ;
- cache dernier cours ;
- reprise idempotente ;
- limites d’abonnements respectées ;
- données périmées marquées, jamais masquées ;
- dégradation vers snapshot/EOD uniquement avec changement visible du statut.
