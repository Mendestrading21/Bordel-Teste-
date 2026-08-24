"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  ASSET_TYPE_LABEL,
  QUOTE_FRESHNESS_LABEL,
  type AssetType,
  type CurrencyCode,
  type DecimalString,
} from "@portfolio-lab/domain";
import type { QuoteFreshness } from "@portfolio-lab/domain";

import { FreshnessBadge } from "./freshness-badge";
import { InstrumentAvatar } from "./instrument-avatar";
import { Money, Percent, Unavailable } from "./money";
import { Card, cx } from "./ui";

/**
 * Ligne de position, réduite à ce que la liste affiche.
 *
 * Volontairement plate et sérialisable : ce composant est rendu côté client
 * pour la recherche, et n'a aucune raison de recevoir le modèle complet.
 */
export type PositionRow = {
  readonly positionId: string;
  readonly instrumentName: string;
  readonly symbol: string | null;
  readonly assetType: AssetType;
  readonly accountName: string;
  readonly marketValueBase: DecimalString | null;
  readonly baseCurrency: CurrencyCode;
  readonly unrealizedPnlPct: DecimalString | null;
  readonly freshness: QuoteFreshness;
  readonly asOf: string | null;
  readonly provider: string | null;
  readonly unavailableReason: string | null;
};

/**
 * Pastille d'identité en tête de ligne.
 *
 * Affiche le symbole court quand il existe, l'émoji de classe sinon. Le
 * symbole est tronqué à cinq caractères : au-delà, la pastille s'élargit et
 * la colonne des montants se décale d'une ligne à l'autre.
 *
 * Purement visuel, donc `aria-hidden` : le nom complet et la classe d'actifs
 * suivent immédiatement dans le texte de la ligne.
 */
/** Filtres proposés, dans l'ordre de l'architecture d'information. */
const FILTERS: readonly { key: AssetType | "ALL"; label: string; icon: string }[] = [
  { key: "ALL", label: "Toutes", icon: "" },
  { key: "STOCK", label: "Actions", icon: "📈" },
  { key: "ETF", label: "ETF", icon: "🧺" },
  { key: "OPTION", label: "Options", icon: "🎯" },
  { key: "MUTUAL_FUND", label: "Fonds", icon: "🏦" },
  { key: "CASH", label: "Cash", icon: "💵" },
];

/**
 * Liste des positions, avec recherche et filtres.
 *
 * Le filtrage est fait **dans le navigateur** et non par une requête : un
 * patrimoine personnel compte des dizaines de lignes, pas des milliers. Un
 * aller-retour serveur à chaque frappe serait plus lent, coûterait une requête
 * par caractère, et cesserait de fonctionner hors ligne — précisément là où la
 * liste reste consultable depuis le cache.
 *
 * Sans JavaScript, la liste complète s'affiche : c'est la dégradation
 * correcte. Seuls la recherche et les filtres disparaissent.
 */
export function PositionsList({
  rows,
  baseCurrency,
}: Readonly<{
  rows: readonly PositionRow[];
  baseCurrency: CurrencyCode;
}>): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AssetType | "ALL">("ALL");

  /**
   * `false` tant que React n'écoute pas encore.
   *
   * La liste est rendue par le serveur et reste lisible immédiatement, mais
   * la recherche et les filtres ne fonctionnent qu'une fois le composant
   * hydraté. Laisser les commandes actives dans cet intervalle donne un champ
   * qui accepte les lettres sans rien filtrer : l'utilisateur tape, rien ne
   * bouge, et sa saisie disparaît à l'hydratation.
   *
   * Un contrôle désactivé est plus honnête qu'un contrôle mort. C'est aussi ce
   * qui rend l'écran correct sans JavaScript du tout : la liste s'affiche
   * entière, et rien ne prétend pouvoir la filtrer.
   */
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  /** Classes présentes dans le portefeuille : on ne propose pas de filtre vide. */
  const present = useMemo(() => new Set(rows.map((row) => row.assetType)), [rows]);
  const filters = FILTERS.filter((entry) => entry.key === "ALL" || present.has(entry.key));

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== "ALL" && row.assetType !== filter) return false;
      if (needle === "") return true;
      /*
       * La recherche porte sur le nom, le symbole et le compte. Le compte
       * compte : « tout ce que je détiens chez Swissquote » est une question
       * aussi fréquente que « où est mon Nestlé ».
       */
      return (
        row.instrumentName.toLowerCase().includes(needle) ||
        (row.symbol ?? "").toLowerCase().includes(needle) ||
        row.accountName.toLowerCase().includes(needle)
      );
    });
  }, [rows, query, filter]);

  /**
   * Fraîcheur majoritaire des lignes visibles, si elle existe.
   *
   * Répéter le même badge sur chaque ligne ne dit rien : il cesse d'être lu, et
   * c'est justement la ligne discordante qu'il fallait voir. La fraîcheur
   * dominante est donc énoncée **une fois** au-dessus de la liste, et seules
   * les lignes qui s'en écartent gardent leur badge.
   *
   * Il faut une majorité stricte : à trois lignes en direct et trois périmées,
   * désigner un « cas normal » serait arbitraire, et les six badges valent
   * mieux qu'un résumé trompeur. Il faut aussi au moins deux lignes — sur une
   * seule, le résumé remplacerait le badge sans rien simplifier.
   */
  const commonFreshness = useMemo((): QuoteFreshness | null => {
    if (visible.length < 2) return null;

    const counts = new Map<QuoteFreshness, number>();
    for (const row of visible) counts.set(row.freshness, (counts.get(row.freshness) ?? 0) + 1);

    let best: QuoteFreshness | null = null;
    let bestCount = 0;
    for (const [freshness, count] of counts) {
      if (count > bestCount) {
        best = freshness;
        bestCount = count;
      }
    }
    return bestCount * 2 > visible.length ? best : null;
  }, [visible]);

  return (
    <>
      <label className="block">
        <span className="sr-only">Rechercher une position</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={!ready}
          placeholder="Rechercher un titre, un symbole, un compte"
          className="min-h-[var(--pl-touch-target)] w-full rounded-token-md border border-subtle bg-surface px-3 text-sm text-primary transition-opacity placeholder:text-tertiary disabled:opacity-60"
        />
      </label>

      {filters.length > 2 ? (
        <div
          role="group"
          aria-label="Filtrer par classe d'actifs"
          className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1"
        >
          {filters.map((entry) => {
            const active = filter === entry.key;
            return (
              <button
                key={entry.key}
                type="button"
                aria-pressed={active}
                disabled={!ready}
                onClick={() => setFilter(entry.key)}
                className={cx(
                  "min-h-[var(--pl-touch-target)] shrink-0 rounded-token-pill border px-3 text-sm transition-colors disabled:opacity-60",
                  active
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-subtle text-secondary hover:text-primary",
                )}
              >
                {entry.icon === "" ? null : <span aria-hidden="true">{entry.icon} </span>}
                {entry.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {/*
       * Le rappel de devise est placé ici, au-dessus de la colonne des
       * montants, et non entre le titre et la recherche : la recherche doit
       * rester la première chose atteignable, et l'unité se lit au moment où
       * l'œil arrive sur les chiffres.
       */}
      <div className="mt-3 flex items-baseline justify-between gap-3 text-xs text-tertiary">
        <p role="status">
          {visible.length} position{visible.length > 1 ? "s" : ""}
          {visible.length === rows.length ? "" : ` sur ${rows.length}`}
        </p>
        <p className="shrink-0">Montants en {baseCurrency}</p>
      </div>

      {commonFreshness === null ? null : (
        <p className="mt-1 text-xs text-tertiary" data-pl-common-freshness={commonFreshness}>
          Sauf badge contraire : {QUOTE_FRESHNESS_LABEL[commonFreshness].toLowerCase()}.
        </p>
      )}

      {visible.length === 0 ? (
        <Card padding="lg" className="mt-3 text-center">
          <p className="text-sm text-secondary">Aucune position ne correspond à cette recherche.</p>
        </Card>
      ) : (
        <ul className="mt-2 divide-y divide-subtle overflow-hidden rounded-token-lg border border-subtle bg-surface">
          {visible.map((row) => (
            <li key={row.positionId}>
              <Link
                href={`/positions/${row.positionId}`}
                className="block px-4 py-3 transition-colors hover:bg-elevated"
              >
                <div className="flex items-center gap-3">
                  <InstrumentAvatar symbol={row.symbol} assetType={row.assetType} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate font-medium text-primary">
                        {row.instrumentName}
                      </span>
                      <span className="shrink-0 text-sm">
                        {row.marketValueBase === null ? (
                          <Unavailable
                            reason={row.unavailableReason ?? "Valorisation indisponible"}
                          />
                        ) : (
                          <Money value={row.marketValueBase} currency={row.baseCurrency} bare />
                        )}
                      </span>
                    </div>

                    <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-tertiary">
                        {ASSET_TYPE_LABEL[row.assetType]} · {row.accountName}
                      </span>
                      <span className="shrink-0">
                        {row.unrealizedPnlPct === null ? null : (
                          <Percent value={row.unrealizedPnlPct} />
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/*
                 * Le badge n'apparaît que sur les lignes qui s'écartent de la
                 * fraîcheur commune, énoncée une fois au-dessus de la liste.
                 * Répété à l'identique sur vingt lignes il cesse d'être lu,
                 * et c'est justement la ligne discordante qu'il faut voir.
                 */}
                {row.freshness === commonFreshness ? null : (
                  <div className="mt-1.5 pl-12">
                    <FreshnessBadge
                      freshness={row.freshness}
                      asOf={row.asOf}
                      {...(row.provider === null ? {} : { provider: row.provider })}
                    />
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
