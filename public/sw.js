/* ═══════════════════════════════════════════════
   LoadLess — Service Worker v4.2
   Stratégie cache-first pour la coquille HTML +
   network-first pour les calls Supabase (jamais cachés).
   ═══════════════════════════════════════════════ */

const CACHE_VERSION = 'loadless-v5.4';
const SHELL_CACHE  = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Fichiers de la coquille (toujours en cache)
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-192.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png'
];

// ── Install : cache la coquille ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS).catch(err => {
        // Si une icône manque, on continue (best-effort)
        console.warn('[SW] Some shell assets failed to cache:', err);
      }))
      .then(() => self.skipWaiting())
  );
});

// ── Activate : nettoie les vieux caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => !k.startsWith(CACHE_VERSION))
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch : stratégies différenciées ──
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignorer les requêtes non-GET
  if (req.method !== 'GET') return;

  // ✅ Supabase : toujours network, jamais cache (données dynamiques + auth)
  if (url.hostname.includes('supabase.co')) {
    return; // laisse le navigateur gérer
  }

  // ✅ CDN externes (jsdelivr) : cache-first avec mise à jour en arrière-plan
  if (url.hostname.includes('jsdelivr.net') || url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.match(req).then(cached => {
        const network = fetch(req).then(res => {
          if (res.ok) {
            caches.open(RUNTIME_CACHE).then(c => c.put(req, res.clone()));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // ✅ Navigation (HTML) : network-first avec fallback cache + page offline
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then(res => {
          // Cache la dernière version HTML reçue
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then(c => c.put('/index.html', copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req)
            .then(r => r || caches.match('/index.html'))
            .then(r => r || caches.match('/offline.html'))
        )
    );
    return;
  }

  // ✅ Assets statiques : cache-first
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res.ok && res.status === 200 && req.url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('/offline.html'));
    })
  );
});

// ── Notification de mise à jour (le client gère le toast) ──
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
