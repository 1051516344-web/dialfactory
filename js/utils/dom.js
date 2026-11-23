/* ============================================================
   DialFactory V1 · DOM Helpers
   ============================================================ */

const DOM = (() => {

  /**
   * HTML-escape a string for BOTH text and attribute contexts.
   * 转义 & < > " ' —— 各页面内的 escapeHTML 包装统一转调这里（B15 属性上下文 XSS 修复）。
   *
   * 注：原先还导出 create / $ / $$ / render / show / hide 六个 helper，
   *     经全仓 grep 确认 0 引用（2026-11 体检报告），已随死代码清理删除。
   *     需要时再加，避免长期维护无人使用的工具集。
   */
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return { escapeHtml };
})();
