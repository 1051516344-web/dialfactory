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
    // P0-FIX: Explicit columns — exclude large route_snapshot JSONB
    const ORDER_LIST_COLS = 'id,order_no,customer_id,order_qty,due_date,base_texture,plate_color,specs,status,note,created_at,updated_at';
    let query = db.from('orders')
      .select(`${ORDER_LIST_COLS}, customer:customers(name, short_name)`, { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    } else {
      // 方案 A：默认视图只显示在产订单（in_production / paused），排除终态 completed / cancelled。
      // 手动筛选状态时走上分支，故「已完成 / 已取消」仍可正常查看。
      // 用 .in() 而非 .not()/.or()：本项目已验证 .in() 可用，规避嵌套过滤语法风险。
      query = query.in('status', ['in_production', 'paused']);
    }
    if (customerId) query = query.eq('customer_id', customerId);
    if (search)   query = query.ilike('order_no', `%${search}%`);
    if (deptOrderIds) query = query.in('id', deptOrderIds);

    // 最久未更新优先分页（与前端 sortOrders 的 updated_at 升序一致）
    query = query.order('updated_at', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    return DB.call(query);
  }

  /**
   * Get single order with all nodes.
   */
  async function getById(orderId) {
    const db = DB.get();

    // 不取 route_snapshot：前端全仓只写不读，且它是较大的 JSONB —— 白白增加跨境传输量。
    // （若将来详情页需要展示原始路线快照，再按需单独查询，勿加回列表列。）
    const [orderResult, nodesResult] = await Promise.all([
      DB.call(
        db.from('orders')
          .select('id,order_no,customer_id,order_qty,due_date,base_texture,plate_color,specs,status,note,created_at,updated_at, customer:customers(name, short_name)')
          .eq('id', orderId)
          // maybeSingle：id 不存在时返回 data=null，而不是 406（PGRST116）
          .maybeSingle()
      ),
      DB.call(
        db.from('order_nodes')
          .select('id,order_id,process_id,process_name,process_code,dept_id,dept_name,seq,rework_pass,status,pause_reason,qty_out,note,created_at,updated_at, process:processes(type)')
          .eq('order_id', orderId)
          .order('seq', { ascending: true })
      )
    ]);

    // 失败必须分成两类：① 请求真的报错（权限/JWT/网络）② 请求成功但 0 行。
    // 绝不能再把二者都当成"订单不存在"。
    if (!orderResult.ok) {
      const msg = String(orderResult.error || '');
      const isAuthIssue = /jwt|token|auth|permission|denied|policy|rls|anon/i.test(msg);
      return {
        ok: false,
        phase: isAuthIssue ? 'auth' : 'query',
        error: isAuthIssue ? '登录状态异常或无权读取该订单：' + msg : msg
      };
    }
    if (!orderResult.data) {
      // 0 行且无报错：RLS 拦截不会返回 error，只会返回空集（关键坑）。
      // 先确认会话，再用「能否读到任意订单」做一次探针，区分权限问题与真的不存在。
      const session = await DB.awaitSession();
      if (!session) {
        return { ok: false, phase: 'auth', error: '登录状态未就绪或已过期（未检测到有效会话），请刷新后重新登录' };
      }
      const probe = await DB.call(
        DB.get().from('orders').select('id', { count: 'exact', head: true })
      );
      if (probe.ok && (probe.count || 0) === 0) {
        return { ok: false, phase: 'auth', error: '当前登录身份读不到任何订单（疑似会话/权限异常），请刷新或重新登录后重试' };
      }
      const hasNodes = nodesResult.ok && Array.isArray(nodesResult.data) && nodesResult.data.length > 0;
      if (hasNodes) {
        return { ok: false, phase: 'data', error: '订单数据读取异常（检测到该订单的工序记录，但读不到订单主体），请刷新重试' };
      }
      return { ok: false, phase: 'not_found', error: '订单不存在或已被删除（' + orderId + '）' };
    }

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
   * Exact order_no lookup (idempotent dedup check — B18).
   */
  async function getByOrderNo(orderNo) {
    return DB.call(
      DB.get().from('orders').select('id').eq('order_no', orderNo).maybeSingle()
    );
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
   * Delete a single node — 用于移除误加且尚未开始的工序。
   * production_records.node_id 为 ON DELETE SET NULL（迁移 011），历史记录会保留；
   * order_nodes.seq 为 GAP_STEP=10 的间隙制，删除后留空号无需重排。
   */
  async function deleteNode(nodeId) {
    return DB.call(
      DB.get().from('order_nodes')
        .delete()
        .eq('id', nodeId)
        .select('id')
    );
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

    // Step 0: Delete production_records (FK order_id RESTRICT blocks order delete)
    const r0 = await DB.call(
      db.from('production_records').delete().eq('order_id', orderId)
    );
    if (!r0.ok) return { ok: false, error: 'Failed to delete production records', phase: 'production_records' };

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

    // Step 2b: Remove this order from route templates' associated_orders
    const { data: templates } = await DB.call(
      db.from('process_route_templates').select('id, associated_orders').contains('associated_orders', [orderId])
    );
    if (templates && templates.length > 0) {
      for (const t of templates) {
        const remaining = (t.associated_orders || []).filter(id => id !== orderId);
        await DB.call(db.from('process_route_templates').update({ associated_orders: remaining }).eq('id', t.id));
      }
    }

    // Step 2c: Delete batches + batch relations BEFORE the order.
    // production_batches.order_id is ON DELETE RESTRICT — an order with batches
    // cannot be deleted, which previously left the order half-deleted (nodes gone,
    // order row + batches still present). batch_progress cascades from batches.
    const { data: batches } = await DB.call(
      db.from('production_batches').select('id').eq('order_id', orderId)
    );
    const batchIds = (batches || []).map(b => b.id);
    if (batchIds.length > 0) {
      const rRel = await DB.call(db.from('batch_relations').delete().in('source_batch_id', batchIds));
      if (!rRel.ok) return { ok: false, error: 'Failed to delete batch relations', phase: 'batch_relations' };
      const rRel2 = await DB.call(db.from('batch_relations').delete().in('target_batch_id', batchIds));
      if (!rRel2.ok) return { ok: false, error: 'Failed to delete batch relations', phase: 'batch_relations' };
    }
    const rB = await DB.call(db.from('production_batches').delete().eq('order_id', orderId));
    if (!rB.ok) return { ok: false, error: 'Failed to delete batches', phase: 'batches' };

    // Step 3: Delete order
    const r3 = await DB.call(
      db.from('orders').delete().eq('id', orderId)
    );
    if (!r3.ok) return { ok: false, error: 'Failed to delete order', phase: 'order' };

    return { ok: true };
  }

  // ==========================================================
  // 巡检记录（order_inspections）—— 辅助信息，不写 orders 表
  // ==========================================================
  /** 今天（含）之后已巡检的记录，用于首页「今日已巡」标记 */
  async function listInspectedSince(sinceIso) {
    return DB.call(
      DB.get().from('order_inspections')
        .select('order_id, inspected_at')
        .gte('inspected_at', sinceIso)
    );
  }

  /** 某订单最近一次巡检（详情页显示「上次巡检：…」） */
  async function getLastInspection(orderId) {
    return DB.call(
      DB.get().from('order_inspections')
        .select('id, order_id, inspected_at')
        .eq('order_id', orderId)
        .order('inspected_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    );
  }

  /** 记录一次巡检（追加一行） */
  async function markInspected(orderId) {
    return DB.call(
      DB.get().from('order_inspections')
        .insert({ order_id: orderId })
        .select()
        .single()
    );
  }

  return { list, getById, getByOrderNo, getNodeStats, updateStatus, updateNode, insertNode, deleteNode, bumpSeq, createOrder, deleteOrder,
           listInspectedSince, getLastInspection, markInspected };
})();
