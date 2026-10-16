/* ============================================================
   DialFactory V1 · Production Records API
   Phase 4: Process-level time tracking (independent of order_nodes)
   Phase 3-E: getProductionOverview for unified dashboard data
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
   * Get records where status='生产中' and created_at exceeds stall threshold.
   * (Kept for potential future use — not shown on dashboard by default.)
   */
  async function getStalled(hours) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    return DB.call(
      DB.get().from('production_records')
        .select('id, order_id, process_name, created_at, order:orders(order_no)')
        .eq('status', '生产中')
        .lt('created_at', cutoff)
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
   * Get active count per process_name, grouped by PROCESS_CONFIG order.
   */
  async function getProcessGrouped() {
    const { ok, data } = await DB.call(
      DB.get().from('production_records')
        .select('process_name, order:orders(order_no)')
        .eq('status', '生产中')
        .order('created_at', { ascending: true })
    );
    if (!ok) return { ok: false, error: data };

    const groups = {};
    for (const r of data) {
      if (!groups[r.process_name]) {
        groups[r.process_name] = { count: 0, orders: [] };
      }
      groups[r.process_name].count++;
      if (r.order) groups[r.process_name].orders.push(r.order.order_no);
    }

    const ordered = {};
    for (const name of CONFIG.PROCESS_CONFIG) {
      if (groups[name]) ordered[name] = groups[name];
    }
    for (const name of Object.keys(groups).sort()) {
      if (!ordered[name]) ordered[name] = groups[name];
    }
    return { ok: true, data: ordered };
  }

  // ==========================================================
  // Phase 3-E: Production Overview (unified data for dashboard)
  // ==========================================================

  /**
   * Get comprehensive production overview for the dashboard.
   *
   * Key principle: production orders are defined by orders.status,
   * NOT by the existence of production_records. This ensures old
   * orders (created before production_records existed) are counted.
   *
   * Old orders without production_records show process_name='未录入'.
   * No fake records are created — the data is kept clean.
   */
  async function getProductionOverview() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStr = todayStart.toISOString();

    const [
      runningResult,
      todayCompletedResult,
      activeRecordsResult,
      nonCompletedResult,
      recentActivityResult,
      anyRecordResult,
      cancelledResult
    ] = await Promise.all([
      // 1. Count currently-running orders (exclude paused — B19)
      DB.call(
        DB.get().from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'in_production')
      ),
      // 2. Count orders completed today
      DB.call(
        DB.get().from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'completed')
          .gte('updated_at', todayStr)
      ),
      // 3. Active production records with order info
      DB.call(
        DB.get().from('production_records')
          .select('id, order_id, process_name, status, created_at, order:orders(order_no, status, specs, base_texture, plate_color)')
          .eq('status', '生产中')
          .order('created_at', { ascending: true })
      ),
      // 4. All non-completed orders (for pending count + merging old orders)
      DB.call(
        DB.get().from('orders')
          .select('id, order_no, status, specs, base_texture, plate_color, created_at, customer_id')
          .or('status.is.null,status.neq.completed')
          .order('created_at', { ascending: false })
      ),
      // 5. Recent activity (last 30)
      DB.call(
        DB.get().from('production_records')
          .select('id, order_id, process_name, status, created_at, completed_at, order:orders(order_no)')
          .order('created_at', { ascending: false })
          .limit(30)
      ),
      // 6. All order_ids that have ANY production record (for pending count)
      DB.call(
        DB.get().from('production_records')
          .select('order_id')
      ),
      // 7. Count cancelled orders (#6 dashboard card)
      DB.call(
        DB.get().from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'cancelled')
      )
    ]);

    const runningCount   = runningResult.ok ? (runningResult.count || 0) : 0;
    const todayCompleted = todayCompletedResult.ok ? (todayCompletedResult.count || 0) : 0;
    const activeRecords  = activeRecordsResult.ok ? (activeRecordsResult.data || []) : [];
    const nonCompleted   = nonCompletedResult.ok ? (nonCompletedResult.data || []) : [];
    const recentActivity = recentActivityResult.ok ? (recentActivityResult.data || []) : [];
    const anyRecordOrderIds = new Set((anyRecordResult.ok ? (anyRecordResult.data || []) : []).map(r => r.order_id));
    const cancelledOrders = cancelledResult.ok ? (cancelledResult.count || 0) : 0;

    // Process distribution from active records
    const processDist = {};
    for (const r of activeRecords) {
      processDist[r.process_name] = (processDist[r.process_name] || 0) + 1;
    }

    // Build current production list
    const activeOrderIds = new Set(activeRecords.map(r => r.order_id));

    // Step A: orders with active production records
    const currentProduction = activeRecords.map(r => ({
      order_id: r.order_id,
      order_no: r.order?.order_no || r.order_id.slice(0, 8),
      customer_id: r.order?.customer_id || '',
      specs: r.order?.specs || {},
      base_texture: r.order?.base_texture || '',
      plate_color: r.order?.plate_color || '',
      process_name: r.process_name,
      status: r.status,
      created_at: r.created_at,
      source: 'production_record'
    }));

    // Step B: non-completed orders WITHOUT any production record → show "未录入"
    for (const o of nonCompleted) {
      if (!anyRecordOrderIds.has(o.id)) {
        currentProduction.push({
          order_id: o.id,
          order_no: o.order_no,
          customer_id: o.customer_id || '',
          specs: o.specs || {},
          base_texture: o.base_texture || '',
          plate_color: o.plate_color || '',
          process_name: '未录入',
          status: '未录入',
          created_at: o.created_at,
          source: 'order_only'
        });
      }
    }

    // Pending count: non-completed orders without any production record (B19)
    const pendingCount = nonCompleted.filter(o => !anyRecordOrderIds.has(o.id)).length;

    return {
      ok: true,
      data: {
        totalRunningOrders: runningCount,
        todayCompleted,
        pendingOrders: pendingCount,
        cancelledOrders,
        todayActiveProcesses: Object.keys(processDist).length,
        activeProcesses: processDist,
        currentProduction,
        recentActivity
      }
    };
  }

  return {
    create, createForOrder, update, listByOrderId,
    listActive, getStalled, getRecentActivity, getTodayCompleted, getProcessGrouped,
    getProductionOverview
  };
})();
