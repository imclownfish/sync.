const CACHE = "sync-shell-v4";
const SHELL = ["./", "./index.html", "./list.html", "./styles.css", "./enhancements.css", "./auth.css", "./favicon.svg", "./manifest.webmanifest", "./app.js?v=9", "./firebase.js?v=4", "./interactions.js?v=1", "./list.js?v=2", "./progress.js?v=3", "./pwa.js?v=4"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === "navigate" ? caches.match("./index.html") : Response.error()))));
});
