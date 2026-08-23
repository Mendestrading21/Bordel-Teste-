"use client";

import { useEffect } from "react";

import { describeAge } from "./offline-age";

/**
 * Veilleur de connexion.
 *
 * Il couvre la coupure qui survient **alors que la page est déjà ouverte** :
 * aucun rechargement n'a lieu, donc le service worker n'a rien à annoncer.
 *
 * C'est une amélioration, jamais la garantie. Le bandeau lui-même est rendu par
 * le serveur et révélé par CSS ; si ce composant ne s'exécute pas, une page
 * servie depuis le cache reste correctement signalée.
 */
export function OfflineWatcher({ renderedAt }: Readonly<{ renderedAt: string }>): null {
  useEffect(() => {
    const root = document.documentElement;

    function refresh(): void {
      /*
       * `navigator.onLine` ne prouve pas qu'Internet fonctionne — seulement
       * qu'une interface réseau existe. Un faux « en ligne » est sans
       * conséquence ici : la page reste celle du serveur. C'est le faux
       * « hors ligne » qu'il faudrait craindre, et le navigateur ne le produit
       * pas.
       */
      if (navigator.onLine) {
        // On ne retire l'attribut que si c'est le veilleur qui l'a posé : celui
        // inscrit par le service worker signale une page réellement issue du
        // cache, et reste vrai même si le réseau revient.
        if (root.dataset["plOffline"] === "live") {
          delete root.dataset["plOffline"];
        }
        return;
      }

      root.dataset["plOffline"] ??= "live";

      const age = document.querySelector("[data-pl-age]");
      if (age !== null) {
        age.textContent = describeAge(new Date(renderedAt), new Date());
      }
    }

    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    // L'âge vieillit pendant que la page reste ouverte.
    const timer = window.setInterval(refresh, 30_000);

    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.clearInterval(timer);
    };
  }, [renderedAt]);

  return null;
}
