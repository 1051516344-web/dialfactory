/* ============================================================
   DialFactory V1 · FetchRetry（网络请求指数退避重试）
   ------------------------------------------------------------
   为什么做在 fetch 层而不是 DB.call：
   `DB.call()` 接到的已经是「发出去了的 Promise」，失败即耗尽，无从重试；
   而 63 个调用点全部改造成「传函数」风险太大。包一层 fetch 可以零调用点改动，
   并把重试范围精确限制在幂等请求上。

   规则（刻意保守）：
     · 只重试 GET / HEAD —— 写操作（POST/PATCH/DELETE）一律不重试，
       避免「请求其实到了服务端、只是回包丢了」导致的重复建单 / 重复扣数
     · 只重试网络类异常（Failed to fetch / timeout / network）
     · HTTP 层错误（401 / 403 / 404 / 500）是正常返回，不是 reject，天然不重试
     · AbortError 不重试（是调用方主动取消）
     · navigator.onLine === false 时快速失败，不空等 6 秒
     · 退避：2s → 4s，最多 3 次；最终仍失败则抛出，交给 NetGuard 全局弹层
   纯 ES5 + 无依赖，早于 supabase-js 初始化安装。
   ============================================================ */

const FetchRetry = (() => {
  let installed = false;
  let retriedCount = 0;

  const DEFAULTS = {
    delays: [2000, 4000],        // 第 1、2 次失败后的等待；第 3 次失败直接抛出
    methods: ['GET', 'HEAD'],
    urlPrefix: ''                // 空 = 不按 URL 过滤
  };

  function isAbort(err) {
    return !!err && (err.name === 'AbortError');
  }

  // 与 DB.isNetworkError / NetGuard 保持同一套判定口径
  function isNetworkError(err) {
    if (!err) return false;
    const name = String(err.name || '');
    const msg = String(err.message || err || '');
    if (/AuthRetryableFetchError|TimeoutError|AbortError|NetworkError/i.test(name)) {
      return !isAbort(err);
    }
    return /failed to fetch|fetch failed|network ?error|network request failed|timeout|timed out|load failed|offline|econn|err_network|err_internet|err_connection/i.test(msg);
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function merge(base, extra) {
    const out = {};
    let k;
    for (k in base) { if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k]; }
    for (k in (extra || {})) { if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k]; }
    return out;
  }

  /**
   * 安装 fetch 包装（幂等）。返回是否本次安装成功。
   */
  function install(options) {
    if (installed) return false;
    if (typeof window.fetch !== 'function') return false;

    const cfg = merge(DEFAULTS, options);
    const nativeFetch = window.fetch;

    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : ((input && input.url) || '');
      const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      const inScope = cfg.methods.indexOf(method) >= 0 &&
                      (!cfg.urlPrefix || url.indexOf(cfg.urlPrefix) === 0);

      let attempt = 0;

      function run() {
        return nativeFetch.call(window, input, init).catch(function (err) {
          const canRetry = inScope &&
                           attempt < cfg.delays.length &&
                           isNetworkError(err) &&
                           navigator.onLine !== false;
          if (!canRetry) throw err;

          const delay = cfg.delays[attempt];
          attempt += 1;
          retriedCount += 1;
          console.warn('[FetchRetry] 第 ' + attempt + ' 次失败，' + delay + 'ms 后重试：' + method + ' ' + url);
          return wait(delay).then(run);
        });
      }

      return run();
    };

    installed = true;
    return true;
  }

  function stats() {
    return { installed: installed, retried: retriedCount };
  }

  return { install, isNetworkError, stats, DEFAULTS };
})();
