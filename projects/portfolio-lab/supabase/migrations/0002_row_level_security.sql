-- =============================================================================
-- PortfolioLab — Row Level Security
--
-- RLS est activée même si l'application ne sert qu'un utilisateur. La raison
-- n'est pas le multi-tenant : c'est qu'une clé `anon` Supabase est publique par
-- construction. Sans politique, elle donne un accès total en lecture et en
-- écriture à toute personne qui la lit dans le bundle du navigateur.
--
-- Deux familles de tables :
--
--   * données utilisateur — lecture et écriture réservées au propriétaire,
--     déterminé par `auth.uid()` ;
--   * référentiel de marché — lecture autorisée aux utilisateurs authentifiés,
--     écriture réservée au serveur (`service_role`, qui contourne RLS).
--
-- `current_user_id()` isole la dépendance à `auth.uid()` pour que le schéma
-- reste testable sur un PostgreSQL nu, sans le schéma `auth` de Supabase.
-- =============================================================================

/*
 * Identité de l'appelant.
 *
 * Sur Supabase, `auth.uid()` lit le JWT. Hors Supabase — tests d'intégration,
 * PostgreSQL local — on retombe sur le paramètre de session
 * `portfolio_lab.user_id`, ce qui permet de rejouer exactement les mêmes
 * politiques.
 *
 * `security definer` avec un `search_path` figé : sans cela, un appelant
 * pourrait créer un schéma `auth` dans son propre `search_path` et détourner
 * la fonction.
 */
create or replace function current_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  resolved uuid;
begin
  begin
    execute 'select auth.uid()' into resolved;
  exception
    when undefined_function or invalid_schema_name or undefined_table then
      resolved := null;
  end;

  if resolved is not null then
    return resolved;
  end if;

  -- `true` : ne pas échouer si le paramètre n'est pas défini du tout.
  begin
    resolved := nullif(current_setting('portfolio_lab.user_id', true), '')::uuid;
  exception
    when invalid_text_representation then
      resolved := null;
  end;

  return resolved;
end;
$$;

comment on function current_user_id() is
  'Identité de l''appelant : auth.uid() sur Supabase, sinon le paramètre de session portfolio_lab.user_id utilisé par les tests.';

-- -----------------------------------------------------------------------------
-- Tables utilisateur
-- -----------------------------------------------------------------------------

alter table portfolios enable row level security;
alter table accounts enable row level security;
alter table positions enable row level security;
alter table transactions enable row level security;
alter table portfolio_snapshots enable row level security;

/*
 * `force row level security` : sans cette clause, le propriétaire des tables
 * échappe aux politiques. C'est précisément le rôle sous lequel tournent les
 * migrations, donc l'exception la plus facile à oublier.
 */
alter table portfolios force row level security;
alter table accounts force row level security;
alter table positions force row level security;
alter table transactions force row level security;
alter table portfolio_snapshots force row level security;

/*
 * Une politique par table et par commande, plutôt qu'une politique `for all`.
 *
 * `using` filtre les lignes visibles ; `with check` contrôle les lignes écrites.
 * Une politique `for all` avec un seul `using` laisserait passer un `insert`
 * portant le `user_id` d'un tiers, puisque `with check` retomberait sur `using`
 * sans que ce soit explicite.
 */

create policy portfolios_select on portfolios
  for select using (user_id = current_user_id());
create policy portfolios_insert on portfolios
  for insert with check (user_id = current_user_id());
create policy portfolios_update on portfolios
  for update using (user_id = current_user_id())
  with check (user_id = current_user_id());
create policy portfolios_delete on portfolios
  for delete using (user_id = current_user_id());

create policy accounts_select on accounts
  for select using (user_id = current_user_id());
create policy accounts_insert on accounts
  for insert with check (user_id = current_user_id());
create policy accounts_update on accounts
  for update using (user_id = current_user_id())
  with check (user_id = current_user_id());
create policy accounts_delete on accounts
  for delete using (user_id = current_user_id());

create policy positions_select on positions
  for select using (user_id = current_user_id());
create policy positions_insert on positions
  for insert with check (user_id = current_user_id());
create policy positions_update on positions
  for update using (user_id = current_user_id())
  with check (user_id = current_user_id());
create policy positions_delete on positions
  for delete using (user_id = current_user_id());

create policy transactions_select on transactions
  for select using (user_id = current_user_id());
create policy transactions_insert on transactions
  for insert with check (user_id = current_user_id());
create policy transactions_update on transactions
  for update using (user_id = current_user_id())
  with check (user_id = current_user_id());
create policy transactions_delete on transactions
  for delete using (user_id = current_user_id());

create policy portfolio_snapshots_select on portfolio_snapshots
  for select using (user_id = current_user_id());
create policy portfolio_snapshots_insert on portfolio_snapshots
  for insert with check (user_id = current_user_id());
create policy portfolio_snapshots_update on portfolio_snapshots
  for update using (user_id = current_user_id())
  with check (user_id = current_user_id());
create policy portfolio_snapshots_delete on portfolio_snapshots
  for delete using (user_id = current_user_id());

/*
 * Cohérence hiérarchique.
 *
 * RLS empêche de lire ou d'écrire la donnée d'autrui, mais n'empêche pas de
 * rattacher SA position au portefeuille d'un tiers si l'identifiant est deviné.
 * Ces déclencheurs ferment cette faille au niveau de l'intégrité, là où une
 * clé étrangère seule ne suffit pas.
 */
create or replace function assert_same_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  parent_user uuid;
begin
  if tg_table_name = 'accounts' then
    select user_id into parent_user from portfolios where id = new.portfolio_id;
  elsif tg_table_name = 'positions' then
    select user_id into parent_user from portfolios where id = new.portfolio_id;
    if parent_user is distinct from new.user_id then
      raise exception 'Le portefeuille % n''appartient pas à l''utilisateur %',
        new.portfolio_id, new.user_id
        using errcode = 'check_violation';
    end if;
    select user_id into parent_user from accounts where id = new.account_id;
  elsif tg_table_name = 'transactions' then
    select user_id into parent_user from positions where id = new.position_id;
  elsif tg_table_name = 'portfolio_snapshots' then
    select user_id into parent_user from portfolios where id = new.portfolio_id;
  else
    return new;
  end if;

  if parent_user is distinct from new.user_id then
    raise exception 'La ressource parente n''appartient pas à l''utilisateur %', new.user_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger accounts_assert_same_owner
  before insert or update on accounts
  for each row execute function assert_same_owner();

create trigger positions_assert_same_owner
  before insert or update on positions
  for each row execute function assert_same_owner();

create trigger transactions_assert_same_owner
  before insert or update on transactions
  for each row execute function assert_same_owner();

create trigger portfolio_snapshots_assert_same_owner
  before insert or update on portfolio_snapshots
  for each row execute function assert_same_owner();

-- -----------------------------------------------------------------------------
-- Référentiel de marché — lecture authentifiée, écriture serveur
-- -----------------------------------------------------------------------------

alter table instruments enable row level security;
alter table instrument_identifiers enable row level security;
alter table option_contracts enable row level security;
alter table provider_mappings enable row level security;
alter table current_quotes enable row level security;
alter table daily_price_history enable row level security;
alter table fx_rates enable row level security;
alter table sync_runs enable row level security;

alter table instruments force row level security;
alter table instrument_identifiers force row level security;
alter table option_contracts force row level security;
alter table provider_mappings force row level security;
alter table current_quotes force row level security;
alter table daily_price_history force row level security;
alter table fx_rates force row level security;
alter table sync_runs force row level security;

/*
 * Lecture seule pour tout utilisateur authentifié : un cours n'est pas une
 * donnée personnelle, et le référentiel est partagé.
 *
 * Aucune politique d'écriture n'est créée. L'ingestion passe par
 * `service_role`, qui contourne RLS — le navigateur ne peut donc jamais
 * inscrire un prix, même en connaissant la clé `anon`.
 */
create policy instruments_read on instruments
  for select using (current_user_id() is not null);
create policy instrument_identifiers_read on instrument_identifiers
  for select using (current_user_id() is not null);
create policy option_contracts_read on option_contracts
  for select using (current_user_id() is not null);
create policy provider_mappings_read on provider_mappings
  for select using (current_user_id() is not null);
create policy current_quotes_read on current_quotes
  for select using (current_user_id() is not null);
create policy daily_price_history_read on daily_price_history
  for select using (current_user_id() is not null);
create policy fx_rates_read on fx_rates
  for select using (current_user_id() is not null);

/*
 * `sync_runs` n'a aucune politique, pas même en lecture : le journal
 * d'exploitation peut contenir un résumé d'erreur fournisseur et n'a aucune
 * raison d'être exposé au navigateur.
 */
