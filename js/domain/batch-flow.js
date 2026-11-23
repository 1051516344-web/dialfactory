/* ============================================================
   DialFactory V1 · Batch Flow（批次路线推导）
   ------------------------------------------------------------
   输入：事件流 + 订单路线 + 批次出生工序
   输出：该批次在每道工序上的状态与产量

   规则：
     · 只考虑出生工序（start_node_id）及其之后的节点
     · 事件按时间回放：activate/resume/undo → active；pause → paused；done → done
     · 历史共享事件（batch_id 为空）对所有批次都算数（026 之前所有批次是同步推进的）
   纯函数、无 DOM/DB 依赖，便于独立测试。
   ============================================================ */

const BatchFlow = (() => {

  function ts(e) {
    return new Date(e.occurred_at).getTime();
  }

  /**
   * @param {Array} events 该批次可见的事件（本批次 + 历史共享）
   * @param {Array} routeNodes 订单节点（含 id/seq/process_name）
   * @param {string} [startNodeId] 批次出生工序（空 = 从第一道开始）
   */
  function deriveRoute(events, routeNodes, startNodeId) {
    const nodes = (routeNodes || []).slice().sort(function (a, b) {
      return (a.seq || 0) - (b.seq || 0);
    });

    const startNode = startNodeId ? nodes.find(function (n) { return n.id === startNodeId; }) : null;
    const startSeq = startNode ? startNode.seq : null;

    const byNode = {};
    (events || []).forEach(function (e) {
      if (!e.node_id) return;
      if (!byNode[e.node_id]) byNode[e.node_id] = [];
      byNode[e.node_id].push(e);
    });

    const rows = [];
    let current = null;

    nodes.forEach(function (n) {
      if (startSeq != null && n.seq < startSeq) return;

      const evs = (byNode[n.id] || []).slice().sort(function (a, b) { return ts(a) - ts(b); });

      let status = 'waiting';
      let startedAt = null;
      let completedAt = null;
      let qtyIn = null;
      let good = null;
      let bad = null;

      evs.forEach(function (e) {
        if (e.event === 'activate' || e.event === 'resume' || e.event === 'undo') {
          status = 'active';
          if (!startedAt) startedAt = ts(e);
        } else if (e.event === 'pause') {
          status = 'paused';
        } else if (e.event === 'done') {
          status = 'done';
          completedAt = ts(e);
          if (e.qty_in != null) qtyIn = e.qty_in;
          if (e.good_qty != null) good = e.good_qty;
          if (e.bad_qty != null) bad = e.bad_qty;
        }
      });

      const row = {
        nodeId: n.id,
        processName: n.process_name,
        seq: n.seq,
        status: status,
        startedAt: startedAt,
        completedAt: completedAt,
        qtyIn: qtyIn,
        good: good,
        bad: bad
      };
      rows.push(row);

      // 第一个未完成的节点 = 该批次的当前位置
      if (!current && status !== 'done') current = row;
    });

    const doneCount = rows.filter(function (r) { return r.status === 'done'; }).length;

    return {
      rows: rows,
      current: current,          // null 表示该批次已全部完成
      doneCount: doneCount,
      total: rows.length
    };
  }

  /** 该批次是否已完成全部工序 */
  function isComplete(flow) {
    return !!flow && flow.total > 0 && flow.doneCount >= flow.total;
  }

  return { deriveRoute, isComplete };
})();
