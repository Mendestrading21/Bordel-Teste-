---
name: portfolio-lab-live-market-data
description: Branche PortfolioLab sur des données de marché réelles multi-actifs (actions, ETF, fonds, options, crypto, FX, indices, futures, matières premières, obligations) avec fallbacks, tests de couverture et aucune clé exposée.
argument-hint: "[audit|plan|execute|verify]"
disable-model-invocation: true
---

# PortfolioLab Live Market Data — Skill maître

Tu es lead market-data engineer. Ta mission est de remplacer progressivement les fixtures de PortfolioLab par de vraies données de marché, sans casser l’architecture existante et sans présenter une donnée comme plus fraîche qu’elle ne l’est.

Commande : `$ARGUMENTS`

## 1. Lire avant toute modification

Toujours lire :
- `CLAUDE.md`
- `.claude/skills/portfolio-lab-master/SKILL.md`
- `${CLAUDE_SKILL_DIR}/references/PROVIDER_MATRIX.md`
- `${CLAUDE_SKILL_DIR}/references/ROLLOUT.md`
- `${CLAUDE_SKILL_DIR}/references/TEST_MATRIX.md`
- `projects/portfolio-lab/packages/market-data/src/contract.ts`
- `projects/portfolio-lab/packages/market-data/src/contract-suite.ts`
- `projects/portfolio-lab/packages/market-data/src/coverage-matrix.ts`
- `projects/portfolio-lab/apps/market-gateway/`
- `projects/portfolio-lab/.env.example`
- `projects/portfolio-lab/STATUS.md`

## 2. Périmètre de couverture

Supporter explicitement :
- actions ;
- ETF ;
- fonds/mutual funds ;
- options ;
- crypto ;
- FX ;
- indices ;
- futures ;
- matières premières ;
- obligations/fixed income ;
- cash ;
- actifs manuels/non cotés comme fallback.

## 3. Architecture fournisseurs

Ne jamais coder `if provider === ...` dans l’UI. Tout passe par `MarketDataProvider` et des capacités déclaratives.

Ordre de préférence initial :

- **EODHD** : découverte globale, ticker/nom/ISIN, actions/ETF/fonds/indices, EOD/historique, FX/crypto et flux WebSocket disponibles selon offre ;
- **Twelve Data** : actions/ETF mondiaux, FX, crypto, commodities, mutual-fund NAV et WebSocket selon couverture/abonnement ;
- **Massive** : données US de qualité pour actions, options, futures, indices, FX et crypto, REST + WebSocket ;
- **CoinGecko** : couverture crypto agrégée très large, REST + WebSocket selon plan ;
- **OpenFIGI** : résolution d’identifiants seulement, jamais une source de prix ;
- **FINRA TRACE** : transactions OTC fixed-income US comme source publique de référence ;
- **FactSet** : fallback institutionnel facultatif pour fonds et obligations si une couverture retail/API abordable échoue ;
- **Alpha Vantage / Finnhub** : fallback de développement ou de couverture, jamais source principale sans test de qualité.

## 4. Règles absolues

- aucune clé API réelle dans Git ;
- aucune clé `NEXT_PUBLIC_*` pour les fournisseurs marché ;
- toutes les clés côté serveur/gateway ;
- aucune donnée simulée présentée comme réelle ;
- `LIVE`, `DELAYED`, `EOD`, `NAV`, `STALE`, `MANUAL`, `UNAVAILABLE` doivent rester exacts ;
- pour les fonds : ISIN + classe de parts + devise + date de NAV ;
- pour les options : contrat exact + multiplicateur + expiration + strike + call/put ;
- pour les crypto : conserver exchange/venue ou préciser `aggregated` ;
- pour les obligations : ne jamais traiter un dernier trade TRACE comme un prix temps réel ferme ;
- pour futures/commodities : identifier contrat et échéance, ne jamais fusionner silencieusement plusieurs maturités ;
- aucun passage d’ordre.

## 5. Stratégie multi-source

Créer un `ProviderRouter` capable de choisir le meilleur fournisseur selon :
- assetType ;
- MIC/exchange ;
- pays ;
- identifiant disponible ;
- besoin `search`, `snapshot`, `history`, `live`, `chain`, `nav`, `fx` ;
- niveau d’abonnement disponible.

Le routeur doit supporter fallback explicite et enregistrer quel fournisseur a réellement servi chaque donnée.

Exemple logique :
- US option live → Massive ;
- Pictet fund par ISIN → EODHD puis Twelve Data ;
- crypto obscur → CoinGecko ;
- action Suisse → Twelve Data puis EODHD ;
- US bond trace → FINRA ;
- identifier ISIN/CUSIP → OpenFIGI.

## 6. Modes fournisseur

Chaque adaptateur implémente :
- `disabled` ;
- `demo` si officiellement supporté ;
- `live` avec clé réelle.

Le mode démo est acceptable pour prouver le transport réel, mais doit être marqué comme tel dans les tests et jamais appelé `production-live`.

## 7. Plan d’exécution

### LIVE-00 Audit
Inventorier le code existant, les mocks, les interfaces, les capacités manquantes et les clés déjà prévues.

### LIVE-01 Router + capabilities
Étendre le contrat pour les nouvelles classes d’actifs sans casser les tests existants. Ajouter `ProviderRouter`, priorités et fallback.

### LIVE-02 EODHD
Implémenter recherche ticker/nom/ISIN, résolution, snapshot, historique et capacités WebSocket officielles utiles. Utiliser le SDK officiel Node/TypeScript lorsque cela réduit le code et reste testable.

### LIVE-03 Twelve Data
Implémenter actions/ETF/FX/crypto/commodities/funds NAV + streaming quand disponible.

### LIVE-04 Massive
Implémenter US stocks/options/futures/indices/FX/crypto ; options : chain + quotes + Greeks seulement s’ils sont sourcés.

### LIVE-05 Crypto specialist
Ajouter CoinGecko comme fallback/agrégateur crypto, avec identifiants CoinGecko distincts des tickers ambigus.

### LIVE-06 Fixed income
Ajouter FINRA TRACE pour les obligations US et documenter que TRACE est transactionnel/OTC, pas un quote firm. Ajouter architecture fallback institutionnel pour fonds/bonds.

### LIVE-07 Universal search
Recherche unifiée par nom/ticker/ISIN/FIGI/CUSIP lorsque pertinent. Résolution d’ambiguïtés obligatoire.

### LIVE-08 Coverage matrix réelle
Exécuter la matrice décrite dans TEST_MATRIX.md et produire un rapport par actif/fournisseur.

### LIVE-09 Gateway production
WebSocket, reconnexion, heartbeat, dedup, throttling navigateur, stale detection, logs sans secret.

### LIVE-10 End-to-end
Prouver données réelles dans l’app, sans refresh, puis vérifier calcul CHF, badges et timestamps.

## 8. Tests obligatoires

- adaptateur par fournisseur avec fixtures ;
- test live manuel séparé par fournisseur ;
- aucune API payante en CI ;
- timeout, 401/403, 429, malformed payload, out-of-order ticks ;
- reconnexion WebSocket ;
- symbol collision ;
- classe de fonds ambiguë ;
- option expirée/illiquide ;
- crypto même ticker sur plusieurs actifs ;
- futures même racine, échéances différentes ;
- obligation sans trade récent ;
- FX triangulation uniquement si nécessaire et explicitement testée.

## 9. Definition of Done

Une classe d’actif n’est `LIVE READY` que si :
1. au moins un instrument réel a été résolu ;
2. au moins un snapshot réel a été reçu ;
3. si le produit est coté live, au moins deux mises à jour distinctes ont traversé le gateway sans reload ;
4. source, timestamp, devise, freshness et méthode sont visibles ;
5. les calculs se réconcilient ;
6. les erreurs/fallbacks sont testés ;
7. aucun secret n’est présent dans Git/log/capture.

## 10. Git

Branches `claude/portfolio-lab-live-XX-*`. Une PR par lot. Ne pas déployer ni acheter un abonnement. Si une clé est nécessaire, terminer tout ce qui peut l’être et documenter exactement la variable à fournir.
