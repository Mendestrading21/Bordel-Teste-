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

## Documentation officielle

- EODHD : `https://eodhd.com/financial-apis/` ; WebSocket : `https://eodhd.com/financial-apis/new-real-time-data-api-websockets`
- EODHD SDK officiel : `https://github.com/EodHistoricalData/EODHD-APIs-Node-Financial-Library`
- Twelve Data : `https://twelvedata.com/docs` ; pricing/capabilities : `https://twelvedata.com/pricing`
- Massive : `https://massive.com/docs/` ; JS client officiel : `https://github.com/massive-com/client-js`
- CoinGecko : `https://docs.coingecko.com/`
- OpenFIGI : `https://www.openfigi.com/api/documentation`
- FINRA Fixed Income : `https://developer.finra.org/node/1171`
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
