/* ============================================================
   DialFactory V1 · Orders & Order Nodes API
   ============================================================ */

const OrdersAPI = (() => {

  /**
   * List orders with pagination and optional filters.
   * Returns { ok, data: Order[], count }
   */
  async function list({ status, customerId, search, deptId, page = 0, pageSize = 20 } = {}) {
    const db = DB.get();

    // If dept filter: find order_ids with active nodes in that dept first
    let deptOrderIds = null;
    if (deptId) {
      const { ok, data: nodeOrders } = await DB.call(
        db.from('order_nodes')
          .select('order_id')
          .eq('dept_id', deptId)
          .eq('status', 'active')
      );
      if (!ok) return { ok: false, error: 'Department filter failed', data: [] };
      deptOrderIds = [...new Set((nodeOrders || []).map(n => n.order_id))];
      if (deptOrderIds.length === 0) return { ok: true, data: [], count: 0 };
    }

    // Build query
    let query = db.from('orders')
      .select('*, customer:customers(name, short_name)', { count: 'exact' });

    if (status)   query = query.eq('status', status);
    if (customerId) query = query.eq('customer_id', customerId);
    if (search)   query = query.ilike('order_no', `%${search}%`);
    if (deptOrderIds) query = query.in('id', deptOrderIds);

    query = query.order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    return DB.call(query);
  }

  /**
   * Get single order with all nodes.
   */
  async function getById(orderId) {
    const db = DB.get();

    const [orderResult, nodesResult] = await Promise.all([
      DB.call(
        db.from('orders')
          .select('*, customer:customers(name, short_name)')
          .eq('id', orderId)
          .single()
      ),
      DB.call(
        db.from('order_nodes')
          .select('*')
          .eq('order_id', orderId)
          .order('seq', { ascending: true })
      )
    ]);

    if (!orderResult.ok) return orderResult;

    return {
      ok: true,
      data: {
        ...orderResult.data,
        nodes: nodesResult.ok ? nodesResult.data : []
      }
    };
  }

  /**
   * Get node stats for a batch of order IDs.
   * CONSTRAINT D-2-001: Always batch. Never call per-order in a loop.
   */
  async function getNodeStats(orderIds) {
    if (!orderIds || orderIds.length === 0) {
      return { ok: true, data: {} };
    }

    const db = DB.get();
    const { ok, data: nodes, error } = await DB.call(
      db.from('order_nodes')
        .select('order_id, status, seq, process_name, dept_name, updated_at')
        .in('order_id', orderIds)
        .order('seq', { ascending: true })
    );

    if (!ok) return { ok: false, error, data: {} };

    // Aggregate per order
    const stats = {};
    for (const orderId of orderIds) {
      const orderNodes = (nodes || []).filter(n => n.order_id === orderId).sort((a, b) => a.seq - b.seq);
      stats[orderId] = buildStats(orderNodes);
    }

    return { ok: true, data: stats };
  }

  function buildStats(nodes) {
    if (!nodes || nodes.length === 0) {
      return {
        total: 0, done: 0, active: 0, paused: 0, waiting: 0,
        currentNode: null, isStalled: false, stalledDays: 0,
        hasNodes: false
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

    return {
      ...counts,
      currentNode: currentNode ? {
        process_name: currentNode.process_name,
        dept_name: currentNode.dept_name,
        updated_at: currentNode.updated_at
      } : null,
      isStalled,
      stalledDays,
      hasNodes: true
    };
  }

  /**
   * Update order status (used after node mutations elsewhere)
   */
  async function updateStatus(orderId, status) {
    return DB.call(
      DB.get().from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', orderId)
    );
  }

  /**
   * Update a single node's fields.
   */
  async function updateNode(nodeId, fields) {
    return DB.call(
      DB.get().from('order_nodes')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', nodeId)
        .select()
        .single()
    );
  }

  /**
   * Insert a new node (rework / append).
   * Writes only columns that exist in order_nodes table.
   */
  async function insertNode(nodeData) {
    const row = {
      order_id:     nodeData.order_id,
      process_id:   nodeData.process_id,
      process_name: nodeData.process_name,
      process_code: nodeData.process_code,
      dept_id:      nodeData.dept_id,
      dept_name:    nodeData.dept_name,
      seq:          nodeData.seq,
      rework_pass:  nodeData.rework_pass,
      status:       nodeData.status || 'active',
      note:         nodeData.note || null
    };
    return DB.call(
      DB.get().from('order_nodes')
        .insert(row)
        .select()
        .single()
    );
  }

  /**
   * Bump seq for nodes in an order.
   * UPDATE order_nodes SET seq = seq + delta
   * WHERE order_id = ? AND seq >= fromSeq AND id != excludeId
   */
  async function bumpSeq(orderId, fromSeq, delta, excludeId) {
    // PostgREST doesn't support batch UPDATE with expressions.
    // Fetch affected nodes, update individually.
    const { ok, data: affected } = await DB.call(
      DB.get().from('order_nodes')
        .select('id, seq')
        .eq('order_id', orderId)
        .gte('seq', fromSeq)
        .neq('id', excludeId || '')
    );
    if (!ok || !affected || affected.length === 0) return { ok: true };

    for (const n of affected) {
      const r = await DB.call(
        DB.get().from('order_nodes')
          .update({ seq: n.seq + delta })
          .eq('id', n.id)
      );
      if (!r.ok) return { ok: false, error: `Seq bump failed at node ${n.id.slice(0,8)}` };
    }
    return { ok: true };
  }

  /**
   * Create order with nodes. Compensatory rollback on failure.
   * REVISION 1: Single-transaction semantics.
   */
  async function createOrder(orderData, nodesData) {
    const db = DB.get();

    // Step A: INSERT order
    const r1 = await DB.call(
      db.from('orders').insert(orderData).select().single()
    );
    if (!r1.ok) return { ok: false, error: r1.error, phase: 'order_insert' };
    const order = r1.data;

    // Step B: INSERT nodes (batch, with order_id)
    const rows = nodesData.map(n => ({
      order_id:     order.id,
      process_id:   n.process_id,
      process_name: n.process_name,
      process_code: n.process_code,
      dept_id:      n.dept_id,
      dept_name:    n.dept_name,
      seq:          n.seq,
      rework_pass:  n.rework_pass || 0,
      status:       n.status || 'waiting',
      note:         n.note || null
    }));

    const r2 = await DB.call(
      db.from('order_nodes').insert(rows).select()
    );
    if (!r2.ok) {
      // Rollback: delete orphaned order
      await DB.call(db.from('orders').delete().eq('id', order.id));
      return { ok: false, error: r2.error, phase: 'nodes_insert' };
    }

    return { ok: true, data: { order, nodes: r2.data } };
  }

  /**
   * Delete order manually (trial safety patch).
   * Follows FK RESTRICT order: exceptions -> nodes -> order.
   * Safety rules enforced by CALLER (not API layer).
   */
  async function deleteOrder(orderId) {
    const db = DB.get();

    // Step 1: Delete exception_events for this order's nodes
    const { data: nodes } = await DB.call(
      db.from('order_nodes').select('id').eq('order_id', orderId)
    );
    const nodeIds = (nodes || []).map(n => n.id);
    if (nodeIds.length > 0) {
      const r1 = await DB.call(
        db.from('exception_events').delete().in('node_id', nodeIds)
      );
      if (!r1.ok) return { ok: false, error: 'Failed to delete exceptions', phase: 'exceptions' };
    }

    // Step 2: Delete order_nodes
    const r2 = await DB.call(
      db.from('order_nodes').delete().eq('order_id', orderId)
    );
    if (!r2.ok) return { ok: false, error: 'Failed to delete nodes', phase: 'nodes' };

    // Step 3: Delete order
    const r3 = await DB.call(
      db.from('orders').delete().eq('id', orderId)
    );
    if (!r3.ok) return { ok: false, error: 'Failed to delete order', phase: 'order' };

    return { ok: true };
  }

  return { list, getById, getNodeStats, updateStatus, updateNode, insertNode, bumpSeq, createOrder, deleteOrder };
})();
