# PortfolioLab — Runbook données de marché réelles

Ce document est la procédure opérationnelle pour passer progressivement de `mock` à de vraies données multi-actifs, sans exposer de secrets et sans mentir sur la fraîcheur.

## 1. Architecture cible

```text
PWA PortfolioLab
      │
      ▼
Backend Next.js ───── recherche/snapshots/historique
      │
      ▼
ProviderRouter
 ┌────┼──────────┬──────────┬──────────┬────────────┐
 │    │          │          │          │            │
EODHD Twelve   Massive   CoinGecko  OpenFIGI    FINRA
 │    │          │          │          │            │
 └────┴──────────┴──────────┴──────────┴────────────┘
      │
      ▼
Market Gateway (WebSocket persistant)
      │
      ▼
PWA — ticks normalisés, source + timestamp + freshness
```

Les fournisseurs sont remplaçables. Aucune logique vendeur dans l'UI.

## 2. Sources officielles

### EODHD

- Docs générales : https://eodhd.com/financial-apis/
- WebSocket stocks / FX / crypto : https://eodhd.com/financial-apis/new-real-time-data-api-websockets
- SDK Node/TypeScript officiel : https://github.com/EodHistoricalData/EODHD-APIs-Node-Financial-Library
- Search API stocks / ETF / mutual funds : https://eodhd.com/financial-apis/search-api-for-stocks-etfs-mutual-funds
- ID mapping : https://eodhd.com/financial-apis/id-mapping-api-cusip-isin-figi-lei-cik-%E2%86%94-symbol

Endpoints WS documentés :

- equities trades : `wss://ws.eodhistoricaldata.com/ws/us?api_token=...`
- equities quotes : `wss://ws.eodhistoricaldata.com/ws/us-quote?api_token=...`
- FX : `wss://ws.eodhistoricaldata.com/ws/forex?api_token=...`
- crypto : `wss://ws.eodhistoricaldata.com/ws/crypto?api_token=...`

Le token `demo` peut être utilisé uniquement sur les symboles officiellement autorisés par EODHD pour vérifier le transport. Ne jamais conclure qu'un plan production couvre tout à partir de la démo.

### Twelve Data

- Docs : https://twelvedata.com/docs
- Market data : https://twelvedata.com/market-data
- Pricing : https://twelvedata.com/pricing
- WebSocket/support : https://support.twelvedata.com/en/articles/5620516-how-to-stream-the-data
- GitHub organisation : https://github.com/twelvedata

Couverture déclarée : stocks, ETF, mutual funds, FX, crypto, commodities, reference data. Toujours vérifier échange, licence et plan exact avant `LIVE`.

### Massive

- Docs : https://massive.com/docs
- WebSocket quickstart : https://massive.com/docs/websocket/quickstart
- Stocks WS : https://massive.com/docs/websocket/stocks/overview
- Options quotes WS : https://massive.com/docs/websocket/options/quotes
- Futures quotes WS : https://massive.com/docs/websocket/futures/quotes
- Forex WS : https://massive.com/docs/websocket/forex/quotes
- Client JS officiel : https://github.com/massive-com/client-js
- OpenAPI specs : https://github.com/massive-com/platform-open-api-specs

WebSocket :

- delayed : `wss://delayed.massive.com/<asset-class>`
- real-time : `wss://socket.massive.com/<asset-class>`
- auth : `{ "action": "auth", "params": "API_KEY" }`

Ne jamais utiliser le host real-time si le plan n'y donne pas droit, et ne jamais labelliser un flux delayed comme live.

### CoinGecko

- Docs : https://docs.coingecko.com/
- Pricing : https://www.coingecko.com/en/api/pricing

Utiliser les `coin id` CoinGecko comme identité crypto, jamais le ticker seul. `ABC` peut désigner plusieurs tokens.

### OpenFIGI

- Docs : https://www.openfigi.com/api/documentation

Usage : identité uniquement (ISIN/CUSIP/FIGI/etc.). Ce n'est jamais une source de prix.

### FINRA TRACE

- Developer Portal : https://developer.finra.org/
- Fixed income API : https://developer.finra.org/node/1171
- TRACE : https://www.finra.org/filing-reporting/trace/data

TRACE est transactionnel OTC. Un dernier trade n'est pas un bid/ask ferme. Afficher l'âge de la transaction et le type de source.

### Fallbacks

- Alpha Vantage : https://www.alphavantage.co/documentation/
- Finnhub : https://finnhub.io/docs/api
- FactSet Funds : https://developer.factset.com/api-catalog/factset-funds-api
- FactSet Bonds : https://developer.factset.com/api-catalog/bonds-api-for-digital-portals

Ces sources ne deviennent principales qu'après matrice de couverture et validation coût/licence.

## 3. Variables d'environnement

Serveur/gateway uniquement :

```text
MARKET_DATA_MODE=mock|demo|live
EODHD_API_KEY=
TWELVE_DATA_API_KEY=
MASSIVE_API_KEY=
COINGECKO_API_KEY=
OPENFIGI_API_KEY=
FINRA_API_KEY=
ALPHAVANTAGE_API_KEY=
FINNHUB_API_KEY=
FACTSET_API_KEY=
FACTSET_API_SECRET=
```

Jamais de `NEXT_PUBLIC_*` pour ces secrets.

## 4. Routage initial recommandé

- US option live → Massive
- US futures → Massive
- US indices → Massive si plan/licence
- stocks US live → Massive ou EODHD selon coût/plan
- stocks/ETF Europe/Suisse → Twelve Data puis EODHD
- mutual funds / Pictet par ISIN → EODHD puis Twelve Data
- FX → Twelve Data puis Massive/EODHD
- crypto large breadth → CoinGecko ; tick live venue/agrégé → fournisseur sélectionné
- commodities spot/reference → Twelve Data ; futures commodities → Massive
- US bonds transactions → FINRA TRACE
- identité ISIN/CUSIP/FIGI → OpenFIGI

Ce routage est une hypothèse de départ, pas une vérité figée. Le rapport de couverture réelle peut modifier les priorités.

## 5. Modes

### mock

Fixtures déterministes uniquement. CI standard.

### demo

Vrais endpoints de démonstration officiels. Sert à prouver transport, parsing, timestamps, reconnexion et UX. Ne prouve pas la couverture de l'abonnement final.

### live

Clés réelles + plan/licence vérifiés. Un adaptateur ne peut annoncer `LIVE` que si la source le prouve par ses timestamps et les droits du plan.

## 6. Tests réels minimum avant activation

Prouver au moins :

1. AAPL réel — snapshot puis 2 ticks distincts sans refresh ;
2. Nestlé SIX — recherche exacte + snapshot ;
3. ETF US ;
4. ETF européen/SIX ;
5. fonds Pictet exact par ISIN — classe/devise/NAV/date ;
6. option US exacte — bid/ask/last + multiplier ;
7. BTC et ETH — identité non ambiguë + stream ;
8. USD/CHF et EUR/CHF ;
9. S&P 500/SMI selon licence ;
10. future ES + future WTI avec échéance exacte ;
11. Treasury/corporate bond — source et âge ;
12. fallback volontaire : couper le provider primaire et vérifier le secondaire.

## 7. Observabilité

Chaque requête/quote doit pouvoir produire sans secret :

```text
provider
providerSymbol
assetType
operation
latencyMs
freshness
asOf
receivedAt
fallbackUsed
errorKind
rateLimitRemaining (si exposé)
```

Ne jamais logger clé API, payload d'auth ou token gateway.

## 8. Rate limits et résilience

- timeout REST ;
- retry uniquement sur erreurs transitoires ;
- respecter `Retry-After` ;
- exponential backoff + jitter ;
- circuit breaker fournisseur ;
- WebSocket heartbeat ;
- reconnexion idempotente ;
- resubscription après reconnexion ;
- déduplication par symbol/provider ;
- ignorer ticks plus anciens que le dernier `asOf` ;
- dernier prix connu conservé mais marqué `STALE` quand nécessaire.

## 9. Règles par actif

### Actions / ETF

Trade ou midpoint selon stratégie documentée. Exchange et devise obligatoires.

### Mutual funds

NAV uniquement. ISIN + classe de parts + devise + date de NAV. Pas de faux intraday.

### Options

Contrat exact : underlying, call/put, expiration, strike, multiplier, symbole fournisseur. Midpoint si bid/ask valides, sinon dernier trade selon règles existantes.

### Crypto

Stocker identifiant canonique et source. Pour prix agrégé, afficher `aggregated`; pour venue spécifique, stocker venue/exchange.

### FX

Paire exacte et direction explicite. Triangulation seulement si nécessaire et testée.

### Futures

Racine + mois/année/expiration + multiplier. Ne pas utiliser un continuous contract pour valoriser une position réelle sauf si la position elle-même est définie ainsi.

### Commodities

Distinguer spot/reference d'un contrat future.

### Bonds

CUSIP/ISIN/FIGI selon disponibilité. Afficher type de prix (trade/quote/evaluated), source et âge. TRACE ≠ firm quote.

## 10. Activation

Ne jamais basculer automatiquement en live parce qu'une clé existe. Exiger :

```text
MARKET_DATA_MODE=live
```

plus un provider activé explicitement. Une mauvaise clé doit produire `UNAUTHORIZED`, pas un fallback silencieux vers mock.
