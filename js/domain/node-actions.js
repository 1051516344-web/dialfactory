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

    // Auto-activate next waiting node
    let activatedNode = null;
    let warning = null;
    const sorted = [...(order.nodes || [])].sort((a, b) => a.seq - b.seq);
    const nextNode = sorted.find(n => n.seq > node.seq);
    if (nextNode && nextNode.status === 'waiting') {
      const r2 = await OrdersAPI.updateNode(nextNode.id, { status: 'active' });
      if (r2.ok) {
        activatedNode = r2.data;
      } else {
        warning = 'downstream_activation_failed';
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

  return { advance, pause, resume, rework, append, recordException };
})();
