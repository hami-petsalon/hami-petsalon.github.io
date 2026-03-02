/* sw.js - Hami PWA Service Worker */
const CACHE_VERSION = "hami-v20260302-1";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./logo.png"
];

// 安裝：預先快取
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

// 啟用：清除舊快取
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== RUNTIME_CACHE) {
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

// 讓前端可主動觸發更新
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// 抓取策略
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 只處理 http/https
  if (!url.protocol.startsWith("http")) return;

  // 導航請求（整頁）=> Network First（確保拿到新版本）
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, fresh.clone());
          return fresh;
        } catch (err) {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match("./index.html");
        }
      })()
    );
    return;
  }

  // 同網域靜態資源 => Stale While Revalidate
  const isSameOrigin = url.origin === self.location.origin;
  const isStaticAsset =
    /\.(?:js|css|png|jpg|jpeg|svg|webp|ico|json|woff2?|ttf)$/i.test(url.pathname);

  if (isSameOrigin && isStaticAsset) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);

        const networkFetch = fetch(request)
          .then((res) => {
            cache.put(request, res.clone());
            return res;
          })
          .catch(() => null);

        return cached || networkFetch || fetch(request);
      })()
    );
    return;
  }

  // 其他 => Network First，失敗再讀快取
  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw err;
      }
    })()
  );
});