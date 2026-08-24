# Rollout live — ordre recommandé

## Phase A — sans argent

1. Implémenter routeur multi-provider.
2. Ajouter EODHD en mode demo/officiel lorsque possible.
3. Ajouter les endpoints gratuits/démo Twelve Data.
4. Ajouter CoinGecko Demo si disponible.
5. OpenFIGI sans clé ou avec clé gratuite pour le mapping.
6. Garder les tests CI sur fixtures.

Objectif : prouver le transport réel et l’architecture sans abonnement.

## Phase B — premier abonnement minimal

Acheter uniquement après la matrice. Choisir le fournisseur donnant le meilleur rapport couverture/coût pour les positions réellement détenues.

Priorité pratique :
- global equities/ETF/funds → comparer Twelve Data vs EODHD ;
- US options/futures → Massive ;
- crypto très large → CoinGecko si le fournisseur principal ne suffit pas.

## Phase C — qualité premium

Ajouter seulement si nécessaire :
- données d’indices licenciées ;
- fixed income européen/institutionnel ;
- FactSet/SIX/ICE si les fonds/obligations ne sont pas correctement couverts ;
- feeds exchange-specific si une latence très faible devient réellement utile.

## Séparation des usages

PortfolioLab est un outil personnel de visualisation. Ne jamais réutiliser une licence individuelle pour redistribuer publiquement des données ou servir plusieurs utilisateurs sans vérifier les droits.

## Activation production

Chaque fournisseur réel doit avoir :
- variable env ;
- health check ;
- timeout ;
- rate-limit/backoff ;
- circuit breaker ;
- métriques ;
- contract tests ;
- feature flag ;
- fallback ;
- documentation de révocation de clé.

## Environnements

- `mock`: fixtures uniquement ;
- `demo`: vrai endpoint mais données/symboles limités ;
- `live`: clé réelle et abonnement vérifié.

Ne jamais basculer automatiquement de `mock` à `live` parce qu’une clé existe : exiger configuration explicite.
