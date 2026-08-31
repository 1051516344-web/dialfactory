/* ============================================================
   DialFactory V1 · Order State Derivation
   CONSTRAINT D-2-003: orders.status is DERIVED from nodes.
   UI must derive status from order_nodes, not read orders.status directly.
   ============================================================ */

const OrderState = (() => {

  /**
   * Derive order status from its nodes.
   * ADL-003: in_production / paused / completed / cancelled
   */
  function derive(nodes, currentStatus) {
    // cancelled is terminal — never override
    if (currentStatus === 'cancelled') return 'cancelled';

    if (!nodes || nodes.length === 0) return 'in_production';

    const allDone = nodes.every(n => n.status === 'done');
    if (allDone) return 'completed';

    const nonDoneNodes = nodes.filter(n => n.status !== 'done');
    const allPaused = nonDoneNodes.every(n => n.status === 'paused');
    if (allPaused) return 'paused';

    return 'in_production';
  }

  /**
   * Compute node statistics for display.
   * Returns NodeStats with progress data and stall detection.
   */
  function nodeStats(nodes) {
    if (!nodes || nodes.length === 0) {
      return {
        total: 0, done: 0, active: 0, paused: 0, waiting: 0,
        currentNode: null, isStalled: false, stalledDays: 0,
        hasNodes: false,
        progressPercent: 0
      };
    }

    const counts = { total: nodes.length, done: 0, active: 0, paused: 0, waiting: 0 };
    let currentNode = null;

    for (const n of nodes) {
      counts[n.status] = (counts[n.status] || 0) + 1;
      if (n.status === 'active' && !currentNode) {
        currentNode = n;
      }
    }

    let isStalled = false;
    let stalledDays = 0;
    if (currentNode) {
      const ms = Date.now() - new Date(currentNode.updated_at).getTime();
      stalledDays = Math.floor(ms / (1000 * 60 * 60 * 24));
      isStalled = stalledDays >= CONFIG.STALL_DAYS;
    }

    const progressPercent = counts.total > 0
      ? Math.round((counts.done / counts.total) * 100)
      : 0;

    return {
      ...counts,
      currentNode: currentNode ? {
        process_name: currentNode.process_name,
        dept_name: currentNode.dept_name,
        updated_at: currentNode.updated_at
      } : null,
      isStalled,
      stalledDays,
      hasNodes: true,
      progressPercent
    };
  }

  return { derive, nodeStats };
})();
