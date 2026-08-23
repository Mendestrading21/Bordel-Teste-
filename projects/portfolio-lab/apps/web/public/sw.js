/*
 * Service worker minimal du Lot 01 — conditions d'installabilité PWA.
 *
 * Il ne fait que précacher la coquille applicative et servir une réponse hors
 * ligne lisible. La stratégie de cache complète (dernier état connu, données de
 * marché, révalidation) est le périmètre du Lot 09 ; l'implémenter ici
 * produirait un cache dont on ne saurait pas encore invalider le contenu.
 */
const CACHE_VERSION = "portfolio-lab-shell-v1";

const SHELL_ASSETS = [
  "/",
  "/positions",
  "/ajouter",
  "/analyse",
  "/reglages",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // `addAll` échoue en bloc si une seule ressource manque ; on tolère les
      // absences pour ne jamais empêcher l'installation du service worker.
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((asset) => cache.add(asset))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Seules les navigations sont interceptées au Lot 01. Les requêtes de données
  // ne doivent surtout pas être servies depuis un cache tant que la gestion de
  // la fraîcheur n'est pas en place : une valeur périmée servie silencieusement
  // est exactement ce que le produit interdit.
  if (request.method !== "GET" || request.mode !== "navigate") {
    return;
  }

  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(request);
      return cached ?? caches.match("/").then((root) => root ?? Response.error());
    }),
  );
});
