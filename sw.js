/* ForeWeather service worker: app shell cache-first, weather data network-first */
const SHELL = "foreweather-shell-v2";
const DATA = "foreweather-data-v1";
const SHELL_ASSETS = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return; // live data — never cached
  if (url.hostname.endsWith("open-meteo.com")) {
    // weather data: fresh if possible, cached as offline fallback
    e.respondWith(
      fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(DATA).then(c => c.put(e.request, copy));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  if (e.request.mode === "navigate") {
    // page loads: network-first so updates arrive immediately, cache as offline fallback
    e.respondWith(
      fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(SHELL).then(c => c.put(e.request, copy));
        return r;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match("/index.html")))
    );
    return;
  }
  // other assets: cache-first
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
