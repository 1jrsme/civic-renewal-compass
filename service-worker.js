const CACHE = "civic-renewal-atlas-v45";
const SHELL = [
  "./",
  "./index.html",
  "./compass.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./src/app.js",
  "./src/downloads.js",
  "./src/compass-window.js",
  "./src/compass-model.js",
  "./src/bezel-model.js",
  "./src/iss-map.js",
  "./src/time-zone.js",
  "./src/data.js",
  "./src/reference-locations.js",
  "./src/offline-references.js",
  "./src/program-directory.js",
  "./src/community-programs.js",
  "./icons/atlas.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.endsWith(".zip")
  ) return;
  if (!SHELL.includes(url.pathname === "/" ? "./" : `.${url.pathname}`)) return;
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached || fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }),
    ),
  );
});
