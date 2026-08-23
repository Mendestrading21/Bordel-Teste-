"use client";

import { useEffect, useState } from "react";

/**
 * Bandeau « hors ligne ».
 *
 * C'est la pièce qui rend le mode hors ligne honnête. Le service worker sert
 * la dernière page connue quand le réseau manque ; sans ce bandeau,
 * l'utilisateur lirait un patrimoine daté en croyant le voir à l'instant.
 *
 * L'âge affiché vient de l'horodatage inscrit par le serveur dans la page
 * elle-même. Le lire depuis le HTML servi est le seul moyen fiable : une page
 * sortie du cache a été rendue à un moment que le client ne connaît pas
 * autrement.
 */

/** Formate un âge en texte lisible, sans jamais prétendre à la minute près. */
export function describeAge(renderedAt: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - renderedAt.getTime()) / 60_000);

  if (minutes < 1) {
    return "il y a moins d'une minute";
  }
  if (minutes < 60) {
    return `il y a ${minutes} minute${minutes > 1 ? "s" : ""}`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `il y a ${hours} heure${hours > 1 ? "s" : ""}`;
  }

  const days = Math.floor(hours / 24);
  return `il y a ${days} jour${days > 1 ? "s" : ""}`;
}

export function OfflineNotice({
  renderedAt,
}: Readonly<{ renderedAt: string }>): React.JSX.Element | null {
  /*
   * L'état initial est « en ligne », y compris au rendu serveur.
   *
   * `navigator.onLine` n'existe pas sur le serveur, et supposer « hors ligne »
   * ferait clignoter le bandeau à chaque chargement normal.
   */
  const [offline, setOffline] = useState(false);
  const [age, setAge] = useState<string | null>(null);

  useEffect(() => {
    function refresh(): void {
      /*
       * `navigator.onLine` ne prouve pas qu'Internet fonctionne — seulement
       * qu'une interface réseau existe. Un faux « en ligne » est sans
       * conséquence ici : la page reste celle du serveur. C'est le faux
       * « hors ligne » qu'il faudrait craindre, et le navigateur ne le produit
       * pas.
       */
      const isOffline = !navigator.onLine;
      setOffline(isOffline);
      setAge(isOffline ? describeAge(new Date(renderedAt), new Date()) : null);
    }

    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);

    // L'âge vieillit pendant que la page reste ouverte : le rafraîchir évite
    // d'annoncer « il y a 2 minutes » une heure plus tard.
    const timer = window.setInterval(refresh, 30_000);

    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.clearInterval(timer);
    };
  }, [renderedAt]);

  if (!offline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 rounded-token-md border border-warning/50 bg-surface px-4 py-3"
    >
      <p className="text-xs font-semibold tracking-wide text-warning uppercase">Hors ligne</p>
      <p className="mt-1 text-sm text-secondary">
        Les chiffres affichés proviennent de votre dernière connexion
        {age === null ? "" : `, ${age}`}. Aucun cours n&apos;a été récupéré depuis, et aucune
        modification ne peut être enregistrée tant que la connexion n&apos;est pas rétablie.
      </p>
    </div>
  );
}
