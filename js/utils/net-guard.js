/* ============================================================
   DialFactory V1 · NetGuard（弱网兜底层）
   ------------------------------------------------------------
   目标：任何「网络类」失败都不能变成白屏或无限转圈。
   做什么：
     1. 全局捕获 unhandledrejection / 运行期 error，识别网络类错误 → 弹提示层
     2. navigator.offline 立即提示；恢复 online 自动隐藏
     3. 提供「重新连接」按钮（location.reload）
     4. 低版本浏览器探测：不支持可选链等新语法时给出明确提示，而不是白屏
   约束：纯 ES5 语法 + 无依赖，保证在旧 WebView 里本身不会挂掉。
   ============================================================ */

const NetGuard = (() => {
  let shown = false;
  let kind = '';

  // 与 js/data/client.js 的 isNetworkError 保持同一套判断口径
  const NET_RE = /failed to fetch|fetch failed|network ?error|network request failed|networkerror|timeout|timed out|load failed|offline|econn|err_network|err_internet|err_connection|authretryablefetcherror/i;

  function textOf(err) {
    if (!err) return '';
    let name = '';
    let msg = '';
    try { name = String(err.name || ''); } catch (e) { /* ignore */ }
    try { msg = String(err.message || err); } catch (e) { /* ignore */ }
    return name + ' ' + msg;
  }

  function isNetworkLike(err) {
    return NET_RE.test(textOf(err));
  }

  /**
   * 探测「可选链 / 空值合并」这类 ES2020 语法能否被解析。
   * 只构造不执行 —— 旧引擎在 new Function 阶段就会抛 SyntaxError。
   */
  function supportsModernSyntax() {
    try {
      // eslint-disable-next-line no-new, no-new-func
      new Function('var o; var s = o?.a ?? 0; return s;');
      return true;
    } catch (e) {
      return false;
    }
  }

  function el() {
    return document.getElementById('net-overlay');
  }

  function setText(box, sel, text) {
    const node = box.querySelector(sel);
    if (node) node.textContent = text;
  }

  function show(reason) {
    const box = el();
    if (!box) return;
    reason = reason || 'network';
    if (shown && kind === reason) return;
    shown = true;
    kind = reason;

    if (reason === 'browser') {
      setText(box, '[data-net-title]', '浏览器版本过低');
      setText(box, '[data-net-body]', '当前浏览器解析不了系统所需的脚本，请升级到最新版 Chrome / Safari，或换一台设备。');
      setText(box, '[data-net-tip]', '数据不会丢失，升级浏览器后即可继续使用。');
    } else if (reason === 'script') {
      setText(box, '[data-net-title]', '脚本加载失败');
      setText(box, '[data-net-body]', '页面资源没有加载完整，通常是网络中断或缓存问题。');
      setText(box, '[data-net-tip]', '点「重新连接」重新加载即可，登录状态不会失效。');
    } else {
      setText(box, '[data-net-title]', '网络连接断开');
      setText(box, '[data-net-body]', '无法连接服务器，请检查车间 Wi-Fi / 移动数据。');
      setText(box, '[data-net-tip]', '登录状态不会因此失效；网络恢复后点「重新连接」，无需重新登录。');
    }

    box.hidden = false;
    box.setAttribute('data-shown', '1');
  }

  function hide() {
    const box = el();
    if (!box) return;
    box.hidden = true;
    box.removeAttribute('data-shown');
    shown = false;
    kind = '';
  }

  /**
   * 供页面 / 数据层手动上报。返回 true 表示已判定为网络类错误并弹层。
   */
  function report(err) {
    if (!isNetworkLike(err)) return false;
    show('network');
    return true;
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function install() {
    // ① 未处理的 Promise 拒绝：supabase-js 的网络失败通常走这里
    window.addEventListener('unhandledrejection', function (e) {
      let handled = false;
      try { handled = report(e && e.reason); } catch (err) { handled = false; }
      if (handled && e && typeof e.preventDefault === 'function') e.preventDefault();
    });

    // ② 同步异常：脚本加载失败由 index.html 既有 handler 负责，这里只兜运行期错误
    window.addEventListener('error', function (e) {
      if (e && e.target && e.target.tagName === 'SCRIPT') return;
      try {
        report((e && (e.error || e.message)) || 'error');
      } catch (err) { /* ignore */ }
    });

    // ③ 离线/恢复：零成本信号，比等请求超时快得多
    window.addEventListener('offline', function () { show('network'); });
    window.addEventListener('online', function () { hide(); });

    // ④ 重试按钮（用事件绑定，避免内联 onclick 在部分旧 WebView 上被 CSP/严格模式影响）
    const btn = document.getElementById('net-retry');
    if (btn) {
      btn.addEventListener('click', function () {
        hide();
        window.location.reload();
      });
    }

    // ⑤ 低版本浏览器：给出明确提示，而不是让页面停在骨架屏
    if (!supportsModernSyntax()) show('browser');
  }

  onReady(install);

  return { install, show, hide, report, isNetworkLike, supportsModernSyntax };
})();
