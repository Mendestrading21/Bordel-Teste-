"use client";

import { QUOTE_FRESHNESS_LABEL, type QuoteFreshness } from "@portfolio-lab/domain";

import type { LiveConnectionState } from "@/lib/live/client-protocol";

/**
 * Indicateur d'état du canal temps réel.
 *
 * Affiché en permanence dès qu'un canal est attendu. Une application dont le
 * flux est coupé et qui continue d'afficher les derniers cours sans le dire ment
 * par omission — c'est précisément ce que ce composant empêche.
 */
export function LiveIndicator({
  state,
}: Readonly<{ state: LiveConnectionState }>): React.JSX.Element | null {
  switch (state.status) {
    case "disabled":
      return (
        <p className="text-xs text-secondary" role="status">
          {state.reason}
        </p>
      );

    case "connecting":
      return (
        <p className="text-xs text-secondary" role="status">
          Connexion au flux de cours…
        </p>
      );

    case "open": {
      const freshness = state.bestFreshness as QuoteFreshness;
      return (
        <p className="text-xs text-secondary" role="status">
          Flux actif via <span className="text-primary">{state.provider}</span> —{" "}
          {QUOTE_FRESHNESS_LABEL[freshness] ?? state.bestFreshness} au mieux
        </p>
      );
    }

    case "reconnecting":
      return (
        <p className="text-xs text-warning" role="status">
          Reconnexion au flux de cours… (tentative {state.attempt})
        </p>
      );

    case "failed":
      return (
        <p className="text-xs text-negative" role="alert">
          {state.reason}
        </p>
      );
  }
}
