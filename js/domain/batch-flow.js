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

  /** 事件回放：某个批次在某个节点上的状态 */
  function batchStatusAt(batchId, nodeId, events) {
    const evs = (events || []).filter(function (e) {
      return e.node_id === nodeId && (!e.batch_id || e.batch_id === batchId);
    }).sort(function (a, b) {
      return new Date(a.occurred_at) - new Date(b.occurred_at);
    });

    let status = 'waiting';
    evs.forEach(function (e) {
      if (e.event === 'activate' || e.event === 'resume' || e.event === 'undo') status = 'active';
      else if (e.event === 'pause') status = 'paused';
      else if (e.event === 'done') status = 'done';
    });
    return status;
  }

  /**
   * 订单级聚合：每个节点在所有覆盖批次上的综合状态。
   * 覆盖批次 = 出生工序早于或等于该节点的批次（出生点之后的批次不拖后腿）。
   * 规则：全部 done → done；任一 active → active；任一 paused → paused；否则 waiting。
   */
  function deriveOrderAggregate(events, route, batches) {
    const nodes = (route || []).slice().sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); });
    const activeBatches = (batches || []).filter(function (b) { return b.status !== 'cancelled'; });

    return nodes.map(function (n) {
      const covering = activeBatches.filter(function (b) {
        if (!b.start_node_id) return true;
        const sn = nodes.find(function (x) { return x.id === b.start_node_id; });
        return !sn || n.seq >= sn.seq;
      });

      const states = covering.map(function (b) { return batchStatusAt(b.id, n.id, events); });

      let status;
      if (states.length === 0) {
        status = 'waiting';
      } else if (states.every(function (s) { return s === 'done'; })) {
        status = 'done';
      } else if (states.some(function (s) { return s === 'active'; })) {
        status = 'active';
      } else if (states.some(function (s) { return s === 'paused'; })) {
        status = 'paused';
      } else {
        status = 'waiting';
      }

      return {
        nodeId: n.id,
        seq: n.seq,
        processName: n.process_name,
        status: status,
        batchStates: covering.map(function (b, i) { return { batchId: b.id, status: states[i] }; })
      };
    });
  }

  /** 该批次的下一道工序（纯函数；无下一道返回 null = 批次完成） */
  function nextNodeForBatch(route, currentNodeId, startNodeId) {
    const nodes = (route || []).slice().sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); });
    const cur = nodes.find(function (n) { return n.id === currentNodeId; });
    const startSeq = startNodeId
      ? (nodes.find(function (n) { return n.id === startNodeId; }) || {}).seq
      : null;
    const after = nodes.filter(function (n) {
      if (cur && n.seq <= cur.seq) return false;
      if (startSeq != null && n.seq < startSeq) return false;
      return true;
    });
    return after[0] || null;
  }

  /** 每个批次的当前节点（第一个非 done 节点；全 done 返回 null） */
  function deriveBatchCurrent(events, route, batch) {
    const flow = deriveRoute(events, route, batch && batch.start_node_id);
    return flow.current;
  }

  return { deriveRoute, isComplete, batchStatusAt, deriveOrderAggregate, nextNodeForBatch, deriveBatchCurrent };
})();
