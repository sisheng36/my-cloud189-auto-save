const CACHE_VERSION = 'v3.0.0-pwa';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const TMDB_API_CACHE = `tmdb-api-${CACHE_VERSION}`;
const TMDB_IMAGE_CACHE = `tmdb-image-${CACHE_VERSION}`;

const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/login.html',
    '/favicon/favicon-96x96.png',
    '/favicon/favicon.ico',
    '/favicon/favicon.svg',
    '/favicon/apple-touch-icon.png',
    '/favicon/site.webmanifest',
    '/favicon/web-app-manifest-192x192.png',
    '/favicon/web-app-manifest-512x512.png',
    '/css/base.css',
    '/css/card-view.css',
    '/css/table-view.css',
    '/css/table.css',
    '/css/tabs.css',
    '/css/theme.css',
    '/css/layout.css',
    '/css/modal.css',
    '/css/components.css',
    '/css/loading.css',
    '/css/logs.css',
    '/css/chat.css',
    '/css/folder-tree.css',
    '/css/message.css',
    '/css/floating-btn.css',
    '/css/cloudsaver.css',
    '/css/macos.css',
    '/css/ui-themes.css',
    '/css/delete-dialog.css',
    '/js/theme.js',
    '/js/tabs.js',
    '/js/tasks.js',
    '/js/main.js',
    '/js/loading.js',
    '/js/accounts.js',
    '/js/settings.js',
    '/js/logs.js',
    '/js/media.js',
    '/js/message.js',
    '/js/folderSelector.js',
    '/js/chat.js',
    '/js/strm.js',
    '/js/cloudsaver.js',
    '/js/edit-task.js',
    '/js/customPush.js',
    '/js/cinema-background.js',
    '/js/task-delete-dialog.js',
    '/js/ai-confirm-dialog.js',
    '/icons/ai.svg',
    '/icons/auto.svg',
    '/icons/github.svg',
    '/icons/link.svg',
    '/icons/logs.svg',
    '/icons/moon.svg',
    '/icons/push.svg',
    '/icons/refresh.svg',
    '/icons/star.svg',
    '/icons/sun.svg',
    '/icons/toggle.svg',
    '/icons/cloudflare.svg',
    '/icons/cloudsaver.svg'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then(cache => {
            return Promise.allSettled(
                PRECACHE_URLS.map(url =>
                    cache.add(url).catch(() => { /* skip missing files silently */ })
                )
            );
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    const currentCaches = [STATIC_CACHE, TMDB_API_CACHE, TMDB_IMAGE_CACHE];
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.map(key => {
                    if (!currentCaches.includes(key)) {
                        return caches.delete(key);
                    }
                })
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // TMDB API 数据：Network First，成功后入缓存
    if (url.pathname.startsWith('/api/tmdb/')) {
        event.respondWith(networkFirst(request, TMDB_API_CACHE));
        return;
    }

    // TMDB 海报图片：Cache First
    if (url.hostname === 'image.tmdb.org') {
        event.respondWith(cacheFirst(request, TMDB_IMAGE_CACHE));
        return;
    }

    // 本地静态资源：Cache First
    if (url.pathname.startsWith('/css/') ||
        url.pathname.startsWith('/js/') ||
        url.pathname.startsWith('/favicon/') ||
        url.pathname.startsWith('/icons/')) {
        event.respondWith(cacheFirst(request, STATIC_CACHE));
        return;
    }

    // 页面导航：缓存 HTML
    if (url.pathname === '/' || url.pathname.endsWith('.html')) {
        event.respondWith(cacheFirst(request, STATIC_CACHE));
        return;
    }
});

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw e;
    }
}

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        return new Response('', { status: 408 });
    }
}
