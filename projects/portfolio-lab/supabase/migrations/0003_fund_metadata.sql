-- =============================================================================
-- PortfolioLab — métadonnées de fonds de placement
--
-- Un fonds ne se décrit pas comme un titre coté : sa classe de parts, sa
-- fréquence de publication et la date de valeur de sa NAV déterminent
-- entièrement la façon de l'afficher et de juger sa fraîcheur.
--
-- Ces informations sont stockées à part plutôt qu'entassées dans
-- `instruments.metadata_json` : elles sont interrogées à chaque valorisation et
-- doivent être contraintes, pas simplement présentes.
-- =============================================================================

create type nav_frequency as enum ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'UNKNOWN');

create table fund_details (
  instrument_id uuid primary key references instruments (id) on delete cascade,
  /*
   * Étiquette de classe de parts, telle que publiée par l'émetteur.
   *
   * Texte libre volontairement : les conventions varient d'un émetteur à
   * l'autre, et une énumération deviendrait fausse au premier fonds au
   * nommage inhabituel.
   */
  share_class text,
  /** `true` si la classe capitalise, `false` si elle distribue, `null` si inconnu. */
  is_accumulating boolean,
  nav_frequency nav_frequency not null default 'UNKNOWN',
  /** Domiciliation, distincte du pays de cotation. */
  domicile_country char(2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fund_details_domicile_format check (
    domicile_country is null or domicile_country ~ '^[A-Z]{2}$'
  ),
  constraint fund_details_share_class_length check (
    share_class is null or length(share_class) between 1 and 40
  )
);

create trigger fund_details_set_updated_at
  before update on fund_details
  for each row execute function set_updated_at();

/*
 * Historique des NAV publiées.
 *
 * Séparé de `daily_price_history` : une NAV porte une **date de valeur**, pas
 * une séance de bourse, et n'a ni ouverture, ni haut, ni bas. Les mélanger
 * ferait apparaître des fonds dans des calculs réservés aux titres cotés.
 */
create table fund_nav_history (
  instrument_id uuid not null references instruments (id) on delete cascade,
  /** Date de valeur de la NAV, jamais l'instant de récupération. */
  nav_date date not null,
  value numeric(30, 12) not null,
  currency char(3) not null,
  provider text not null,
  /** Instant de récupération, distinct de la date de valeur. */
  retrieved_at timestamptz not null default now(),

  primary key (instrument_id, nav_date, provider),
  constraint fund_nav_history_value_positive check (value > 0),
  constraint fund_nav_history_currency_format check (currency ~ '^[A-Z]{3}$')
);

create index fund_nav_history_latest_idx
  on fund_nav_history (instrument_id, nav_date desc);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table fund_details enable row level security;
alter table fund_nav_history enable row level security;
alter table fund_details force row level security;
alter table fund_nav_history force row level security;

-- Référentiel partagé : lecture authentifiée, écriture par service_role seul.
create policy fund_details_read on fund_details
  for select using (current_user_id() is not null);
create policy fund_nav_history_read on fund_nav_history
  for select using (current_user_id() is not null);
