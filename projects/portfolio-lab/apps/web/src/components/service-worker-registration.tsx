"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker côté client.
 *
 * L'enregistrement est silencieux : un échec ne doit jamais dégrader
 * l'application, qui reste parfaitement utilisable en ligne sans lui.
 */
export function ServiceWorkerRegistration(): null {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    if (process.env.NODE_ENV !== "production") {
      return;
    }
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Silencieux par conception : voir le commentaire ci-dessus.
    });
  }, []);

  return null;
}
