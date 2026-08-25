# Audit des sources de cours candidates

Huit dépôts proposés ont été clonés et lus le 25.08.2026. Ce document consigne
ce qu'ils appellent réellement, pas ce que leur README promet.

**Aucun n'a pu être testé par un appel réel** : l'environnement d'analyse ne
laisse sortir que vers GitHub. Les conclusions viennent de la lecture du code
et des dates de fermeture publiques des services appelés, jamais d'une
réponse obtenue.

## Verdict par dépôt

| Dépôt | Appelle | Clé | État | Verdict |
| --- | --- | --- | --- | --- |
| `gurch101/StockScraper` | `query.yahooapis.com/v1/public/yql` | non | 2016, Python 2 | **Mort** |
| `avichen/java-stocks` | `finance.yahoo.com/d/quotes.csv` | non | 2013, Java | **Mort** |
| `anvk/google-stocks` | `finance.google.com/finance?output=json` | non | 2018 | **Mort** |
| `JECSand/yahoofinancials` | `query1/query2.finance.yahoo.com` | non | 2023 | Utilisable, non officiel |
| `Alex2Yang97/yahoo-finance-mcp` | `yfinance` → Yahoo | non | 2026 | Serveur MCP, pas un module web |
| `scheb/yahoo-finance-api` | `query{1,2}.finance.yahoo.com` + crumb | non | 2026 | Le mieux construit du lot Yahoo |
| `Mathieu2301/TradingView-API` | WebSocket privé TradingView | **mot de passe** | 2026 | **Disqualifié** |
| `sammchardy/python-binance` | `api.binance.com` (officielle) | facultative | 2026 | Légitime, crypto seulement |

### Les trois morts

Ce ne sont pas des dépôts « anciens mais fonctionnels » : les services qu'ils
appellent ont fermé.

- **YQL** (`query.yahooapis.com`) a été arrêté par Yahoo en novembre 2017.
  `StockScraper` est en outre écrit en Python 2, dont le support a cessé en
  2020.
- **L'export CSV** `finance.yahoo.com/d/quotes.csv` a été fermé en mai 2017.
  C'est le seul appel de `java-stocks`.
- **Google Finance API** a été dépréciée en 2011 et l'endpoint
  `?output=json` a cessé de répondre en 2018.

### Le disqualifié

`TradingView-API` obtient ses cours en **se connectant avec vos identifiants
TradingView** : la fonction `loginUser(username, password)` récupère le cookie
`sessionid` et s'en sert pour ouvrir le WebSocket privé du site. Son README
revendique les « Premium features » et le fonctionnement « with invite-only
indicators ».

Trois raisons de refuser, dont une seule suffirait :

1. Il faudrait stocker un mot de passe sur le serveur. La règle du projet
   l'interdit sans exception.
2. Il imite un navigateur pour accéder à un service authentifié — ce n'est pas
   une API, c'est une session détournée.
3. Il est conçu pour obtenir des fonctions payantes sans les payer.

Techniquement c'est le plus capable des huit. Ce n'est pas une raison.

### Le légitime mais hors sujet

`python-binance` enveloppe l'API **officielle et documentée** de Binance, avec
un vrai WebSocket. Rien à lui reprocher — mais il ne sert que de la crypto, et
l'accès sans clé de CoinGecko couvre déjà ce besoin, sans compte à créer.

## Ce que Yahoo apporte réellement

Trois dépôts sur huit interrogent les mêmes endpoints Yahoo. Le meilleur écrit
est `scheb/yahoo-finance-api` : il gère le cookie de consentement puis le
`crumb` exigé depuis 2023, et il expose les endpoints utiles —
`/v7/finance/quote`, `/v1/finance/search`, `/v8/finance/chart`,
`/v7/finance/options`.

Deux avantages concrets sur Finnhub :

**La couverture.** Yahoo sert les places suisses et européennes (`NESN.SW`),
les fonds de placement et les chaînes d'options. Le plan gratuit de Finnhub ne
sert aucun des trois. C'est exactement le trou de couverture actuel.

**L'honnêteté de la fraîcheur.** `/v7/finance/quote` renvoie
`exchangeDataDelayedBy` — le retard en minutes, `0` pour du temps réel — et
`marketState`. La fraîcheur se **lit dans la donnée** au lieu d'être déclarée
par configuration. C'est strictement meilleur que Finnhub, où une clé gratuite
et une clé payante sont indiscernables et où le plan doit être renseigné à la
main dans `FINNHUB_PLAN`.

## Ce qui s'y oppose

Ces endpoints sont **non officiels**. L'auteur de `scheb/yahoo-finance-api`,
qui les connaît mieux que quiconque, l'écrit lui-même dans son README :

> These non-official APIs cannot be assumed stable and might break any time.
> Also, you might violate Yahoo's terms of service.

La règle posée au début du projet est explicite : *utiliser seulement un accès
keyless officiel, une clé démo officiellement publiée, ou mes propres clés
API*. Le scraping de Yahoo n'entre dans aucune des trois cases.

Trois conséquences pratiques, indépendamment de la question juridique :

- l'endpoint peut changer sans préavis, un matin, sans version ni annonce ;
- Yahoo bloque les adresses de centres de données par vagues — un
  hébergement Vercel est une cible plus exposée qu'un ordinateur personnel ;
- aucun contrat, donc aucun recours quand ça casse.

## Recommandation

Ne rien reprendre de ces dépôts tel quel. Ce sont tous des enveloppes HTTP
minces : ce qui a de la valeur est la **technique** — l'enchaînement
cookie → crumb → quote de `scheb` — pas le code, qui est en PHP ou en Python
alors que l'application est en TypeScript.

Ordre de préférence pour la couverture manquante :

1. **Finnhub payant** (~50 USD/mois) — officiel, contractuel, couvre les
   places européennes en temps réel. La seule option sans compromis.
2. **EODHD ou Twelve Data** — officiels, avec clé, plans d'entrée modestes ;
   les deux adaptateurs existent déjà dans `packages/market-data/`, il ne leur
   manque qu'une clé.
3. **Adaptateur Yahoo** — gratuit, la meilleure couverture, la meilleure
   fraîcheur déclarée, mais non officiel et hors de la règle du projet.

L'option 3 demande une décision explicite du propriétaire du projet avant
d'être écrite. Elle ne sera pas ajoutée en silence.
