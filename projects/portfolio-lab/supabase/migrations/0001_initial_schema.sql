-- =============================================================================
-- PortfolioLab — schéma initial
--
-- Conventions appliquées dans tout ce fichier :
--   * tous les timestamps sont `timestamptz` et stockés en UTC ;
--   * quantités, prix, strikes et taux utilisent `numeric(30, 12)` — jamais
--     `double precision`, dont l'imprécision binaire est visible dès qu'on
--     additionne des dizaines de positions ;
--   * chaque table liée à un utilisateur porte `user_id` directement, y compris
--     lorsque le lien pourrait être déduit par jointure : une politique RLS qui
--     dépend d'une sous-requête est plus lente et plus facile à casser ;
--   * les tables de référence de marché (instruments, cours, FX) sont partagées
--     et non rattachées à un utilisateur.
-- =============================================================================

-- `gen_random_uuid()` — disponible en natif depuis PostgreSQL 13, l'extension
-- reste nécessaire sur les instances Supabase gérées.
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Types énumérés
--
-- Un `enum` plutôt qu'une contrainte textuelle : PostgreSQL refuse alors une
-- valeur inconnue à l'écriture, ce qui empêche un adaptateur fournisseur
-- d'inventer un niveau de fraîcheur non prévu.
-- -----------------------------------------------------------------------------

create type asset_type as enum ('STOCK', 'ETF', 'OPTION', 'MUTUAL_FUND', 'CASH', 'OTHER');

create type identifier_type as enum ('TICKER', 'ISIN', 'FIGI', 'PROVIDER_SYMBOL', 'OSI');

create type option_type as enum ('CALL', 'PUT');

create type exercise_style as enum ('AMERICAN', 'EUROPEAN');

create type settlement_type as enum ('PHYSICAL', 'CASH');

create type transaction_type as enum (
  'BUY', 'SELL', 'DIVIDEND', 'FEE', 'DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT'
);

create type quote_freshness as enum (
  'LIVE', 'DELAYED', 'EOD', 'NAV', 'MANUAL', 'STALE', 'UNAVAILABLE'
);

create type price_type as enum (
  'LAST_TRADE', 'MID', 'BID', 'ASK', 'PREVIOUS_CLOSE', 'NAV', 'MANUAL'
);

create type market_state as enum ('PRE', 'OPEN', 'AFTER', 'CLOSED', 'UNKNOWN');

create type verification_status as enum ('UNVERIFIED', 'VERIFIED', 'FAILED', 'AMBIGUOUS');

create type sync_status as enum ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- -----------------------------------------------------------------------------
-- Fonctions utilitaires
-- -----------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

/*
 * Validation syntaxique d'un ISIN : 12 caractères, deux lettres de pays, neuf
 * caractères alphanumériques et une clé de contrôle Luhn sur la représentation
 * décimale.
 *
 * Vérifier la clé et pas seulement le format évite qu'une faute de frappe soit
 * envoyée telle quelle à un fournisseur, puis rapprochée par erreur d'un autre
 * instrument.
 */
create or replace function is_valid_isin(candidate text)
returns boolean
language plpgsql
immutable
as $$
declare
  expanded text := '';
  character text;
  total integer := 0;
  digit integer;
  position_index integer;
  -- Luhn double un chiffre sur deux en partant de l'avant-dernier : le chiffre
  -- de contrôle lui-même n'est jamais doublé.
  double_it boolean := false;
begin
  if candidate is null or candidate !~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$' then
    return false;
  end if;

  -- Chaque lettre devient sa position dans l'alphabet + 9 (A = 10, Z = 35).
  for position_index in 1..12 loop
    character := substr(candidate, position_index, 1);
    if character ~ '[0-9]' then
      expanded := expanded || character;
    else
      expanded := expanded || (ascii(character) - 55)::text;
    end if;
  end loop;

  -- Luhn, en partant de la droite : un chiffre sur deux est doublé.
  for position_index in reverse length(expanded)..1 loop
    digit := substr(expanded, position_index, 1)::integer;
    if double_it then
      digit := digit * 2;
      if digit > 9 then
        digit := digit - 9;
      end if;
    end if;
    total := total + digit;
    double_it := not double_it;
  end loop;

  return total % 10 = 0;
end;
$$;

-- -----------------------------------------------------------------------------
-- Données utilisateur
-- -----------------------------------------------------------------------------

/*
 * Portefeuille : conteneur racine.
 *
 * `user_id` référence `auth.users` sur Supabase. La contrainte de clé étrangère
 * est posée par la migration `0002_supabase_auth.sql`, qui n'est appliquée que
 * lorsque le schéma `auth` existe — ainsi le schéma reste testable sur un
 * PostgreSQL nu.
 */
create table portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  base_currency char(3) not null default 'CHF',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint portfolios_name_not_blank check (length(btrim(name)) > 0),
  constraint portfolios_currency_format check (base_currency ~ '^[A-Z]{3}$'),
  -- Un seul portefeuille par nom et par utilisateur : deux « Principal »
  -- rendraient l'interface ambiguë.
  constraint portfolios_unique_name_per_user unique (user_id, name)
);

create index portfolios_user_id_idx on portfolios (user_id);

/*
 * Compte : étiquette d'organisation, jamais un accès bancaire.
 *
 * `institution_label` est du texte libre saisi par l'utilisateur — « Swissquote »,
 * « IBKR », « BCGE ». Aucune colonne ne peut recevoir d'identifiant, de mot de
 * passe ou de jeton : il n'en existe pas dans ce modèle, par conception.
 */
create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  portfolio_id uuid not null references portfolios (id) on delete cascade,
  name text not null,
  institution_label text,
  display_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint accounts_name_not_blank check (length(btrim(name)) > 0),
  constraint accounts_unique_name_per_portfolio unique (portfolio_id, name)
);

create index accounts_user_id_idx on accounts (user_id);
create index accounts_portfolio_id_idx on accounts (portfolio_id);

-- -----------------------------------------------------------------------------
-- Référentiel d'instruments — partagé, non rattaché à un utilisateur
-- -----------------------------------------------------------------------------

create table instruments (
  id uuid primary key default gen_random_uuid(),
  asset_type asset_type not null,
  name text not null,
  short_name text,
  primary_currency char(3) not null,
  exchange_mic char(4),
  country_code char(2),
  is_active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint instruments_name_not_blank check (length(btrim(name)) > 0),
  constraint instruments_currency_format check (primary_currency ~ '^[A-Z]{3}$'),
  constraint instruments_mic_format check (exchange_mic is null or exchange_mic ~ '^[A-Z0-9]{4}$')
);

create index instruments_asset_type_idx on instruments (asset_type);
-- Recherche insensible à la casse sur le nom, sans dépendre d'une extension.
create index instruments_name_lower_idx on instruments (lower(name));

create table instrument_identifiers (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references instruments (id) on delete cascade,
  identifier_type identifier_type not null,
  identifier_value text not null,
  provider text,
  exchange_mic char(4),
  created_at timestamptz not null default now(),

  constraint instrument_identifiers_value_not_blank check (length(btrim(identifier_value)) > 0),
  -- Un ISIN mal formé ne doit jamais entrer : il serait ensuite envoyé tel quel
  -- à un fournisseur et pourrait résoudre un instrument différent.
  constraint instrument_identifiers_isin_valid check (
    identifier_type <> 'ISIN' or is_valid_isin(identifier_value)
  )
);

/*
 * Un même identifiant peut légitimement exister chez plusieurs fournisseurs et
 * sur plusieurs places : l'unicité porte donc sur le quadruplet complet.
 * `coalesce` neutralise les NULL, que PostgreSQL considérerait sinon comme
 * toujours distincts.
 */
create unique index instrument_identifiers_unique_idx
  on instrument_identifiers (
    identifier_type,
    identifier_value,
    coalesce(provider, ''),
    coalesce(exchange_mic, '')
  );

create index instrument_identifiers_instrument_idx on instrument_identifiers (instrument_id);
create index instrument_identifiers_lookup_idx
  on instrument_identifiers (identifier_type, identifier_value);

/*
 * Contrat d'option canonique.
 *
 * `multiplier` n'a volontairement PAS de valeur par défaut à 100 : la spécifie
 * explicitement à l'insertion force l'adaptateur fournisseur à la lire chez la
 * source. Supposer 100 en silence fausserait toute valorisation d'un contrat
 * ajusté après un split ou d'un contrat non standard.
 */
create table option_contracts (
  instrument_id uuid primary key references instruments (id) on delete cascade,
  underlying_instrument_id uuid not null references instruments (id) on delete restrict,
  option_type option_type not null,
  expiration_date date not null,
  strike numeric(30, 12) not null,
  multiplier numeric(30, 12) not null,
  settlement_type settlement_type,
  exercise_style exercise_style,
  created_at timestamptz not null default now(),

  constraint option_contracts_strike_positive check (strike > 0),
  constraint option_contracts_multiplier_positive check (multiplier > 0),
  -- Une option ne peut pas avoir pour sous-jacent elle-même.
  constraint option_contracts_underlying_differs check (instrument_id <> underlying_instrument_id)
);

create index option_contracts_underlying_idx on option_contracts (underlying_instrument_id);
create index option_contracts_expiration_idx on option_contracts (expiration_date);

-- -----------------------------------------------------------------------------
-- Positions et transactions
-- -----------------------------------------------------------------------------

/*
 * Position agrégée par instrument et par compte.
 *
 * `quantity` peut être négative (position vendeuse) mais jamais nulle : une
 * ligne à zéro est une position fermée, qui se supprime.
 *
 * `average_cost` et `cost_currency` sont conservés séparément du prix de marché
 * et de sa devise : un titre peut être acheté en USD et coté sur une place dont
 * la devise diffère.
 */
create table positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  portfolio_id uuid not null references portfolios (id) on delete cascade,
  account_id uuid not null references accounts (id) on delete cascade,
  instrument_id uuid not null references instruments (id) on delete restrict,
  quantity numeric(30, 12) not null,
  average_cost numeric(30, 12) not null,
  cost_currency char(3) not null,
  opened_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint positions_quantity_not_zero check (quantity <> 0),
  -- Un coût moyen négatif n'a pas de sens : le sens de la position est porté
  -- par le signe de la quantité, pas par celui du prix payé.
  constraint positions_average_cost_not_negative check (average_cost >= 0),
  constraint positions_currency_format check (cost_currency ~ '^[A-Z]{3}$'),
  constraint positions_notes_length check (notes is null or length(notes) <= 2000),
  constraint positions_unique_per_account unique (account_id, instrument_id)
);

create index positions_user_id_idx on positions (user_id);
create index positions_portfolio_id_idx on positions (portfolio_id);
create index positions_instrument_id_idx on positions (instrument_id);

/*
 * Transactions.
 *
 * Le modèle est posé dès le Lot 02 même si le flux V1 commence par
 * quantité + coût moyen : ajouter cette table plus tard imposerait une
 * migration de données, alors que la créer vide ne coûte rien.
 */
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  position_id uuid not null references positions (id) on delete cascade,
  transaction_type transaction_type not null,
  trade_date date not null,
  quantity numeric(30, 12) not null,
  unit_price numeric(30, 12) not null,
  currency char(3) not null,
  fees numeric(30, 12) not null default 0,
  external_reference text,
  created_at timestamptz not null default now(),

  constraint transactions_unit_price_not_negative check (unit_price >= 0),
  constraint transactions_fees_not_negative check (fees >= 0),
  constraint transactions_currency_format check (currency ~ '^[A-Z]{3}$')
);

create index transactions_user_id_idx on transactions (user_id);
create index transactions_position_idx on transactions (position_id, trade_date);

-- -----------------------------------------------------------------------------
-- Données de marché — partagées, alimentées côté serveur uniquement
-- -----------------------------------------------------------------------------

create table provider_mappings (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references instruments (id) on delete cascade,
  provider text not null,
  provider_symbol text not null,
  provider_exchange text,
  capabilities_json jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  verification_status verification_status not null default 'UNVERIFIED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint provider_mappings_unique unique (instrument_id, provider),
  -- Un mapping ne peut pas être marqué vérifié sans date de vérification :
  -- « vérifié » sans preuve datée ne veut rien dire.
  constraint provider_mappings_verified_has_date check (
    verification_status <> 'VERIFIED' or verified_at is not null
  )
);

create index provider_mappings_provider_idx on provider_mappings (provider, provider_symbol);

/*
 * Dernier cours connu par instrument et par fournisseur.
 *
 * Cette table ne reçoit PAS chaque tick : la passerelle garde le flux en
 * mémoire et n'y écrit qu'un état utile. Persister chaque tick saturerait la
 * base sans rien apporter à une application patrimoniale.
 *
 * `as_of` est l'horodatage donné par le fournisseur ; `received_at` celui de la
 * réception. Les deux sont conservés : leur écart est précisément ce qui permet
 * de décider si une donnée est périmée.
 */
create table current_quotes (
  instrument_id uuid not null references instruments (id) on delete cascade,
  provider text not null,
  price numeric(30, 12) not null,
  currency char(3) not null,
  price_type price_type not null,
  freshness quote_freshness not null,
  as_of timestamptz not null,
  received_at timestamptz not null default now(),
  bid numeric(30, 12),
  ask numeric(30, 12),
  previous_close numeric(30, 12),
  market_state market_state not null default 'UNKNOWN',
  raw_hash text,

  primary key (instrument_id, provider),
  -- Zéro ne doit jamais signifier « pas de donnée » : l'absence se code par
  -- l'absence de ligne ou par freshness = UNAVAILABLE.
  constraint current_quotes_price_positive check (price > 0),
  constraint current_quotes_bid_positive check (bid is null or bid > 0),
  constraint current_quotes_ask_positive check (ask is null or ask > 0),
  constraint current_quotes_currency_format check (currency ~ '^[A-Z]{3}$'),
  -- Un spread inversé signale une donnée corrompue ; on la refuse plutôt que
  -- de calculer un midpoint absurde.
  constraint current_quotes_spread_ordered check (bid is null or ask is null or bid <= ask)
);

create index current_quotes_as_of_idx on current_quotes (as_of desc);

create table daily_price_history (
  instrument_id uuid not null references instruments (id) on delete cascade,
  price_date date not null,
  open numeric(30, 12),
  high numeric(30, 12),
  low numeric(30, 12),
  close numeric(30, 12) not null,
  currency char(3) not null,
  provider text not null,
  price_type price_type not null,
  created_at timestamptz not null default now(),

  primary key (instrument_id, price_date, provider),
  constraint daily_price_history_close_positive check (close > 0),
  constraint daily_price_history_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint daily_price_history_range_ordered check (
    high is null or low is null or high >= low
  )
);

/*
 * Taux de change horodatés.
 *
 * Le taux effectivement utilisé pour une conversion doit rester retrouvable :
 * sans lui, un total en CHF n'est pas reproductible.
 */
create table fx_rates (
  base_currency char(3) not null,
  quote_currency char(3) not null,
  rate numeric(30, 12) not null,
  provider text not null,
  as_of timestamptz not null,
  freshness quote_freshness not null,
  received_at timestamptz not null default now(),

  primary key (base_currency, quote_currency, provider, as_of),
  constraint fx_rates_rate_positive check (rate > 0),
  constraint fx_rates_currencies_differ check (base_currency <> quote_currency),
  constraint fx_rates_base_format check (base_currency ~ '^[A-Z]{3}$'),
  constraint fx_rates_quote_format check (quote_currency ~ '^[A-Z]{3}$')
);

create index fx_rates_latest_idx on fx_rates (base_currency, quote_currency, as_of desc);

-- -----------------------------------------------------------------------------
-- Snapshots et exploitation
-- -----------------------------------------------------------------------------

create table portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  portfolio_id uuid not null references portfolios (id) on delete cascade,
  snapshot_at timestamptz not null,
  market_value_base numeric(30, 12) not null,
  cost_basis_base numeric(30, 12) not null,
  unrealized_pnl_base numeric(30, 12) not null,
  day_pnl_base numeric(30, 12),
  base_currency char(3) not null,
  -- Version du moteur de calcul : un snapshot n'est comparable qu'à un autre
  -- produit par la même version.
  calculation_version text not null,
  components_hash text,
  created_at timestamptz not null default now(),

  constraint portfolio_snapshots_unique unique (portfolio_id, snapshot_at),
  constraint portfolio_snapshots_currency_format check (base_currency ~ '^[A-Z]{3}$')
);

create index portfolio_snapshots_lookup_idx on portfolio_snapshots (portfolio_id, snapshot_at desc);

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  job_type text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status sync_status not null default 'RUNNING',
  items_requested integer not null default 0,
  items_updated integer not null default 0,
  items_failed integer not null default 0,
  -- Résumé d'erreur expurgé : aucune clé, aucune URL signée. L'expurgation est
  -- faite par l'appelant ; la colonne est bornée pour limiter les dégâts d'un
  -- oubli.
  error_summary text,

  constraint sync_runs_counts_not_negative check (
    items_requested >= 0 and items_updated >= 0 and items_failed >= 0
  ),
  constraint sync_runs_error_summary_length check (
    error_summary is null or length(error_summary) <= 2000
  ),
  constraint sync_runs_finished_after_started check (
    finished_at is null or finished_at >= started_at
  )
);

create index sync_runs_provider_idx on sync_runs (provider, started_at desc);

-- -----------------------------------------------------------------------------
-- Déclencheurs updated_at
-- -----------------------------------------------------------------------------

create trigger portfolios_set_updated_at
  before update on portfolios
  for each row execute function set_updated_at();

create trigger accounts_set_updated_at
  before update on accounts
  for each row execute function set_updated_at();

create trigger instruments_set_updated_at
  before update on instruments
  for each row execute function set_updated_at();

create trigger positions_set_updated_at
  before update on positions
  for each row execute function set_updated_at();

create trigger provider_mappings_set_updated_at
  before update on provider_mappings
  for each row execute function set_updated_at();
