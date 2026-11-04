// Bondímetro v2 — service worker. Solo guarda la "cáscara" (HTML, íconos, Leaflet).
// NUNCA cachea respuestas de API, proxy, /oba ni teselas: eso va siempre a la red,
// así sin señal la app sabe que no tiene datos en vivo en vez de mostrar datos viejos.
// Ojo: v1 y v2 comparten origen. El SW de v1 borra al activarse todas las cachés que no son
// la suya; acá solo borramos las nuestras (prefijo PREFIX) para no romper a v1.
const PREFIX = "bondimetro2-shell-";
const CACHE = PREFIX + "7";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png",
  "icon-maskable-192.png", "icon-maskable-512.png", "apple-touch-icon.png", "vendor/leaflet.css", "vendor/leaflet.js", "maprot.js", "srvmodel.js"];
const SHELL_PATHS = new Set(SHELL.map(p => new URL(p, self.registration.scope).pathname));

self.addEventListener("install", e => {
  // Sin .catch mudo: si falta un archivo, la instalación falla y se nota (y se reintenta).
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin !== location.origin) return;                      // API directa, teselas: red
  const isNav = req.mode === "navigate";
  if (!isNav && !SHELL_PATHS.has(u.pathname)) return;           // proxy, /oba, todo lo demás: red
  // Red primero (toma actualizaciones); si no hay red, la copia guardada.
  e.respondWith(fetch(req).then(r => {
    if (r.ok && r.type === "basic" && SHELL_PATHS.has(u.pathname)) {
      const cp = r.clone(); caches.open(CACHE).then(c => c.put(isNav ? new URL("index.html", self.registration.scope).href : req, cp));
    }
    return r;
  }).catch(() => isNav
    ? caches.match(new URL("index.html", self.registration.scope).href)
    : caches.match(req)));
});
