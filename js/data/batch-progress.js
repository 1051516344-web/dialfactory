/* ============================================================
   DialFactory V1 · Batch Progress API（P1 记账层）
   ------------------------------------------------------------
   职责：节点完成时，把「哪个批次 / 哪道工序 / 进出多少」记一笔。
   幂等：依赖 batch_progress 的 UNIQUE(batch_id, node_id) + upsert。

   数据诚实性约定：
     · qty_in  = 批次自身数量（进入该工序的投入）
     · qty_out / good / bad 只在「该订单只有一个批次」时精确写入；
       多批次时为 null，表示未按批次拆分统计 —— 不编造分配数字。
   ============================================================ */

const BatchProgressAPI = (() => {

  /** 某订单的全部批次进度（按完成时间升序） */
  async function listByOrderId(orderId) {
    return DB.call(
      DB.get().from('batch_progress')
        .select('id, batch_id, node_id, process_name, qty_in, qty_out, good_qty, bad_qty, completed_at')
        .eq('order_id', orderId)
        .order('completed_at', { ascending: true })
    );
  }

  /**
   * 节点完成 → 为该订单的每个批次写一条进度（幂等）。
   * 同时把批次的 current_node_* 更新为「刚完成的那道工序」。
   */
  async function recordNodeCompletion(orderId, node, extra) {
    const opts = extra || {};

    const br = await DB.call(
      DB.get().from('production_batches')
        .select('id, quantity, color, status')
        .eq('order_id', orderId)
    );
    if (!br.ok) return { ok: false, error: br.error };

    const batches = (br.data || []).filter(function (b) { return b.status !== 'cancelled'; });
    if (batches.length === 0) return { ok: true, skipped: true, reason: 'no_batches' };

    const now = new Date().toISOString();
    const single = batches.length === 1;
    const qtyOut = opts.qtyOut != null ? Number(opts.qtyOut)
                 : (single ? Number(batches[0].quantity) : null);

    const rows = batches.map(function (b) {
      return {
        batch_id: b.id,
        node_id: node.id,
        order_id: orderId,
        process_name: node.process_name,
        qty_in: Number(b.quantity),
        qty_out: single ? qtyOut : null,
        good_qty: single && opts.goodQty != null ? Number(opts.goodQty) : null,
        bad_qty: single && opts.badQty != null ? Number(opts.badQty) : null,
        completed_at: now
      };
    });

    const up = await DB.call(
      DB.get().from('batch_progress')
        .upsert(rows, { onConflict: 'batch_id,node_id' })
        .select()
    );
    if (!up.ok) return up;

    // 批次「现在走到哪」：先记成刚完成的工序，下一步激活时会被 setCurrentNode 覆盖
    await DB.call(
      DB.get().from('production_batches')
        .update({
          current_node_id: node.id,
          current_process_name: node.process_name,
          location_updated_at: now
        })
        .eq('order_id', orderId)
    );

    return up;
  }

  /**
   * 下游节点被激活时，把批次「当前工序」推进到该节点。
   * 由 NodeActions.advance() 在 activatedNode 存在时调用。
   */
  async function setCurrentNode(orderId, nodeId, processName) {
    return DB.call(
      DB.get().from('production_batches')
        .update({
          current_node_id: nodeId,
          current_process_name: processName || null,
          location_updated_at: new Date().toISOString()
        })
        .eq('order_id', orderId)
    );
  }

  return { listByOrderId, recordNodeCompletion, setCurrentNode };
})();
