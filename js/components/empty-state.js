/* ============================================================
   DialFactory V1 · Empty State Component
   ============================================================ */

const EmptyState = (() => {

  function render({ icon = '📭', title = '暂无数据', desc = '', action = '' } = {}) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">${escapeHTML(icon)}</div>
        <div class="empty-state-title">${escapeHTML(title)}</div>
        ${desc ? `<div class="empty-state-desc">${escapeHTML(desc)}</div>` : ''}
        ${action ? `<div style="margin-top:var(--space-md);">${action}</div>` : ''}
      </div>
    `;
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { render };
})();
