"use client";

import { useState } from "react";

import type { CurrencyCode } from "@portfolio-lab/domain";

import type { HistoryPeriod } from "@/lib/history-periods";

import { Money, Percent } from "./money";
import { WealthChart } from "./wealth-chart";
import { Card, cx } from "./ui";

/**
 * Courbe du patrimoine et sa fenêtre de lecture.
 *
 * Les fenêtres sont **calculées sur le serveur** et livrées entières : le
 * moteur décimal n'a rien à faire dans le navigateur, et rejouer les bornes
 * côté client ouvrirait la porte à deux résultats différents pour la même
 * question. Le composant ne fait que choisir laquelle montrer.
 *
 * Aucune fenêtre n'est proposée si elle ne contient pas au moins deux points
 * réellement enregistrés : « 1 mois » ne reconstitue jamais une valeur d'il y a
 * trente jours.
 */
export function WealthHistory({
  periods,
  currency,
}: Readonly<{
  periods: readonly HistoryPeriod[];
  currency: CurrencyCode;
}>): React.JSX.Element | null {
  /*
   * La fenêtre la plus courte disponible d'abord : la question quotidienne est
   * « qu'est-ce qui a bougé récemment », pas « d'où je viens ».
   */
  const [index, setIndex] = useState(0);
  const active = periods[index] ?? periods[0];
  if (active === undefined) return null;

  const first = active.points[0];
  const last = active.points[active.points.length - 1];

  return (
    <Card as="section" padding="md" aria-labelledby="evolution">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="evolution" className="text-xs tracking-wide text-tertiary uppercase">
          Évolution
        </h2>

        {periods.length < 2 ? null : (
          <div role="group" aria-label="Période affichée" className="flex gap-1">
            {periods.map((period, position) => {
              const selected = position === index;
              return (
                <button
                  key={period.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setIndex(position)}
                  className={cx(
                    // Cible tactile réglementaire : ces onglets étaient à 34 px,
                    // sous le minimum de 44 px, et se ratent au pouce.
                    "min-h-[var(--pl-touch-target)] rounded-token-pill px-3 text-xs transition-colors",
                    selected ? "bg-accent/15 text-accent" : "text-tertiary hover:text-primary",
                  )}
                >
                  {period.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-2xl font-semibold">
          <Money value={active.change.absolute} currency={currency} colored bare />
        </p>
        <p className="text-sm">
          <Percent value={active.change.relative} />
        </p>
      </div>

      {/*
       * Les dates encadrantes sont écrites, pas seulement dessinées sous l'axe :
       * la variation porte sur le premier et le dernier point **enregistrés**
       * dans la fenêtre, ce qui n'est pas la même chose qu'une variation sur
       * trente jours calendaires.
       */}
      <p className="mt-1 text-xs text-tertiary">
        {first === undefined || last === undefined
          ? null
          : `Entre les points du ${first.date} et du ${last.date}, en ${currency}.`}
      </p>

      <WealthChart history={active.points} bounds={active.bounds} currency={currency} />
    </Card>
  );
}
