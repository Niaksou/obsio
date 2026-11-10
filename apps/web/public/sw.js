// Service worker d'Obsio : l'application s'ouvre sans réseau (sur un chantier, en sous-sol).
// Les pages reviennent à index.html mis en cache ; les fichiers de /assets/ portent une empreinte
// dans leur nom, on les garde donc tels quels. L'API et le stockage ne passent pas par ici :
// les preuves hors ligne sont gérées par la file d'envoi (IndexedDB) de l'application.
// Il affiche aussi les notifications envoyées par l'API (Web Push).

const CACHE = 'obsio-v2';
const SHELL = '/index.html';
// En développement (`sw.js?mode=push`) : notifications seulement, sans cache, car Vite sert
// les fichiers à la volée.
const PUSH_ONLY = new URL(self.location.href).searchParams.get('mode') === 'push';

self.addEventListener('install', (event) => {
  if (PUSH_ONLY) {
    self.skipWaiting();
    return;
  }
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([SHELL, '/favicon.svg', '/icon.svg'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (PUSH_ONLY) return;
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Réseau d'abord, pour avoir la dernière version ; le cache seulement sans réseau.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(SHELL, copy));
          }
          return response;
        })
        .catch(() => caches.match(SHELL)),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

// --- Notifications

/** Chemin dans l'application seulement : une notification n'ouvre jamais un autre site. */
function appPath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Obsio';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      lang: 'fr',
      data: { url: appPath(data.url) },
    }),
  );
});

// Toucher la notification : l'application déjà ouverte va sur la page, sinon elle s'ouvre.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(
    appPath(event.notification.data && event.notification.data.url),
    self.location.origin,
  );
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === url.origin);
      if (open) return open.focus().then((client) => client.navigate(url.href));
      return self.clients.openWindow(url.href);
    }),
  );
});
