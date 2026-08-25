#!/bin/sh
# Recrée une base « première prise en main » : un portefeuille, un compte,
# aucun instrument. C'est l'état de toute installation réelle, et celui que
# le parcours tests/auth/premiere-prise-en-main.spec.ts exige.
#
# Le parcours crée des instruments : le relancer sans remise à zéro
# vérifierait un état qui n'est plus celui d'une base neuve.
set -e
URL="${1:-postgresql://postgres@localhost:5433/postgres?host=/tmp}"
DB="${2:-pl_fresh}"
OWNER="${PORTFOLIO_LAB_OWNER_ID:-7c9e6679-7425-40de-944b-e07fc1f90ae7}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

psql "$URL" -q -c "drop database if exists $DB;" -c "create database $DB;"
TARGET="$(printf '%s' "$URL" | sed "s|/postgres?|/$DB?|")"
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql "$TARGET" -q -v ON_ERROR_STOP=1 -f "$f" > /dev/null
done
psql "$TARGET" -q \
  -c "insert into portfolios (user_id, name, base_currency) values ('$OWNER','Mon patrimoine','CHF');" \
  -c "insert into accounts (user_id, portfolio_id, name, display_order)
      select '$OWNER', id, 'Compte principal', 0 from portfolios where user_id='$OWNER';"
psql "$TARGET" -At -c "select (select count(*) from instruments)||' instrument dans la base neuve';"
