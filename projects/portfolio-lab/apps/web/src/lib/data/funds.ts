import "server-only";

import { createDatabase, loadDatabaseConfig, type Database } from "@portfolio-lab/database";
import {
  presentNav,
  type NavFrequency,
  type NavPresentation,
  type NavRecord,
} from "@portfolio-lab/market-data";
import { toDecimalString, type CurrencyCode } from "@portfolio-lab/domain";

import { resolveDataMode } from "./mode";
import { currentUserId } from "@/lib/auth/owner";

/**
 * Lecture des fonds et de leurs NAV.
 *
 * Séparé du chargement général du portefeuille : un fonds a des attributs
 * qu'aucun titre coté ne possède — classe de parts, fréquence de publication,
 * date de valeur — et les fondre dans la vue générale les rendrait invisibles.
 */

let cachedDatabase: Database | null = null;

function database(): Database {
  cachedDatabase ??= createDatabase(loadDatabaseConfig());
  return cachedDatabase;
}

export type FundView = {
  readonly instrumentId: string;
  readonly name: string;
  readonly isin: string | null;
  readonly currency: CurrencyCode;
  readonly shareClass: string | null;
  readonly isAccumulating: boolean | null;
  readonly frequency: NavFrequency;
  readonly domicileCountry: string | null;
  /** `null` si aucune NAV n'a jamais été publiée pour ce fonds. */
  readonly nav: NavPresentation | null;
  /** Nombre de NAV connues, indicateur de profondeur d'historique. */
  readonly navCount: number;
};

/**
 * Requête unique récupérant chaque fonds avec sa NAV la plus récente.
 *
 * `distinct on` évite une sous-requête corrélée par fonds : le portefeuille en
 * compte peu, mais chaque lecture passe par les politiques RLS, dont le coût se
 * multiplie avec le nombre de requêtes.
 */
const FUNDS_QUERY = `
  select
    i.id                              as instrument_id,
    i.name,
    i.primary_currency                as currency,
    fd.share_class,
    fd.is_accumulating,
    fd.nav_frequency::text            as nav_frequency,
    fd.domicile_country,
    ii.identifier_value               as isin,
    nav.nav_date::text                as nav_date,
    nav.value::text                   as nav_value,
    nav.currency                      as nav_currency,
    nav.provider                      as nav_provider,
    nav.retrieved_at                  as nav_retrieved_at,
    (
      select count(*) from fund_nav_history h where h.instrument_id = i.id
    )::text                           as nav_count
  from instruments i
  left join fund_details fd on fd.instrument_id = i.id
  left join instrument_identifiers ii
    on ii.instrument_id = i.id and ii.identifier_type = 'ISIN'
  left join lateral (
    select h.* from fund_nav_history h
    where h.instrument_id = i.id
    order by h.nav_date desc
    limit 1
  ) nav on true
  where i.asset_type = 'MUTUAL_FUND' and i.is_active
  order by i.name asc
`;

type FundRow = {
  instrument_id: string;
  name: string;
  currency: string;
  share_class: string | null;
  is_accumulating: boolean | null;
  nav_frequency: string | null;
  domicile_country: string | null;
  isin: string | null;
  nav_date: string | null;
  nav_value: string | null;
  nav_currency: string | null;
  nav_provider: string | null;
  nav_retrieved_at: Date | null;
  nav_count: string;
};

export async function listFunds(now: Date = new Date()): Promise<readonly FundView[]> {
  const mode = resolveDataMode();
  const userId = await currentUserId(mode);
  if (userId === null) {
    return [];
  }

  return database().withUser(userId, async (client) => {
    const { rows } = await client.query<FundRow>(FUNDS_QUERY);

    return rows.map((row): FundView => {
      const frequency = (row.nav_frequency ?? "UNKNOWN") as NavFrequency;

      /*
       * Une NAV n'est construite que si **toutes** ses composantes sont
       * présentes. Une valeur sans date, ou une date sans valeur, ne permet pas
       * de juger la fraîcheur — l'afficher partiellement laisserait croire à une
       * donnée exploitable.
       */
      const nav =
        row.nav_date !== null && row.nav_value !== null && row.nav_currency !== null
          ? presentNav(
              {
                instrumentId: row.instrument_id,
                isin: row.isin ?? "",
                value: toDecimalString(row.nav_value),
                currency: row.nav_currency as CurrencyCode,
                navDate: row.nav_date,
                provider: row.nav_provider ?? "inconnu",
                retrievedAt: (row.nav_retrieved_at ?? new Date(0)).toISOString(),
                frequency,
                shareClass: row.share_class,
              } satisfies NavRecord,
              now,
            )
          : null;

      return {
        instrumentId: row.instrument_id,
        name: row.name,
        isin: row.isin,
        currency: row.currency as CurrencyCode,
        shareClass: row.share_class,
        isAccumulating: row.is_accumulating,
        frequency,
        domicileCountry: row.domicile_country,
        nav,
        navCount: Number(row.nav_count),
      };
    });
  });
}
