/* Service worker : met l'application en cache pour qu'elle fonctionne sans Internet.
 * Il ne touche jamais aux données (elles sont dans IndexedDB).
 * À CHAQUE MISE À JOUR de l'application, changez le numéro de VERSION ci-dessous. */
const VERSION = 'congelateurs-v1.0.1';
const FICHIERS = [
  './', 'index.html', 'manifest.webmanifest', 'styles.css',
  'db.js', 'stock.js', 'sauvegarde.js', 'app.js',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((enCache) => enCache || fetch(e.request).catch(() => caches.match('index.html')))
  );
});
