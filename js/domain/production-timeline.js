/* ============================================================
   DialFactory V1 · Production Timeline（事件 → 生产记录聚合）
   ------------------------------------------------------------
   输入：node_events 事件流（按时间）
   输出：按工序聚合的记录行
     { processName, status, start, end, activeMs, runningMs,
       pauseCount, qtyIn, good, bad, sortAt }
   纯函数、无 DOM/DB 依赖，便于独立测试。
   ============================================================ */

const ProductionTimeline = (() => {

  /**
   * 把事件按 node_id 聚合。耗时只累计「进行中」的区间，暂停时长不计入。
   * @param {Array} events node_events 行
   * @param {number} [nowMs] 便于测试注入"当前时间"
   */
  function summarize(events, nowMs) {
    const now = nowMs != null ? nowMs : Date.now();
    const groups = {};

    (events || []).forEach(function (e) {
      const key = e.node_id || ('name:' + (e.process_name || ''));
      if (!groups[key]) {
        groups[key] = { nodeId: e.node_id, processName: e.process_name, events: [] };
      }
      groups[key].events.push(e);
    });

    const rows = Object.keys(groups).map(function (k) {
      const g = groups[k];
      const evs = g.events.slice().sort(function (a, b) {
        return new Date(a.occurred_at) - new Date(b.occurred_at);
      });

      let firstStart = null;
      let activeSince = null;
      let activeMs = 0;
      let pauseCount = 0;
      let lastEnd = null;
      let qtyIn = null;
      let good = null;
      let bad = null;

      evs.forEach(function (e) {
        const ts = new Date(e.occurred_at).getTime();
        if (e.event === 'activate' || e.event === 'resume' || e.event === 'undo') {
          if (firstStart == null) firstStart = ts;
          if (activeSince == null) activeSince = ts;
        } else if (e.event === 'pause') {
          pauseCount += 1;
          if (activeSince != null) { activeMs += ts - activeSince; activeSince = null; }
        } else if (e.event === 'done') {
          if (activeSince != null) { activeMs += ts - activeSince; activeSince = null; }
          lastEnd = ts;
          if (e.qty_in != null) qtyIn = e.qty_in;
          if (e.good_qty != null) good = e.good_qty;
          if (e.bad_qty != null) bad = e.bad_qty;
        }
      });

      const lastEvent = evs[evs.length - 1].event;
      let status = 'active';
      if (lastEvent === 'done') status = 'done';
      else if (lastEvent === 'pause') status = 'paused';
      else if (lastEvent === 'append' || lastEvent === 'rework') status = 'pending';

      return {
        processName: g.processName,
        status: status,
        start: firstStart,
        end: lastEnd,
        activeMs: activeMs,
        runningMs: activeSince != null ? (now - activeSince) : 0,
        pauseCount: pauseCount,
        qtyIn: qtyIn,
        good: good,
        bad: bad,
        sortAt: firstStart || lastEnd || 0
      };
    });

    rows.sort(function (a, b) { return a.sortAt - b.sortAt; });
    return rows;
  }

  return { summarize };
})();
