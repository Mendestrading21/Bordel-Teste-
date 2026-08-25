"use client";

import type { RefreshState } from "@/lib/live/refresh-policy";

/**
 * État de la campagne de rafraîchissement des cours.
 *
 * Affiché en permanence dès qu'un rafraîchissement est attendu. Une application
 * dont la source de cours est muette et qui continue d'afficher les derniers
 * chiffres sans le dire ment par omission — c'est exactement ce que ce
 * composant empêche.
 *
 * Le nombre d'instruments **non cotés** est énoncé, jamais tu : c'est
 * précisément l'information qu'un écran a tendance à masquer, et celle dont
 * dépend la confiance dans le total affiché.
 */
export function LiveRefreshStatus({
  state,
}: Readonly<{ state: RefreshState }>): React.JSX.Element | null {
  switch (state.status) {
    case "idle":
      return null;

    case "refreshing":
      return (
        <p className="mt-1 text-xs text-tertiary" role="status">
          Rafraîchissement des cours…
        </p>
      );

    case "disabled":
      return (
        <p className="mt-1 text-xs text-tertiary" role="status" data-pl-live="disabled">
          {state.reason}
        </p>
      );

    case "failed":
      return (
        <p className="mt-1 text-xs text-warning" role="status" data-pl-live="failed">
          {state.reason}
        </p>
      );

    case "ok": {
      const time = new Date(state.refreshedAt).toLocaleTimeString("fr-CH", {
        timeZone: "Europe/Zurich",
        hour: "2-digit",
        minute: "2-digit",
      });
      const source = state.providers.length === 0 ? null : state.providers.join(", ");

      return (
        <p className="mt-1 text-xs text-tertiary" role="status" data-pl-live="ok">
          {state.quoted === 0
            ? `Aucun cours obtenu à ${time}`
            : `${state.quoted} cours à jour à ${time}`}
          {source === null ? "" : ` — source : ${source}`}
          {state.unquoted.length === 0
            ? ""
            : ` — ${state.unquoted.length} sans cours (${state.unquoted[0]?.reason ?? ""})`}
        </p>
      );
    }
  }
}
