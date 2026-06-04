const CACHE_NAME = 'cloud189-cache-v3';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/css/base.css',
  '/css/folder-tree.css',
  '/css/modal.css',
  '/css/card-view.css',
  '/css/components.css',
  '/css/table-view.css',
  '/css/table.css',
  '/css/tabs.css',
  '/css/theme.css',
  '/css/logs.css',
  '/css/loading.css',
  '/css/message.css',
  '/css/floating-btn.css',
  '/css/cloudsaver.css',
  '/css/chat.css',
  '/css/ui-themes.css',
  '/js/main.js',
  '/js/theme.js',
  '/js/message.js',
  '/js/loading.js',
  '/js/tabs.js',
  '/js/tasks.js',
  '/js/accounts.js',
  '/js/settings.js',
  '/js/edit-task.js',
  '/js/folderSelector.js',
  '/js/logs.js',
  '/js/media.js',
  '/js/chat.js',
  '/js/strm.js',
  '/js/customPush.js',
  '/favicon/favicon-96x96.png',
  '/favicon/favicon.svg',
  '/favicon/favicon.ico',
  '/favicon/apple-touch-icon.png',
  '/favicon/web-app-manifest-192x192.png',
  '/favicon/web-app-manifest-512x512.png',
  '/favicon/site.webmanifest',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // TMDB 图片 — Cache First
  if (url.hostname === 'image.tmdb.org') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return resp;
        });
      })
    );
    return;
  }

  // TMDB API — Stale-While-Revalidate
  if (url.pathname.startsWith('/api/tmdb/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return resp;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 静态资源 — Cache First
  if (
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/favicon/')
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
    return;
  }

  // 导航请求 — 网络优先，失败时用缓存兜底
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 其他请求 — Network Only
  event.respondWith(fetch(event.request));
});
