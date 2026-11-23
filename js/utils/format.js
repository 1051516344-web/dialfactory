/* ============================================================
   DialFactory V1 · Formatters
   ============================================================ */

const Format = (() => {

  /** Format date to locale string: 2026-08-06 */
  function date(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Get relative days: "还剩14天" / "超期3天" */
  function dueDays(dateStr) {
    if (!dateStr) return '';
    const due = new Date(dateStr);
    const now = new Date();
    const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    if (diff > 0) return `还剩${diff}天`;
    if (diff === 0) return '今天到期';
    return `超期${Math.abs(diff)}天`;
  }

  /** Duration from timestamp to now: "卡了5天" */
  function stalledSince(isoStr) {
    if (!isoStr) return '';
    const then = new Date(isoStr);
    const now = new Date();
    const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
    if (days === 0) return '今天开始';
    return `卡了${days}天`;
  }

  /** Number with commas: 1,234 */
  function number(n) {
    if (n == null) return '—';
    return Number(n).toLocaleString('zh-CN');
  }

  /** Percentage */
  function percent(done, total) {
    if (!total) return 0;
    return Math.round((done / total) * 100);
  }

  /** Capitalize first letter (unused but available) */
  function capitalize(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  return { date, dueDays, stalledSince, number, percent, capitalize };
})();
