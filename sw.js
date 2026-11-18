/* ============================================================
   DialFactory · Service Worker【停用开关 / Kill Switch】
   ------------------------------------------------------------
   2026-11-18：PWA 缓存上线后，国内网络下反而更卡（SW 拦截 + 缓存写入开销
   大于收益），因此停用 Service Worker 缓存。

   ⚠️ 为什么不能直接删掉 sw.js？
     旧版 SW 对**导航请求**也是 cache-first，会把缓存里的旧 index.html 一直
     返回给用户 —— 新的 index.html（含注销脚本）根本没机会执行，
     用户会被永久锁在旧版本上。

   ✅ 正确做法（本文件）：保留一个"自杀式" SW。
     浏览器每次访问都会检查 sw.js 字节是否变化 → 发现变化 → 安装本 SW
     → activate 阶段：清空所有缓存 → 注销自身 → 从此外层无 SW 拦截，
     页面请求全部直连网络。用户刷新一次即回到最新版本。

   后续清理：确认线上客户端都不再命中旧缓存后（约 1~2 周），
   可安全删除本文件，并从 deploy.yml 的拷贝清单中移除 sw.js。
   ============================================================ */

const KILL_VERSION = 'kill-2026-11-18-01';

self.addEventListener('install', () => {
  // 立即接管，不等待旧标签页关闭
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 1) 清空所有缓存（含旧版 dialfactory-*）
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch (err) {
      console.warn('[SW-KILL] 清空缓存失败:', err && err.message);
    }

    // 2) 注销自身：从此外层不再有 Service Worker
    try {
      await self.registration.unregister();
    } catch (err) {
      console.warn('[SW-KILL] 注销失败:', err && err.message);
    }

    // 3) 通知已打开的页面（新页面不处理该消息，仅老页面可能收到）
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.postMessage({ type: 'SW_KILLED', version: KILL_VERSION });
      }
    } catch (err) {
      /* ignore */
    }
  })());
});

// 刻意不注册 fetch 监听：本版本不拦截、不缓存任何请求。
