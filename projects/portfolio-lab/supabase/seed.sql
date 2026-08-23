-- =============================================================================
-- PortfolioLab — jeu de démonstration
--
-- ATTENTION : toutes les données de ce fichier sont FICTIVES.
--
-- Les instruments portent des ISIN au format valide mais délibérément inventés
-- (préfixe pays `XX`, réservé aux usages non nationaux par l'ISO 3166) et des
-- noms explicitement marqués « Démo ». Aucun instrument réel, aucune position
-- réelle et aucun cours réel ne doit entrer ici : le dépôt est public.
--
-- Le seed n'est jamais appliqué automatiquement en production. Il sert aux
-- tests d'intégration et à une prise en main locale.
-- =============================================================================

begin;

-- Utilisateur de démonstration. En production, cet identifiant vient de
-- `auth.users` ; ici il est fixe pour rendre les tests reproductibles.
\set demo_user '00000000-0000-4000-8000-0000000dec00'

-- -----------------------------------------------------------------------------
-- Instruments fictifs
-- -----------------------------------------------------------------------------

insert into instruments (id, asset_type, name, short_name, primary_currency, exchange_mic, country_code)
values
  ('d0000000-0000-4000-8000-000000000001', 'STOCK', 'Démo Industrie SA', 'DEMOI', 'CHF', 'XSWX', 'CH'),
  ('d0000000-0000-4000-8000-000000000002', 'STOCK', 'Démo Technologies Inc (fictif)', 'DEMOT', 'USD', 'XNAS', 'US'),
  ('d0000000-0000-4000-8000-000000000003', 'ETF', 'Démo Monde ETF (fictif)', 'DEMOW', 'USD', 'XNYS', 'US'),
  ('d0000000-0000-4000-8000-000000000004', 'MUTUAL_FUND', 'Démo Fonds Équilibré P CHF (fictif)', 'DEMOF', 'CHF', null, 'LU'),
  ('d0000000-0000-4000-8000-000000000005', 'CASH', 'Liquidités CHF', 'CHF', 'CHF', null, 'CH'),
  ('d0000000-0000-4000-8000-000000000006', 'OPTION', 'Démo Technologies CALL 100 (fictif)', 'DEMOT C100', 'USD', 'XCBO', 'US');

-- ISIN fictifs, préfixe XX : jamais attribué à un émetteur réel.
-- Les clés de contrôle sont valides pour que la contrainte is_valid_isin passe.
insert into instrument_identifiers (instrument_id, identifier_type, identifier_value)
values
  ('d0000000-0000-4000-8000-000000000001', 'TICKER', 'DEMOI'),
  ('d0000000-0000-4000-8000-000000000002', 'TICKER', 'DEMOT'),
  ('d0000000-0000-4000-8000-000000000003', 'TICKER', 'DEMOW'),
  ('d0000000-0000-4000-8000-000000000001', 'ISIN', 'XX000000DEM0'),
  ('d0000000-0000-4000-8000-000000000003', 'ISIN', 'XX000000DE27'),
  ('d0000000-0000-4000-8000-000000000004', 'ISIN', 'XX000000DE35');

-- Contrat d'option fictif. Le multiplicateur est explicite, jamais supposé.
insert into option_contracts (
  instrument_id, underlying_instrument_id, option_type,
  expiration_date, strike, multiplier, exercise_style, settlement_type
)
values (
  'd0000000-0000-4000-8000-000000000006',
  'd0000000-0000-4000-8000-000000000002',
  'CALL',
  '2027-01-15',
  100,
  100,
  'AMERICAN',
  'PHYSICAL'
);

-- -----------------------------------------------------------------------------
-- Portefeuille, comptes et positions de démonstration
--
-- Les noms de comptes reprennent des noms d'établissements : ce sont de simples
-- étiquettes saisies par l'utilisateur. Aucun identifiant, aucun accès.
-- -----------------------------------------------------------------------------

insert into portfolios (id, user_id, name, base_currency)
values ('d0000000-0000-4000-8000-00000000f001', :'demo_user', 'Démo — Patrimoine', 'CHF');

insert into accounts (id, user_id, portfolio_id, name, institution_label, display_order)
values
  ('d0000000-0000-4000-8000-00000000a001', :'demo_user', 'd0000000-0000-4000-8000-00000000f001', 'Démo Actions', 'Swissquote', 1),
  ('d0000000-0000-4000-8000-00000000a002', :'demo_user', 'd0000000-0000-4000-8000-00000000f001', 'Démo Options', 'IBKR', 2),
  ('d0000000-0000-4000-8000-00000000a003', :'demo_user', 'd0000000-0000-4000-8000-00000000f001', 'Démo Fonds', 'BCGE', 3);

insert into positions (
  id, user_id, portfolio_id, account_id, instrument_id,
  quantity, average_cost, cost_currency, opened_on
)
values
  ('d0000000-0000-4000-8000-00000000b001', :'demo_user', 'd0000000-0000-4000-8000-00000000f001',
   'd0000000-0000-4000-8000-00000000a001', 'd0000000-0000-4000-8000-000000000001',
   25, 142.500000000000, 'CHF', '2025-03-14'),
  ('d0000000-0000-4000-8000-00000000b002', :'demo_user', 'd0000000-0000-4000-8000-00000000f001',
   'd0000000-0000-4000-8000-00000000a001', 'd0000000-0000-4000-8000-000000000002',
   40, 88.250000000000, 'USD', '2025-06-02'),
  ('d0000000-0000-4000-8000-00000000b003', :'demo_user', 'd0000000-0000-4000-8000-00000000f001',
   'd0000000-0000-4000-8000-00000000a001', 'd0000000-0000-4000-8000-000000000003',
   12, 310.000000000000, 'USD', '2025-01-20'),
  ('d0000000-0000-4000-8000-00000000b004', :'demo_user', 'd0000000-0000-4000-8000-00000000f001',
   'd0000000-0000-4000-8000-00000000a003', 'd0000000-0000-4000-8000-000000000004',
   150.750000000000, 102.400000000000, 'CHF', '2024-11-05'),
  ('d0000000-0000-4000-8000-00000000b005', :'demo_user', 'd0000000-0000-4000-8000-00000000f001',
   'd0000000-0000-4000-8000-00000000a002', 'd0000000-0000-4000-8000-000000000006',
   2, 4.750000000000, 'USD', '2026-02-10'),
  ('d0000000-0000-4000-8000-00000000b006', :'demo_user', 'd0000000-0000-4000-8000-00000000f001',
   'd0000000-0000-4000-8000-00000000a001', 'd0000000-0000-4000-8000-000000000005',
   5000, 1.000000000000, 'CHF', '2024-01-01');

/*
 * Aucun cours n'est inséré ici.
 *
 * Un prix de démonstration en base serait indiscernable d'un prix réel dans
 * l'interface. Les tests qui ont besoin d'une valorisation insèrent leurs
 * propres quotes, explicitement marquées, dans leur propre transaction.
 */

commit;
