/* ============================================================
   DialFactory V1 · Progress Bar Component
   CONSTRAINT D-2-005: When total=0, show "暂无工序" not 100%.
   ============================================================ */

const ProgressBar = (() => {

  /**
   * Render a segmented progress bar.
   * @param {Object} stats - { total, done, active, paused, waiting, hasNodes }
   */
  function render(stats) {
    if (!stats || !stats.total || !stats.hasNodes) {
      return `
        <div class="progress-empty">
          <span class="progress-empty-text">暂无工序</span>
        </div>
      `;
    }

    const pct = (count) => stats.total > 0
      ? Math.round((count / stats.total) * 100)
      : 0;

    const segs = [];
    if (stats.done > 0)    segs.push(`<div class="seg progress-seg-done" style="width:${pct(stats.done)}%"></div>`);
    if (stats.active > 0)  segs.push(`<div class="seg progress-seg-active" style="width:${pct(stats.active)}%"></div>`);
    if (stats.paused > 0)  segs.push(`<div class="seg progress-seg-paused" style="width:${pct(stats.paused)}%"></div>`);
    if (stats.waiting > 0) segs.push(`<div class="seg progress-seg-waiting" style="width:${pct(stats.waiting)}%"></div>`);

    const donePct = pct(stats.done);

    return `
      <div class="progress-bar-wrapper">
        <div class="progress-bar">
          ${segs.join('')}
        </div>
        <span class="progress-text">${donePct}% (${stats.done}/${stats.total})</span>
      </div>
    `;
  }

  return { render };
})();
