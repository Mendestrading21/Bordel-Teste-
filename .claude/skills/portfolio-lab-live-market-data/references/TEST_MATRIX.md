# Matrice de validation réelle

Créer/étendre `tests/coverage-matrix/instruments.json` avec au minimum :

## Actions
- AAPL (US)
- NESN / Nestlé (SIX)
- MC / LVMH (Euronext)
- SAP (Xetra)

## ETF
- SPY ou QQQ (US)
- un ETF SIX
- un ETF Xetra

## Fonds
- 3 fonds Pictet avec ISIN réels et classes différentes
- 1 fonds UBS
- 1 fonds BlackRock/Amundi non ETF

Vérifier absolument nom, ISIN, classe, devise, NAV et date.

## Options
- AAPL call liquide court terme
- NVDA call/put échéance > 3 mois
- un contrat peu liquide

Vérifier symbole canonique, strike, expiration, multiplier, bid/ask/last et timestamp.

## Crypto
- BTC/USD
- ETH/USD
- SOL/USD
- un token avec ticker ambigu
- un token on-chain peu capitalisé si CoinGecko le couvre

## FX
- USD/CHF
- EUR/CHF
- GBP/CHF

## Indices
- S&P 500
- Nasdaq 100
- SMI
- Euro Stoxx 50

## Futures/commodities
- ES front month
- NQ front month
- WTI front month
- Gold front month

Ne jamais confondre spot commodity, CFD et futures.

## Fixed income
- Treasury US représentatif si source disponible
- corporate bond US avec CUSIP/ISIN et données TRACE
- obligation européenne comme test de couverture négatif/positif selon fournisseur

## Pour chaque test enregistrer
- provider ;
- instrument trouvé ;
- identifiant exact ;
- exchange/MIC/venue ;
- devise ;
- snapshot ;
- `asOf` ;
- freshness ;
- bid/ask/last/NAV selon type ;
- history ;
- WebSocket reçu ou non ;
- délai annoncé par le plan ;
- coût/plan requis ;
- remarque de licence ;
- verdict PASS/PARTIAL/FAIL.

## Gates

- aucun provider n’est déclaré principal avant cette matrice ;
- aucun `LIVE` sans preuve du plan et timestamp ;
- 100 % des instruments utilisateurs doivent soit être couverts, soit afficher explicitement `UNAVAILABLE`/`MANUAL`, jamais un voisin approximatif.
