-- PortfolioLab — saisie d'instruments par l'utilisateur.
--
-- Le référentiel `instruments` n'avait qu'une politique de lecture. Sur une
-- base neuve — le cas de toute installation réelle — la table est vide, le
-- sélecteur du formulaire d'ajout ne propose rien, et **aucune position ne peut
-- être saisie**. L'application était donc inutilisable dès la première prise en
-- main, sans qu'aucune erreur ne l'explique : le champ était simplement vide.
--
-- Ces politiques ouvrent l'écriture au seul utilisateur authentifié.
--
-- Pas de politique de suppression, et c'est délibéré : un instrument est une
-- donnée de référence partagée par toutes les positions qui le citent. Le
-- supprimer casserait une position existante, ou serait refusé par la clé
-- étrangère au moment le moins pratique. Un instrument devenu inutile est
-- désactivé par `is_active`, jamais effacé.

create policy instruments_insert on instruments
  for insert with check (current_user_id() is not null);

create policy instruments_update on instruments
  for update using (current_user_id() is not null)
  with check (current_user_id() is not null);

create policy instrument_identifiers_insert on instrument_identifiers
  for insert with check (current_user_id() is not null);

-- Un identifiant erroné se corrige en le supprimant : contrairement à
-- l'instrument, il n'est référencé par rien et sa disparition ne casse aucune
-- position. Elle prive seulement la ligne de cours automatiques, ce que
-- l'écran annonce déjà.
create policy instrument_identifiers_delete on instrument_identifiers
  for delete using (current_user_id() is not null);

create policy option_contracts_insert on option_contracts
  for insert with check (current_user_id() is not null);
