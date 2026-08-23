# PortfolioLab — Données de marché

## Principe

Aucun fournisseur unique ne doit être supposé couvrir correctement toutes les actions, ETF, options et classes de fonds. PortfolioLab utilise une couche d’adaptateurs et choisit le fournisseur par capacité, instrument et place de cotation.

## Fournisseurs candidats à évaluer

### Twelve Data

Usage candidat : recherche et données d’actions/ETF internationales, flux WebSocket pour instruments couverts, métadonnées et données de fonds selon l’offre.

Documentation officielle : `https://twelvedata.com/docs`

### Massive

Usage candidat : actions américaines et options américaines, notamment quotes, trades et agrégats par WebSocket.

Documentation officielle :

- `https://massive.com/docs/websocket/stocks/overview`
- `https://massive.com/docs/websocket/options`
- `https://massive.com/docs/websocket/options/quotes`

### EODHD

Usage candidat : recherche par nom, ticker ou ISIN, instruments internationaux, fonds et données EOD/NAV selon couverture.

Documentation officielle :

- `https://eodhd.com/financial-apis/search-api-for-stocks-etfs-mutual-funds`
- `https://eodhd.com/financial-apis/id-mapping-api-cusip-isin-figi-lei-cik-%E2%86%94-symbol`
- `https://eodhd.com/financial-apis/stock-etfs-fundamental-data-feeds`

### OpenFIGI

Usage candidat : résolution et normalisation d’identifiants. OpenFIGI n’est pas une source de prix.

Documentation officielle : `https://www.openfigi.com/api/documentation`

## Spike de couverture obligatoire

Avant de sélectionner ou payer un fournisseur, créer `tests/coverage-matrix/instruments.json` avec des exemples réels anonymes couvrant au minimum :

- deux actions américaines ;
- deux actions suisses ou européennes ;
- deux ETF américains ;
- deux ETF européens ou suisses ;
- trois fonds Pictet avec ISIN et classes de parts distinctes ;
- deux autres fonds internationaux ;
- trois options américaines sur deux sous-jacents, plusieurs échéances ;
- paires USD/CHF et EUR/CHF.

Pour chaque fournisseur, enregistrer :

- instrument trouvé ou non ;
- identité exacte ;
- place et devise ;
- type de cours ;
- délai annoncé ;
- horodatage ;
- historique disponible ;
- limites et coût de l’offre nécessaire ;
- droits d’usage personnel ;
- erreurs observées.

Le résultat doit être un rapport reproductible, sans clé API dans Git. Le choix final découle de cette matrice, pas d’une promesse marketing générale.

## Niveaux de fraîcheur

Enumération canonique :

```text
LIVE
DELAYED
EOD
NAV
MANUAL
STALE
UNAVAILABLE
```

Règles :

- `LIVE` seulement si le fournisseur et l’abonnement livrent une donnée officiellement temps réel ;
- `DELAYED` si le délai est connu ou annoncé ;
- `EOD` pour un dernier cours de clôture ;
- `NAV` pour la valeur nette d’inventaire d’un fonds ;
- `MANUAL` pour une valeur saisie ;
- `STALE` quand la donnée dépasse son seuil de fraîcheur attendu ;
- `UNAVAILABLE` quand aucune valorisation fiable n’existe.

## Types de prix

```text
LAST_TRADE
MID
BID
ASK
PREVIOUS_CLOSE
NAV
MANUAL
```

Chaque quote normalisée contient au minimum :

```ts
export type NormalizedQuote = {
  instrumentId: string;
  provider: string;
  providerSymbol: string;
  currency: string;
  price: DecimalString;
  priceType: PriceType;
  freshness: QuoteFreshness;
  asOf: string;
  receivedAt: string;
  bid?: DecimalString;
  ask?: DecimalString;
  previousClose?: DecimalString;
  marketState?: "PRE" | "OPEN" | "AFTER" | "CLOSED" | "UNKNOWN";
};
```

## Méthode de valorisation

### Actions et ETF

1. dernier trade frais si la stratégie choisie utilise les trades ;
2. sinon midpoint bid/ask frais ;
3. sinon snapshot ou précédent close avec statut correspondant ;
4. jamais de prix zéro pour signifier une absence de donnée.

### Options

Le prix de valorisation par défaut est le midpoint si bid et ask sont présents, frais et cohérents. Sinon utiliser le dernier trade frais. En dernier recours, garder le dernier mark connu et le marquer `STALE`.

Toujours afficher la méthode. Une option peu liquide peut conserver un dernier trade ancien ; le midpoint ne doit pas être calculé si le spread ou les quotes sont invalides.

Le contrat canonique stocke : sous-jacent, call/put, échéance, strike, symbole OSI ou identifiant fournisseur, devise et multiplicateur.

### Fonds de placement

- rechercher et résoudre d’abord par ISIN ;
- vérifier la classe de parts et la devise ;
- utiliser la dernière NAV publiée et sa date ;
- ne jamais interpoler une NAV intraday ;
- considérer week-ends, jours fériés et fréquence de publication avant de marquer `STALE`.

### FX

- convertir chaque valeur depuis sa devise native vers CHF avec un taux horodaté ;
- conserver le taux exact utilisé ;
- ne pas convertir deux fois un instrument déjà libellé en CHF ;
- afficher un statut périmé si le taux ne respecte plus le seuil attendu.

## Recherche et identité

Ordre de confiance :

1. ISIN + classe de parts + devise pour les fonds ;
2. identifiant fournisseur validé + place de cotation pour les titres cotés ;
3. FIGI pour le rapprochement, jamais comme preuve unique de prix ;
4. symbole canonique d’option et attributs du contrat.

Une correspondance approximative ne doit jamais remplacer automatiquement une position existante. Toute ambiguïté demande une sélection utilisateur.

## Abonnements live

- agréger les symboles demandés par tous les composants ;
- une seule souscription fournisseur par symbole ;
- désabonner après une période de grâce ;
- limiter le débit envoyé au navigateur si plusieurs ticks arrivent dans la même trame ;
- conserver le dernier tick de chaque symbole ;
- séquencer ou horodater pour ignorer les messages plus anciens ;
- gérer reconnexion et resubscription idempotentes.

## Contrats de test

Chaque adaptateur doit passer les mêmes tests :

- recherche exacte et ambiguë ;
- instrument non trouvé ;
- quote complète et quote partielle ;
- données retardées ;
- devise inattendue ;
- timestamp invalide ;
- limite de débit ;
- erreur authentification ;
- reconnexion ;
- doublon et événement hors ordre ;
- mapping option ;
- mapping fonds par ISIN.

Les tests CI utilisent des fixtures. Les tests live sont manuels, isolés et ne journalisent jamais les clés.
