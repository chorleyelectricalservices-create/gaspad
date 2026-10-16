// Offline-first service worker. Bump VERSION whenever any file changes.
const VERSION = 'gaspad-v1.1.0';
const ASSETS = ['./', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/db.js', 'js/forms.js', 'js/cp12.js', 'js/ai.js', 'js/pdf.js', 'js/refno.js', 'js/address.js', 'js/fieldvoice.js', 'js/voice.js', 'js/speak.js',
  'vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-192-maskable.png', 'icons/icon-512-maskable.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const u = new URL(req.url);
  // page + sw: network first (bypassing HTTP cache) so updates land; cache when offline
  if (req.mode === 'navigate' || u.pathname.endsWith('/sw.js') || u.pathname.endsWith('/index.html')) {
    e.respondWith(fetch(req, { cache: 'no-store' }).then(r => { if (r.ok) caches.open(VERSION).then(c => c.put(req, r.clone())); return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(h => h || caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
