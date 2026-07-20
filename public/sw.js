// Service worker minimo de Rogue: habilita la instalacion como app y da un
// fallback offline basico (cache "network-first" para navegaciones).
const CACHE = "rogue-v4";
const OFFLINE_URLS = [
  "/app",
  "/app/rutinas",
  "/app/biblioteca",
  "/app/cardio",
  "/app/comidas",
  "/app/perfil",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_URLS)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Nunca interceptar peticiones a otro origen (Supabase, etc.): si se
  // cachean, se sirven respuestas obsoletas (datos de otro usuario o
  // desactualizados tras guardar cambios) en vez de ir siempre a red.
  if (url.origin !== self.location.origin) return;

  // Navegaciones: network-first, cae a cache si no hay red.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/app"))),
    );
    return;
  }

  // Solo los assets estaticos versionados de Next (nombre con hash, nunca
  // cambian de contenido bajo la misma URL) son cache-first seguros. Todo lo
  // demas del propio origen (fetches RSC de navegacion entre paginas, etc.)
  // se deja pasar a red sin interceptar para no servir contenido obsoleto.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return res;
          }),
      ),
    );
  }
});
