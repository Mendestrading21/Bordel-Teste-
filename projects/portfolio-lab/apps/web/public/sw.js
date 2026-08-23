/*
 * Service worker — stratégie de cache du Lot 09.
 *
 * Deux règles gouvernent tout ce fichier :
 *
 * 1. **Le réseau d'abord pour les pages.** Une page en cache est un patrimoine
 *    daté ; la servir alors que le réseau répond ferait lire des chiffres
 *    périmés sans raison. Le cache n'intervient qu'en cas d'échec réseau, et le
 *    bandeau hors ligne de l'application annonce alors l'âge de la page.
 *
 * 2. **Aucune donnée n'est jamais servie depuis le cache sans que la page le
 *    dise.** Les réponses d'API — jeton de canal, export — ne sont pas mises en
 *    cache du tout : un jeton rejoué ou une sauvegarde périmée seraient pires
 *    qu'une erreur franche.
 */

const VERSION = "v2";
const SHELL_CACHE = `portfolio-lab-shell-${VERSION}`;
const PAGE_CACHE = `portfolio-lab-pages-${VERSION}`;
const ASSET_CACHE = `portfolio-lab-assets-${VERSION}`;

const KNOWN_CACHES = [SHELL_CACHE, PAGE_CACHE, ASSET_CACHE];

/** Page servie quand aucune version en cache de la route demandée n'existe. */
const OFFLINE_FALLBACK = "/hors-ligne";

const SHELL_ASSETS = [
  OFFLINE_FALLBACK,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

/**
 * Nombre de pages conservées.
 *
 * L'application compte cinq écrans principaux ; la marge couvre les fiches de
 * position. Sans borne, le cache grossirait indéfiniment sur l'appareil de
 * l'utilisateur.
 */
const MAX_CACHED_PAGES = 20;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
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
        Promise.all(
          keys.filter((key) => !KNOWN_CACHES.includes(key)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Limite la taille d'un cache en supprimant les entrées les plus anciennes. */
async function trim(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - maxEntries))) {
    await cache.delete(key);
  }
}

/**
 * Pages : réseau d'abord, cache en secours.
 *
 * La réponse réseau est recopiée dans le cache **avant** d'être rendue, pour
 * que la prochaine coupure dispose de la version la plus récente.
 */
async function handleNavigation(request) {
  try {
    const response = await fetch(request);

    // Seules les réponses complètes sont mises en cache : une redirection ou
    // une erreur servie plus tard depuis le cache induirait en erreur.
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(PAGE_CACHE);
      await cache.put(request, response.clone());
      void trim(PAGE_CACHE, MAX_CACHED_PAGES);
    }

    return response;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) {
      return cached;
    }

    const fallback = await caches.match(OFFLINE_FALLBACK);
    return (
      fallback ??
      new Response("Hors ligne, et aucune version de cette page n'a encore été consultée.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      })
    );
  }
}

/**
 * Ressources statiques : cache d'abord, révalidation en arrière-plan.
 *
 * Les fichiers construits par Next portent une empreinte dans leur nom : une
 * URL donnée ne change jamais de contenu, et les servir depuis le cache ne peut
 * pas produire d'incohérence.
 */
async function handleAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        void cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached ?? network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Seules les requêtes de cette origine sont interceptées.
  if (url.origin !== self.location.origin) {
    return;
  }

  /*
   * Les routes d'API ne sont jamais mises en cache.
   *
   * `/api/live-token` renvoie un jeton nominatif et daté ; `/api/export` une
   * sauvegarde complète du patrimoine. Un cache les rendrait rejouables, et
   * une sauvegarde périmée servie silencieusement serait pire qu'un échec.
   */
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(handleAsset(request));
  }
});
