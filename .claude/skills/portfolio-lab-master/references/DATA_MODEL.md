# PortfolioLab — Modèle de données et calculs

## Principes

- PostgreSQL est la source de vérité pour les données utilisateur et les snapshots persistés.
- Les ticks live restent principalement dans la passerelle/cache ; ne pas écrire chaque tick en base.
- Les montants, quantités, strikes, prix et taux FX utilisent `numeric` en base et une représentation décimale exacte dans le code.
- Tous les timestamps sont stockés en UTC ; l’interface les présente dans le fuseau de l’utilisateur.
- La suppression utilisateur doit être explicite et auditable.

## Tables principales

### `portfolios`

- `id`
- `user_id`
- `name`
- `base_currency` — `CHF` par défaut
- `created_at`, `updated_at`

### `accounts`

Étiquettes uniquement, sans credentials bancaires.

- `id`
- `portfolio_id`
- `name`
- `institution_label`
- `display_order`
- `archived_at`

### `instruments`

- `id`
- `asset_type`
- `name`
- `short_name`
- `primary_currency`
- `exchange_mic`
- `country_code`
- `is_active`
- `metadata_json`

`asset_type` V1 : `STOCK`, `ETF`, `OPTION`, `MUTUAL_FUND`, `CASH`, `OTHER`.

### `instrument_identifiers`

- `instrument_id`
- `identifier_type` — `TICKER`, `ISIN`, `FIGI`, `PROVIDER_SYMBOL`, `OSI`
- `identifier_value`
- `provider`
- `exchange_mic`
- contrainte d’unicité appropriée

### `option_contracts`

- `instrument_id`
- `underlying_instrument_id`
- `option_type` — `CALL` ou `PUT`
- `expiration_date`
- `strike`
- `multiplier`
- `settlement_type` optionnel
- `exercise_style` optionnel

### `positions`

V1 peut utiliser une position agrégée par instrument et compte.

- `id`
- `portfolio_id`
- `account_id`
- `instrument_id`
- `quantity`
- `average_cost`
- `cost_currency`
- `opened_on` optionnel
- `notes` optionnel
- `created_at`, `updated_at`

Contrainte : une position active unique par compte/instrument, sauf décision future de supporter plusieurs lots visibles.

### `transactions`

Prévoir le modèle dès le départ même si le flux V1 commence par quantité + coût moyen.

- `id`
- `position_id`
- `transaction_type` — `BUY`, `SELL`, `DIVIDEND`, `FEE`, `DEPOSIT`, `WITHDRAWAL`, `ADJUSTMENT`
- `trade_date`
- `quantity`
- `unit_price`
- `currency`
- `fees`
- `external_reference` optionnel

### `provider_mappings`

- `instrument_id`
- `provider`
- `provider_symbol`
- `provider_exchange`
- `capabilities_json`
- `verified_at`
- `verification_status`

### `current_quotes`

Dernier état persistant utile, pas chaque tick.

- `instrument_id`
- `provider`
- `price`
- `currency`
- `price_type`
- `freshness`
- `as_of`
- `received_at`
- `bid`, `ask`, `previous_close`
- `raw_hash` optionnel

### `daily_price_history`

- `instrument_id`
- `price_date`
- `open`, `high`, `low`, `close`
- `currency`
- `provider`
- `price_type`

### `fx_rates`

- `base_currency`
- `quote_currency`
- `rate`
- `provider`
- `as_of`
- `freshness`

### `portfolio_snapshots`

- `portfolio_id`
- `snapshot_at`
- `market_value_base`
- `cost_basis_base`
- `unrealized_pnl_base`
- `day_pnl_base`
- `calculation_version`
- `components_hash`

### `sync_runs`

- `provider`
- `job_type`
- `started_at`, `finished_at`
- `status`
- `items_requested`, `items_updated`, `items_failed`
- `error_summary` expurgé

## Types décimaux

Recommandation PostgreSQL : `numeric(30, 12)` pour quantités, prix et taux. Adapter seulement après tests de plage.

Dans TypeScript :

- transporter les décimales sous forme de chaînes aux frontières JSON ;
- convertir dans une bibliothèque décimale au niveau métier ;
- formater uniquement dans la couche UI ;
- ne jamais effectuer un calcul monétaire critique avec `number`.

## Formules V1

Soit :

- `q` quantité ;
- `m` multiplicateur, 1 pour action/ETF/fonds, valeur stockée pour option ;
- `p` prix de valorisation natif ;
- `c` coût moyen natif ;
- `fx` taux de la devise native vers CHF ;
- `pc` précédent close natif.

```text
market_value_native = q × m × p
market_value_chf    = market_value_native × fx
cost_basis_native   = q × m × c
cost_basis_chf      = cost_basis_native × fx
unrealized_pnl_chf  = market_value_chf - cost_basis_chf
day_pnl_native      = q × m × (p - pc)
day_pnl_chf         = day_pnl_native × fx
```

Pour les positions short, les signes doivent être testés explicitement. Ne pas afficher un pourcentage de P&L trompeur si le dénominateur est nul ou négatif.

### Pourcentage latent

```text
unrealized_pnl_pct = unrealized_pnl_native / abs(cost_basis_native)
```

Uniquement si `abs(cost_basis_native) > 0`.

### Allocation

```text
allocation_pct = abs(position_market_value_chf) / total_absolute_market_value_chf
```

Présenter séparément les expositions nettes et brutes quand des positions négatives existent.

## Choix du mark

Le moteur de portefeuille ne choisit pas silencieusement un prix. Le service de marché lui transmet le `price`, le `priceType` et le `freshness` déjà déterminés. Le résultat de valorisation propage ces métadonnées.

## Snapshots et historique

- snapshot quotidien après fermeture ou publication des données attendues ;
- snapshot additionnel à chaque modification manuelle importante ;
- conservation de la version du moteur de calcul ;
- recalcul reproductible à partir des composants ;
- ne pas confondre performance du marché et versements/retraits lorsque les transactions seront activées.

## Validation

- quantité non nulle pour une position active ;
- devise ISO 4217 connue ;
- prix et coût non négatifs pour les positions longues standard ;
- échéance option valide ;
- strike positif ;
- multiplicateur positif ;
- ISIN validé syntaxiquement avant résolution ;
- compte et portefeuille appartenant au même utilisateur ;
- quote plus ancienne ignorée si un événement plus récent existe.

## RLS

Toutes les tables liées à l’utilisateur doivent appliquer des politiques RLS fondées sur `auth.uid()`. Les tables de référence globales restent en lecture seule côté client. La clé `service_role` n’est jamais envoyée au navigateur.
