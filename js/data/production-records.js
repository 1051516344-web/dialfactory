/* ============================================================
   DialFactory V1 · Production Records API
   Phase 4: Process-level time tracking (independent of order_nodes)
   （Phase 3-E 的 getProductionOverview 聚合查询已于 2026-11 死代码清理中删除）
   ============================================================ */

const ProductionRecordsAPI = (() => {

  /**
   * Create a single production record.
   * Called on order creation (first process) or on "开始生产" button.
   */
  async function create(record) {
    return DB.call(
      DB.get().from('production_records').insert(record).select().single()
    );
  }

  /**
   * Batch-create production records for all processes in an order.
   * 全部初始为「待生产」——建单那一刻没人开工；记录由 advance() 在节点完成时收口。
   */
  async function createForOrder(orderId, nodes) {
    const now = new Date().toISOString();
    // B5: link each record to its node_id (rework/append can reuse a process name).
    const ordered = [...nodes].sort((a, b) => (a.seq || 0) - (b.seq || 0));
    const rows = ordered.map((node) => ({
      order_id: orderId,
      node_id: node.id || node.node_id || null,
      process_name: node.process_name,
      status: '待生产',
      created_at: now
    }));
    return DB.call(
      DB.get().from('production_records').insert(rows).select()
    );
  }

  /**
   * Update a production record. Auto-manages timestamps and duration.
   * When completing: sets completed_at=now, calculates duration_minutes.
   */
  async function update(id, fields) {
    const updates = { ...fields };
    const now = new Date().toISOString();

    if (updates.status === '生产中' && !updates.created_at) {
      updates.created_at = now;
    }
    if (updates.status === '已完成') {
      if (!updates.completed_at) updates.completed_at = now;
      // Fetch current record to get created_at for duration calculation
      const { ok, data: current } = await DB.call(
        DB.get().from('production_records').select('created_at').eq('id', id).single()
      );
      if (ok && current && current.created_at) {
        const start = new Date(current.created_at);
        const end = new Date(updates.completed_at);
        updates.duration_minutes = Math.round((end - start) / (1000 * 60));
      }
    }

    return DB.call(
      DB.get().from('production_records')
        .update(updates).eq('id', id).select().single()
    );
  }

  /**
   * Get all production records for a single order, ordered by creation time.
   */
  async function listByOrderId(orderId) {
    return DB.call(
      DB.get().from('production_records')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })
    );
  }

  /**
   * Get all records with status = '生产中', joined with orders for display.
   */
  async function listActive() {
    return DB.call(
      DB.get().from('production_records')
        .select('id, order_id, process_name, status, created_at, order:orders(order_no, customer_id)')
        .eq('status', '生产中')
        .order('created_at', { ascending: true })
    );
  }

  /**
   * Get recent activity feed (status changes, newest first).
   */
  async function getRecentActivity(limit = 20) {
    return DB.call(
      DB.get().from('production_records')
        .select('id, order_id, process_name, status, created_at, completed_at, order:orders(order_no)')
        .order('created_at', { ascending: false })
        .limit(limit)
    );
  }

  /**
   * Count today's completed production records.
   */
  async function getTodayCompleted() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return DB.call(
      DB.get().from('production_records')
        .select('id', { count: 'exact', head: true })
        .eq('status', '已完成')
        .gte('completed_at', todayStart.toISOString())
    );
  }

  /**
   * 节点完成时自动收口生产记录（幂等）。由 NodeActions.advance() 调用。
   * - 有「待生产 / 生产中」记录 → 置「已完成」（DB 触发器补 completed_at + duration_minutes）
   * - 无记录（追加/返工新增的节点）→ 补建一条「已完成」
   *   注意：duration 触发器只挂在 BEFORE UPDATE 上，INSERT 不触发，
   *   所以这里必须显式写 completed_at / duration_minutes。
   * - 已是「已完成」→ 原样返回，不重复写
   */
  async function closeForNode(orderId, node, extra) {
    const opts = extra || {};
    const q = await DB.call(
      DB.get().from('production_records')
        .select('id, status')
        .eq('order_id', orderId)
        .eq('node_id', node.id)
        .order('created_at', { ascending: false })
        .limit(1)
    );
    const existing = q.ok && q.data && q.data[0];

    const fields = { status: '已完成' };
    if (opts.goodQty != null) fields.good_qty = opts.goodQty;
    if (opts.badQty != null) fields.bad_qty = opts.badQty;

    if (existing) {
      if (existing.status === '已完成') return { ok: true, data: existing, skipped: true };
      const res = await update(existing.id, fields);
      await recordBatchProgress(orderId, node, opts);
      return res;
    }

    const now = new Date().toISOString();
    // 时间起点用节点最后一次状态变更时间（≈ 变 active 的时刻），而不是「现在」
    const startedAt = node.updated_at || node.created_at || now;
    const row = {
      order_id: orderId,
      node_id: node.id,
      process_name: node.process_name,
      status: '已完成',
      created_at: startedAt,
      completed_at: now,
      duration_minutes: Math.max(0, Math.round((new Date(now) - new Date(startedAt)) / 60000))
    };
    if (opts.goodQty != null) row.good_qty = opts.goodQty;
    if (opts.badQty != null) row.bad_qty = opts.badQty;
    const created = await create(row);
    await recordBatchProgress(orderId, node, opts);
    return created;
  }

  /**
   * P1：节点收口后按批次记一笔（幂等）。失败不影响主流程，只记警告。
   */
  async function recordBatchProgress(orderId, node, opts) {
    if (typeof BatchProgressAPI === 'undefined' || !BatchProgressAPI.recordNodeCompletion) return;
    try {
      const bp = await BatchProgressAPI.recordNodeCompletion(orderId, node, {
        qtyOut: opts.qtyOut,
        goodQty: opts.goodQty,
        badQty: opts.badQty,
        perBatch: opts.perBatch
      });
      if (!bp || !bp.ok) console.warn('[DB] 批次记账失败:', bp && bp.error);
    } catch (e) {
      console.warn('[DB] 批次记账异常:', e && e.message);
    }
  }

  /**
   * 撤销「完成」时把记录退回「生产中」，否则下次完成会被幂等逻辑跳过。
   * 由 NodeActions.undo() 调用。
   */
  async function reopenForNode(orderId, nodeId) {
    const q = await DB.call(
      DB.get().from('production_records')
        .select('id, status')
        .eq('order_id', orderId)
        .eq('node_id', nodeId)
        .order('created_at', { ascending: false })
        .limit(1)
    );
    const rec = q.ok && q.data && q.data[0];
    if (!rec || rec.status !== '已完成') return { ok: true, skipped: true };
    return DB.call(
      DB.get().from('production_records')
        .update({ status: '生产中', completed_at: null, duration_minutes: null })
        .eq('id', rec.id)
        .select()
        .single()
    );
  }

  return {
    create, createForOrder, update, closeForNode, reopenForNode, listByOrderId,
    listActive, getRecentActivity, getTodayCompleted
  };
})();
