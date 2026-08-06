/* ============================================================
   DialFactory V1 · Node Actions Orchestration
   Page layer delegates all business operations here.
   Contract: 16-D3-NodeActions-API-Contract.md
   ============================================================ */

const NodeActions = (() => {

  // ==========================================================
  // M1 · advance — active → done
  // ==========================================================
  async function advance(order, node, options = {}) {
    // Validate
    const v = NodeState.validate(node.status, 'done');
    if (!v.valid) return { ok: false, error: v.error, phase: 'primary' };

    // Check qty_out for 检验
    const processType = node.process_type || node.process?.type;
    if (processType === '检验') {
      const qv = Validation.validateQtyOut(processType, options.qtyOut);
      if (!qv.valid) return { ok: false, error: qv.error, phase: 'primary' };
    }

    // Primary write
    const r1 = await OrdersAPI.updateNode(node.id, {
      status: 'done',
      qty_out: options.qtyOut ?? (node.qty_out ?? null)
    });
    if (!r1.ok) return { ok: false, error: r1.error, phase: 'primary' };
    const updatedNode = r1.data;

    // Auto-activate next waiting node (with empty dept skip — Issue I-1)
    let activatedNode = null;
    let warning = null;
    const sorted = [...(order.nodes || [])].sort((a, b) => a.seq - b.seq);
    const nextBySeq = sorted.find(n => n.seq > node.seq);

    if (nextBySeq) {
      // Same dept: activate directly
      if (nextBySeq.dept_id === node.dept_id && nextBySeq.status === 'waiting') {
        const r2 = await OrdersAPI.updateNode(nextBySeq.id, { status: 'active' });
        if (r2.ok) activatedNode = r2.data;
        else warning = 'downstream_activation_failed';
      }
      // Different dept: check if current dept is fully done
      else if (nextBySeq.dept_id !== node.dept_id) {
        const currentDeptNodes = sorted.filter(n => n.dept_id === node.dept_id);
        const allDeptDone = currentDeptNodes.every(n => n.status === 'done');
        if (allDeptDone && nextBySeq.status === 'waiting') {
          const r2 = await OrdersAPI.updateNode(nextBySeq.id, { status: 'active' });
          if (r2.ok) activatedNode = r2.data;
          else warning = 'downstream_activation_failed';
        }
      }
    }

    // Derive and update order status
    const updatedNodes = (order.nodes || []).map(n => {
      if (n.id === node.id) return updatedNode;
      if (activatedNode && n.id === activatedNode.id) return activatedNode;
      return n;
    });
    const newStatus = OrderState.derive(updatedNodes);
    const r3 = await OrdersAPI.updateStatus(order.id, newStatus);
    if (!r3.ok && !warning) warning = 'status_update_delayed';

    return { ok: true, updatedNode, activatedNode, newOrderStatus: newStatus, warning };
  }

  // ==========================================================
  // M2 · pause — active → paused
  // ==========================================================
  async function pause(order, node, pauseReason) {
    const v = NodeState.validate(node.status, 'paused');
    if (!v.valid) return { ok: false, error: v.error, phase: 'primary' };
    if (!pauseReason || typeof pauseReason !== 'string') {
      return { ok: false, error: '请选择暂停原因', phase: 'primary' };
    }

    const r1 = await OrdersAPI.updateNode(node.id, {
      status: 'paused',
      pause_reason: pauseReason
    });
    if (!r1.ok) return { ok: false, error: r1.error, phase: 'primary' };

    const updatedNodes = (order.nodes || []).map(n => n.id === node.id ? r1.data : n);
    const newStatus = OrderState.derive(updatedNodes);
    let warning = null;
    const r2 = await OrdersAPI.updateStatus(order.id, newStatus);
    if (!r2.ok) warning = 'status_update_delayed';

    return { ok: true, updatedNode: r1.data, newOrderStatus: newStatus, warning };
  }

  // ==========================================================
  // M3 · resume — paused → active
  // ==========================================================
  async function resume(order, node) {
    const v = NodeState.validate(node.status, 'active');
    if (!v.valid) return { ok: false, error: v.error, phase: 'primary' };

    const r1 = await OrdersAPI.updateNode(node.id, {
      status: 'active',
      pause_reason: null
    });
    if (!r1.ok) return { ok: false, error: r1.error, phase: 'primary' };

    const updatedNodes = (order.nodes || []).map(n => n.id === node.id ? r1.data : n);
    const newStatus = OrderState.derive(updatedNodes);
    let warning = null;
    const r2 = await OrdersAPI.updateStatus(order.id, newStatus);
    if (!r2.ok) warning = 'status_update_delayed';

    return { ok: true, updatedNode: r1.data, newOrderStatus: newStatus, warning };
  }

  // ==========================================================
  // M4 · rework — creates new active node (rework_pass+1)
  // ==========================================================
  async function rework(order, parentNode) {
    if (!NodeState.canCreateChild(parentNode.status)) {
      return { ok: false, error: '该状态不允许返工', phase: 'primary' };
    }
    if (!parentNode.process_id) {
      return { ok: false, error: '节点无关联工序，无法返工', phase: 'primary' };
    }

    // Gap-based seq
    const nodes = order.nodes || [];
    const { seq: newSeq, needsBump, bumpFrom } = SeqCalc.gapInsertion(nodes, parentNode.seq);

    // Insert
    const r1 = await OrdersAPI.insertNode({
      order_id:     order.id,
      process_id:   parentNode.process_id,
      process_name: parentNode.process_name,
      process_code: parentNode.process_code,
      dept_id:      parentNode.dept_id,
      dept_name:    parentNode.dept_name,
      seq:          newSeq,
      rework_pass:  (parentNode.rework_pass || 0) + 1,
      status:       'active',
      note:         null
    });
    if (!r1.ok) return { ok: false, error: r1.error, phase: 'primary' };
    const newNode = r1.data;

    // Seq bump if needed
    let warning = null;
    if (needsBump) {
      const r2 = await OrdersAPI.bumpSeq(order.id, bumpFrom, SeqCalc.GAP_STEP, newNode.id);
      if (!r2.ok) warning = 'seq_bump_failed';
    }

    // Update order status
    const allNodes = [...nodes, newNode];
    const newStatus = OrderState.derive(allNodes);
    const r3 = await OrdersAPI.updateStatus(order.id, newStatus);
    if (!r3.ok && !warning) warning = 'status_update_delayed';

    return { ok: true, newNode, newSeq, needsBump, newOrderStatus: newStatus, warning };
  }

  // ==========================================================
  // M5 · append — creates new active node (rework_pass=0)
  // ==========================================================
  async function append(order, parentNode, processId, reason) {
    if (!NodeState.canCreateChild(parentNode.status)) {
      return { ok: false, error: '该状态不允许追加工序', phase: 'primary' };
    }
    if (!processId) {
      return { ok: false, error: '请选择要追加的工序', phase: 'primary' };
    }

    // Fetch process details
    const { ok: pok, data: processes } = await ProcessesAPI.listProcesses();
    if (!pok) return { ok: false, error: '无法加载工序列表', phase: 'primary' };
    const proc = (processes || []).find(p => p.id === processId);
    if (!proc) return { ok: false, error: '未找到所选工序', phase: 'primary' };

    // Resolve dept name
    let deptName = '—';
    if (proc.default_dept_id) {
      const dr = await DB.call(
        DB.get().from('departments').select('name').eq('id', proc.default_dept_id).single()
      );
      if (dr.ok && dr.data) deptName = dr.data.name;
    }

    // Gap-based seq
    const nodes = order.nodes || [];
    const { seq: newSeq, needsBump, bumpFrom } = SeqCalc.gapInsertion(nodes, parentNode.seq);

    // Insert
    const r1 = await OrdersAPI.insertNode({
      order_id:     order.id,
      process_id:   proc.id,
      process_name: proc.name,
      process_code: proc.code,
      dept_id:      proc.default_dept_id,
      dept_name:    deptName,
      seq:          newSeq,
      rework_pass:  0,
      status:       'active',
      note:         reason || null
    });
    if (!r1.ok) return { ok: false, error: r1.error, phase: 'primary' };
    const newNode = r1.data;

    // Seq bump if needed
    let warning = null;
    if (needsBump) {
      const r2 = await OrdersAPI.bumpSeq(order.id, bumpFrom, SeqCalc.GAP_STEP, newNode.id);
      if (!r2.ok) warning = 'seq_bump_failed';
    }

    // Update order status
    const allNodes = [...nodes, newNode];
    const newStatus = OrderState.derive(allNodes);
    const r3 = await OrdersAPI.updateStatus(order.id, newStatus);
    if (!r3.ok && !warning) warning = 'status_update_delayed';

    return { ok: true, newNode, newSeq, needsBump, newOrderStatus: newStatus, warning };
  }

  // ==========================================================
  // M6 · recordException — append-only, no node/order status change
  // ==========================================================
  async function recordException(nodeId, eventData) {
    if (!nodeId) return { ok: false, error: '缺少节点ID', phase: 'primary' };
    if (!eventData || !eventData.type) return { ok: false, error: '请选择缺陷类型', phase: 'primary' };
    const qty = Number(eventData.qty);
    if (!Number.isInteger(qty) || qty <= 0) return { ok: false, error: '影响数量必须是正整数', phase: 'primary' };

    const r = await ExceptionsAPI.create({
      node_id:    nodeId,
      type:       eventData.type,
      qty:        qty,
      resolution: eventData.resolution || ''
    });
    if (!r.ok) return { ok: false, error: r.error, phase: 'primary' };

    return { ok: true, exception: r.data };
  }

  // ==========================================================
  // M7 · undo — reverse last status change within time window
  // ==========================================================
  async function undo(order, node) {
    const UNDO_MS = (CONFIG.UNDO_WINDOW_MINUTES || 5) * 60 * 1000;
    const elapsed = Date.now() - new Date(node.updated_at).getTime();
    if (elapsed > UNDO_MS) {
      return { ok: false, error: '已超过撤销时间窗口', phase: 'timeout' };
    }

    // F2: completed order
    if (order.status === 'completed') {
      return { ok: false, error: '已完成订单不可撤销', phase: 'forbidden' };
    }
    // F3: cancelled order
    if (order.status === 'cancelled') {
      return { ok: false, error: '已取消订单不可撤销', phase: 'forbidden' };
    }
    // F5: rework nodes in a segment batch
    if (node.rework_pass > 0) {
      return { ok: false, error: '返工节点不可单独撤销', phase: 'forbidden' };
    }

    const undoMap = {
      'done':   { target: 'active',  cascade: true },
      'paused': { target: 'active',  cascade: false },
      'active': { target: 'waiting', cascade: false }
    };
    const action = undoMap[node.status];
    if (!action) return { ok: false, error: '当前状态不支持撤销', phase: 'primary' };

    // F4/F6: check downstream
    if (action.cascade) {
      const nodes = (order.nodes || []).sort((a, b) => a.seq - b.seq);
      const nextNode = nodes.find(n => n.seq > node.seq);
      if (nextNode && nextNode.status !== 'waiting' && nextNode.status !== 'active') {
        return { ok: false, error: '下游节点已开始处理，无法撤销', phase: 'forbidden' };
      }
    }

    // Execute undo
    const r1 = await OrdersAPI.updateNode(node.id, {
      status: action.target,
      pause_reason: null
    });
    if (!r1.ok) return { ok: false, error: r1.error, phase: 'primary' };

    // Cascade: deactivate downstream if it was auto-activated
    let warning = null;
    if (action.cascade) {
      const nodes = (order.nodes || []).sort((a, b) => a.seq - b.seq);
      const nextNode = nodes.find(n => n.seq > node.seq);
      if (nextNode && nextNode.status === 'active') {
        const r2 = await OrdersAPI.updateNode(nextNode.id, { status: 'waiting' });
        if (!r2.ok) warning = 'downstream_deactivation_failed';
      }
    }

    const updatedNodes = (order.nodes || []).map(n => {
      if (n.id === node.id) return r1.data;
      return n;
    });
    const newStatus = OrderState.derive(updatedNodes, order.status);
    await OrdersAPI.updateStatus(order.id, newStatus);

    return { ok: true, updatedNode: r1.data, newOrderStatus: newStatus, warning };
  }

  // ==========================================================
  // M8 · reworkSegment — batch rework for department segment
  // ==========================================================
  async function reworkSegment(order, failedNode, restartCode) {
    if (!failedNode.process_id) {
      return { ok: false, error: '节点无关联工序', phase: 'primary' };
    }

    const nodes = (order.nodes || []).sort((a, b) => a.seq - b.seq);
    const deptNodes = nodes.filter(n => n.dept_id === failedNode.dept_id);
    if (deptNodes.length === 0) {
      return { ok: false, error: '无法确定部门工序段', phase: 'primary' };
    }

    // Determine range: from restartCode (or first dept process) to failedNode
    const rangeStart = restartCode
      ? deptNodes.find(n => n.process_code === restartCode)
      : deptNodes[0];
    if (!rangeStart) {
      return { ok: false, error: '未找到返工起始工序', phase: 'primary' };
    }

    const rangeNodes = deptNodes.filter(n =>
      n.seq >= rangeStart.seq && n.seq <= failedNode.seq
    );
    if (rangeNodes.length === 0) {
      return { ok: false, error: '返工范围为空', phase: 'primary' };
    }

    // Batch INSERT new nodes
    const basePass = (failedNode.rework_pass || 0) + 1;
    const { seq: newSeq, needsBump, bumpFrom } = SeqCalc.gapInsertion(nodes, failedNode.seq);

    let currentSeq = newSeq;
    let firstNewId = null;

    for (const orig of rangeNodes) {
      const r = await OrdersAPI.insertNode({
        order_id:     order.id,
        process_id:   orig.process_id,
        process_name: orig.process_name,
        process_code: orig.process_code,
        dept_id:      orig.dept_id,
        dept_name:    orig.dept_name,
        seq:          currentSeq,
        rework_pass:  basePass,
        status:       (orig === rangeNodes[0]) ? 'active' : 'waiting',
        note:         `Segment rework from ${rangeStart.process_code}`
      });
      if (!r.ok) return { ok: false, error: r.error, phase: 'primary' };
      if (!firstNewId) firstNewId = r.data.id;
      currentSeq += 2; // micro-gap within segment
    }

    // Bump if needed
    let warning = null;
    if (needsBump) {
      const br = await OrdersAPI.bumpSeq(order.id, bumpFrom, SeqCalc.GAP_STEP, firstNewId);
      if (!br.ok) warning = 'seq_bump_failed';
    }

    const allNodes = [...nodes, ...rangeNodes.map(() => ({}))]; // placeholder
    const newStatus = OrderState.derive(nodes, order.status);
    await OrdersAPI.updateStatus(order.id, newStatus);

    return { ok: true, newSeq, needsBump, newOrderStatus: newStatus, warning };
  }

  return { advance, pause, resume, rework, append, recordException, undo, reworkSegment };
})();
