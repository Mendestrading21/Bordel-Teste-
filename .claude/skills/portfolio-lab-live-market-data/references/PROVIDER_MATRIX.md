# Provider Matrix — PortfolioLab

## Sources officielles à privilégier

| Fournisseur | Actions | ETF | Fonds/NAV | Options | Crypto | FX | Indices | Futures | Commodities | Bonds | Live WS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| EODHD | oui | oui | oui | oui selon offre | oui | oui | oui | partiel | macro/selon offre | souverains/macro, pas universel | oui actions/FX/crypto |
| Twelve Data | oui global | oui global | oui/NAV | à vérifier par plan | oui | oui | oui selon plan | à vérifier | oui | non principal | oui |
| Massive | US | US | non principal | excellent US | oui | oui | oui | oui US | via futures | non principal | oui |
| CoinGecko | non | non | non | non | excellent | non | crypto indices/agrégats | non | non | non | oui selon plan |
| FINRA TRACE | non | non | non | non | non | non | non | non | non | US corporate/agency OTC trades | API query, pas quote WS |
| OpenFIGI | IDs | IDs | IDs | IDs | limité | non | IDs | IDs | non | IDs | non |
| FactSet | oui | oui | excellent | oui | oui | oui | oui | oui | oui | excellent | institutionnel |
| Alpha Vantage | oui | ETF | mutual funds/historique selon endpoint | US options | oui | oui | indices | non principal | oui | non principal | surtout REST |
| Finnhub | oui | ETP | fund metadata | partiel | oui | oui | indices | partiel | partiel | symbol types Bond | WS stocks/FX/crypto |

## Documentation officielle vérifiée

### EODHD
- Documentation générale : `https://eodhd.com/financial-apis/`
- WebSocket stocks/FX/crypto : `https://eodhd.com/financial-apis/new-real-time-data-api-websockets`
- SDK Node/TypeScript officiel : `https://github.com/EodHistoricalData/EODHD-APIs-Node-Financial-Library`
- Search API : `https://eodhd.com/financial-apis/search-api-for-stocks-etfs-mutual-funds`
- ID mapping : `https://eodhd.com/financial-apis/id-mapping-api-cusip-isin-figi-lei-cik-%E2%86%94-symbol`

WebSocket documenté :
- `wss://ws.eodhistoricaldata.com/ws/us?api_token=...`
- `wss://ws.eodhistoricaldata.com/ws/us-quote?api_token=...`
- `wss://ws.eodhistoricaldata.com/ws/forex?api_token=...`
- `wss://ws.eodhistoricaldata.com/ws/crypto?api_token=...`

### Twelve Data
- Docs : `https://twelvedata.com/docs`
- Market Data : `https://twelvedata.com/market-data`
- Pricing : `https://twelvedata.com/pricing`
- WebSocket guide : `https://support.twelvedata.com/en/articles/5620516-how-to-stream-the-data`
- GitHub : `https://github.com/twelvedata`

### Massive
- Docs : `https://massive.com/docs`
- WS Quickstart : `https://massive.com/docs/websocket/quickstart`
- Stocks WS : `https://massive.com/docs/websocket/stocks/overview`
- Options quotes WS : `https://massive.com/docs/websocket/options/quotes`
- Futures quotes WS : `https://massive.com/docs/websocket/futures/quotes`
- Forex WS : `https://massive.com/docs/websocket/forex/quotes`
- JS client officiel : `https://github.com/massive-com/client-js`
- OpenAPI specs : `https://github.com/massive-com/platform-open-api-specs`

WebSocket :
- delayed : `wss://delayed.massive.com/<asset-class>`
- real-time : `wss://socket.massive.com/<asset-class>`
- auth : `{ "action": "auth", "params": "YOUR_API_KEY" }`

### CoinGecko
- Docs : `https://docs.coingecko.com/`
- Pricing : `https://www.coingecko.com/en/api/pricing`

### OpenFIGI
- Docs : `https://www.openfigi.com/api/documentation`

### FINRA Fixed Income
- Developer portal : `https://developer.finra.org/`
- Fixed Income : `https://developer.finra.org/node/1171`
- TRACE data : `https://www.finra.org/filing-reporting/trace/data`

### Institutionnel / fallbacks
- FactSet Funds : `https://developer.factset.com/api-catalog/factset-funds-api`
- FactSet Bonds : `https://developer.factset.com/api-catalog/bonds-api-for-digital-portals`
- Alpha Vantage : `https://www.alphavantage.co/documentation/`
- Finnhub : `https://finnhub.io/docs/api`

## Recommandation d’architecture

### Tier A — à implémenter en premier
1. EODHD : découverte universelle + fonds + fallback global.
2. Twelve Data : global listed + FX/crypto/commodities.
3. Massive : US options/stocks/futures/indices.
4. CoinGecko : crypto breadth.
5. OpenFIGI : identité.
6. FINRA : fixed-income US transactions.

### Tier B — fallback seulement
- Alpha Vantage ;
- Finnhub.

### Tier C — institutionnel/optionnel
- FactSet / ICE / SIX selon besoin et budget futur.

## Notes de qualité

- `real-time` dépend toujours du plan et des licences d’exchange : le code ne doit jamais l’inférer du nom du fournisseur.
- Mutual funds classiques = NAV, généralement quotidienne, pas tick-by-tick.
- Bonds OTC = prix moins continus ; afficher âge du dernier trade/quote et méthode.
- Crypto agrégée = préciser qu’il s’agit d’un prix agrégé si aucune venue spécifique n’est sélectionnée.
- Indices peuvent nécessiter une licence distincte même si les constituants sont disponibles.
- Futures exigent le contrat exact et l’échéance ; ne jamais valoriser une position réelle avec un continuous contract sans choix explicite.
