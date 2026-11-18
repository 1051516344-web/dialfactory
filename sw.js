/* ============================================================
   DialFactory · Service Worker（PWA 静态缓存）
   ------------------------------------------------------------
   目标：国内网络下，第二次及以后的打开几乎不再请求 GitHub Pages。

   缓存策略：
     ① 同源静态资源（html / css / js / vendor / icons）→ cache-first
        （未命中时联网取回并写入缓存，后续命中即本地返回）
     ② Supabase 的任何请求（REST / Auth / Storage / Edge Functions）
        → network-only，**绝不缓存业务数据**
     ③ 其它第三方域 → 直连，不拦截、不缓存

   版本控制：
     - 改动前端代码后，**必须把 VERSION 改成新值**（例如 v2026-11-18-02）。
     - 浏览器发现 sw.js 字节变化 → 安装新 SW → activate 时删除所有旧缓存
       → 通知已打开的页面「系统已更新，请刷新页面」。
     - VERSION 不变则永远命中旧缓存，用户看不到更新。
   ============================================================ */

const VERSION = 'v2026-11-18-01';
const CACHE_NAME = 'dialfactory-' + VERSION;

/** 预缓存：应用外壳。其余同源资源在被请求时自动写入缓存（运行时缓存）。 */
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/reset.css',
  './css/variables.css',
  './css/layout.css',
  './css/components.css',
  './css/flow.css',
  './css/pages.css',
];

// ------------------------------------------------------------
// install：预缓存外壳，并立即接管（不等旧标签页关闭）
// ------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // cache: 'reload' 强制绕过 HTTP 缓存，保证拿到的是这次部署的文件
    await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

// ------------------------------------------------------------
// activate：清掉所有旧版本缓存 → 接管页面 → 通知前端可刷新
// ------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();

    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      client.postMessage({ type: 'SW_UPDATED', version: VERSION });
    }
  })());
});

// ------------------------------------------------------------
// fetch：按来源分流
// ------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST/PATCH/DELETE 一律直连

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // ① 业务数据绝不缓存（含 OCR Edge Function）
  if (url.hostname === 'supabase.co' || url.hostname.endsWith('.supabase.co')) return;

  // ② 其它跨域资源：直连，不进缓存
  if (url.origin !== self.location.origin) return;

  // ③ 同源静态资源：cache-first
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      // 离线时，导航请求回退到缓存的 shell
      if (req.mode === 'navigate') {
        const shell = (await cache.match('./index.html')) || (await cache.match('./'));
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
