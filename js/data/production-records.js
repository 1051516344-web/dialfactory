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
   * First process gets status '生产中' with created_at=now; rest = '待生产'.
   */
  async function createForOrder(orderId, nodes) {
    const now = new Date().toISOString();
    // B5: link each record to its node_id (rework/append can reuse a process name).
    // Sort by seq so the initially-active node (first) becomes '生产中'.
    const ordered = [...nodes].sort((a, b) => (a.seq || 0) - (b.seq || 0));
    const rows = ordered.map((node, i) => ({
      order_id: orderId,
      node_id: node.id || node.node_id || null,
      process_name: node.process_name,
      status: i === 0 ? '生产中' : '待生产',
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

  return {
    create, createForOrder, update, listByOrderId,
    listActive, getRecentActivity, getTodayCompleted
  };
})();
