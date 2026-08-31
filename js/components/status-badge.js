/* ============================================================
   DialFactory V1 · Status Badge Component
   ============================================================ */

const StatusBadge = (() => {

  function render(status, size = '') {
    const label = CONFIG.STATUS_LABELS[status] || status;
    const colors = CONFIG.STATUS_COLORS[status] || { bg: '#F3F4F6', text: '#6B7280' };
    const sizeClass = size ? ` badge-${size}` : '';

    return `<span class="badge${sizeClass}" style="background:${colors.bg};color:${colors.text}">${escapeHTML(label)}</span>`;
  }

  function renderDot(status) {
    const colors = CONFIG.STATUS_COLORS[status] || { bg: '#F3F4F6', text: '#6B7280' };
    return `<span class="badge" style="background:${colors.bg};color:${colors.text};width:8px;height:8px;border-radius:50%;padding:0;display:inline-block;"></span>`;
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { render, renderDot };
})();
