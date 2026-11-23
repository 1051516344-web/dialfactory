/* ============================================================
   DialFactory V1 · Batch Actions（批次独立流转的动作编排）
   ------------------------------------------------------------
   仅用于「有批次」的订单。每个动作作用于 (批次, 节点)，
   以 node_events 为唯一状态来源，动作后重算订单聚合节点状态。

   原则：
     · 不写死批次×节点状态表 —— 状态从事件流推导
     · 动作后 recomputeAggregate() 把聚合状态写回 order_nodes，
       供仪表盘 / 订单列表 / 订单状态继续使用
     · 无批次订单仍走 node-actions（本模块不参与）
   ============================================================ */

const BatchActions = (() => {

  const nowIso = () => new Date().toISOString();

  /** 追加一条带批次归属的事件（失败只告警，不阻塞） */
  async function evt(orderId, batch, node, event, extra) {
    if (typeof NodeEventsAPI === 'undefined' || !NodeEventsAPI.record) return null;
    const payload = {
      order_id: orderId,
      batch_id: batch && batch.id ? batch.id : null,
      node_id: node && node.id ? node.id : null,
      process_name: node && node.process_name ? node.process_name : null,
      event: event
    };
    if (extra) {
      for (const k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) payload[k] = extra[k]; }
    }
    try {
      return await NodeEventsAPI.record(payload);
    } catch (e) {
      console.warn('[BatchActions] 事件写入异常:', e && e.message);
      return { ok: false, error: e && e.message };
    }
  }

  /**
   * 重算订单聚合节点状态并写回 order_nodes + 订单状态。
   * 返回新的订单状态。
   */
  async function recomputeAggregate(order) {
    const nodes = (order.nodes || []).slice().sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); });

    const [evRes, br] = await Promise.all([
      NodeEventsAPI.listByOrderId(order.id),
      BatchesAPI.listByOrderId(order.id)
    ]);
    const events = evRes.ok ? (evRes.data || []) : [];
    const batches = br.ok ? (br.data.batches || []) : [];

    const agg = BatchFlow.deriveOrderAggregate(events, nodes, batches);
    const map = {};
    agg.forEach(function (a) { map[a.nodeId] = a.status; });

    for (const n of nodes) {
      const s = map[n.id] || 'waiting';
      if (n.status !== s) {
        await OrdersAPI.updateNode(n.id, { status: s });
      }
    }

    const derived = nodes.map(function (n) {
      return Object.assign({}, n, { status: map[n.id] || 'waiting' });
    });
    const newStatus = OrderState.derive(derived, order.status);
    await OrdersAPI.updateStatus(order.id, newStatus);
    return newStatus;
  }

  /** 完成该批次在当前节点的工序 */
  async function advance(order, batch, node, options) {
    const opts = options || {};

    // 守卫：批次当前位置必须就是这一道（防止跳过/错位）
    if (batch.current_node_id && batch.current_node_id !== node.id) {
      return { ok: false, error: '该批次当前不在这一道工序', phase: 'forbidden' };
    }

    await evt(order.id, batch, node, 'done', {
      qty_in: opts.qtyIn != null ? Number(opts.qtyIn) : null,
      good_qty: opts.goodQty != null ? Number(opts.goodQty) : null,
      bad_qty: opts.badQty != null ? Number(opts.badQty) : null
    });

    const next = BatchFlow.nextNodeForBatch(order.nodes, node.id, batch.start_node_id);
    const done = !next;
    await BatchesAPI.updateBatch(batch.id, {
      current_node_id: next ? next.id : null,
      current_process_name: next ? next.process_name : null,
      location_updated_at: nowIso(),
      status: done ? 'completed' : undefined
    });

    if (typeof BatchProgressAPI !== 'undefined' && BatchProgressAPI.recordNodeCompletion) {
      await BatchProgressAPI.recordNodeCompletion(order.id, node, {
        qtyOut: opts.qtyOut,
        goodQty: opts.goodQty,
        badQty: opts.badQty,
        batchId: batch.id
      });
    }

    const newStatus = await recomputeAggregate(order);
    return { ok: true, newOrderStatus: newStatus };
  }

  /** 该批次开始/激活某道工序 */
  async function activate(order, batch, node) {
    await evt(order.id, batch, node, 'activate', {});
    await BatchesAPI.updateBatch(batch.id, {
      current_node_id: node.id,
      current_process_name: node.process_name,
      location_updated_at: nowIso(),
      status: 'active'
    });
    const newStatus = await recomputeAggregate(order);
    return { ok: true, newOrderStatus: newStatus };
  }

  /** 暂停该批次当前工序 */
  async function pause(order, batch, node, reason) {
    await evt(order.id, batch, node, 'pause', { note: reason || null });
    const newStatus = await recomputeAggregate(order);
    return { ok: true, newOrderStatus: newStatus };
  }

  /** 恢复该批次当前工序 */
  async function resume(order, batch, node) {
    await evt(order.id, batch, node, 'resume', {});
    const newStatus = await recomputeAggregate(order);
    return { ok: true, newOrderStatus: newStatus };
  }

  /** 撤销该批次最近一次完成 */
  async function undo(order, batch, node) {
    await evt(order.id, batch, node, 'undo', {});
    const newStatus = await recomputeAggregate(order);
    return { ok: true, newOrderStatus: newStatus };
  }

  return { advance, activate, pause, resume, undo, recomputeAggregate };
})();
