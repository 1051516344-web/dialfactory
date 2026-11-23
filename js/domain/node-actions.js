/* ============================================================
   DialFactory V1 · Node Actions Orchestration
   Page layer delegates all business operations here.
   Contract: 16-D3-NodeActions-API-Contract.md
   ============================================================ */

const NodeActions = (() => {

  /**
   * 单 active 守卫（序列模型约束）：同一订单同一时刻只允许一个 active 节点。
   * 返回 null 表示通过，否则返回错误对象。
   *
   * 背景（P0）：原先只有 activate() 有守卫，resume()/undo() 没有 ——
   * 于是「暂停 A → 激活 B → 恢复 A」可以在 UI 上点出双 active，且无任何报错。
   * 现在三个入口共用同一实现，杜绝该路径。
   */
  function guardSingleActive(order, nodeId) {
    const running = (order.nodes || []).find(n => n.id !== nodeId && n.status === 'active');
    if (!running) return null;
    const label = running.process_code || running.process_name || '—';
    return { ok: false, error: '已有进行中的工序（' + label + '），请先完成或暂停它', phase: 'forbidden' };
  }

  /**
   * 节点变成 active 时记录「真实开工时间」（失败不阻塞推进）。
   * 幂等：已有 started_at 不会被覆盖（暂停→恢复不重置开工时间）。
   */
  async function markStarted(orderId, node) {
    if (typeof ProductionRecordsAPI === 'undefined' || !ProductionRecordsAPI.markStartedForNode) return;
    try {
      const r = await ProductionRecordsAPI.markStartedForNode(orderId, node);
      if (!r || !r.ok) console.warn('[node-actions] 开工时间写入失败:', r && r.error);
    } catch (e) {
      console.warn('[node-actions] 开工时间写入异常:', e && e.message);
    }
  }

  /** 追加一条工序事件（生产轨迹的唯一事实源；失败不阻塞） */
  async function logEvent(orderId, node, event, extra) {
    if (typeof NodeEventsAPI === 'undefined' || !NodeEventsAPI.record) return;
    const opts = extra || {};
    try {
      await NodeEventsAPI.record({
        order_id: orderId,
        node_id: node && node.id ? node.id : null,
        process_name: node && node.process_name ? node.process_name : null,
        event: event,
        from_status: opts.from || null,
        to_status: opts.to || null,
        qty_in: opts.qtyIn != null ? Number(opts.qtyIn) : null,
        good_qty: opts.goodQty != null ? Number(opts.goodQty) : null,
        bad_qty: opts.badQty != null ? Number(opts.badQty) : null,
        note: opts.note || null
      });
    } catch (e) {
      console.warn('[node-actions] 事件写入异常:', e && e.message);
    }
  }

  // ==========================================================
  // M1 · advance — active → done
  // ==========================================================
  async function advance(order, node, options = {}) {
    // Validate
    const v = NodeState.validate(node.status, 'done');
    if (!v.valid) return { ok: false, error: v.error, phase: 'primary' };

    // Check qty_out：仅总QC（P35）需要填产出
    if (Validation.requiresQtyOut(node)) {
      const qv = Validation.validateQtyOut(node, options.qtyOut);
      if (!qv.valid) return { ok: false, error: qv.error, phase: 'primary' };
    }

    // Primary write
    const r1 = await OrdersAPI.updateNode(node.id, {
      status: 'done',
      qty_out: options.qtyOut ?? (node.qty_out ?? null)
    });
    if (!r1.ok) return { ok: false, error: r1.error, phase: 'primary' };
    const updatedNode = r1.data;

    await logEvent(order.id, node, 'done', {
      from: node.status, to: 'done',
      qtyIn: options.qtyIn, goodQty: options.goodQty, badQty: options.badQty
    });

    // 闭环：节点被置为 done 时，必须同步收口它的生产记录。
    // 否则「节点已完成、记录还停在待生产/生产中」——这就是 2026-11-23 排查出的断链。
    // 失败不阻塞推进（记录可事后补），但要把警告带出去。
    let productionWarning = null;
    if (typeof ProductionRecordsAPI !== 'undefined' && ProductionRecordsAPI.closeForNode) {
      const pr = await ProductionRecordsAPI.closeForNode(order.id, node, {
        goodQty: options.goodQty,
        badQty: options.badQty,
        qtyOut: options.qtyOut,
        perBatch: options.perBatch
      });
      if (!pr.ok) {
        console.error('[advance] 生产记录收口失败:', pr.error);
        productionWarning = 'production_record_sync_failed';
      }
    }

    // Auto-activate next waiting node (with empty dept skip — Issue I-1)
    let activatedNode = null;
    let warning = null;
    // FIX(R46499): 先把「本次已完成的节点」合并进数组，再做激活判定。
    // 原实现用 order.nodes 的旧快照，当前节点在内存里仍是 active，
    // 导致跨部门时 allDeptDone 恒为 false，下一部门首节点永远不会被激活。
    const updatedNodes = (order.nodes || []).map(n => n.id === node.id ? updatedNode : n);
    const sorted = [...updatedNodes].sort((a, b) => a.seq - b.seq);
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

    // 下游节点被激活 → 记录它的真实开工时间
    if (activatedNode) await markStarted(order.id, activatedNode);

    // 批次「当前工序」推进到新激活的节点（没有批次时该调用是空操作）
    if (activatedNode && typeof BatchProgressAPI !== 'undefined' && BatchProgressAPI.setCurrentNode) {
      await BatchProgressAPI.setCurrentNode(order.id, activatedNode.id, activatedNode.process_name);
    }

    // Derive and update order status（把新激活的节点也并入）
    const nodesForStatus = activatedNode
      ? updatedNodes.map(n => n.id === activatedNode.id ? activatedNode : n)
      : updatedNodes;
    const newStatus = OrderState.derive(nodesForStatus, order.status);
    const r3 = await OrdersAPI.updateStatus(order.id, newStatus);
    if (!r3.ok && !warning) warning = 'status_update_delayed';

    return { ok: true, updatedNode, activatedNode, newOrderStatus: newStatus,
             warning: warning || productionWarning };
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

    await logEvent(order.id, node, 'pause', {
      from: node.status, to: 'paused', note: pauseReason
    });

    const updatedNodes = (order.nodes || []).map(n => n.id === node.id ? r1.data : n);
    const newStatus = OrderState.derive(updatedNodes, order.status);
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

    // P0 守卫：恢复 = 把节点变回 active，必须确保本单没有其它进行中节点，
    // 否则「暂停 A → 激活 B → 恢复 A」会造出双 active（无任何报错）。
    const guardErr = guardSingleActive(order, node.id);
    if (guardErr) return guardErr;

    const r1 = await OrdersAPI.updateNode(node.id, {
      status: 'active',
      pause_reason: null
    });
    if (!r1.ok) return { ok: false, error: r1.error, phase: 'primary' };

    await markStarted(order.id, r1.data);
    await logEvent(order.id, node, 'resume', { from: node.status, to: 'active' });

    const updatedNodes = (order.nodes || []).map(n => n.id === node.id ? r1.data : n);
    const newStatus = OrderState.derive(updatedNodes, order.status);
    let warning = null;
    const r2 = await OrdersAPI.updateStatus(order.id, newStatus);
    if (!r2.ok) warning = 'status_update_delayed';

    return { ok: true, updatedNode: r1.data, newOrderStatus: newStatus, warning };
  }

  // ==========================================================
  // M3b · activate — waiting → active（手动激活，FIX R46499）
  // 用于跨部门未自动激活 / 数据异常导致 waiting 节点无操作可用的场景
  // ==========================================================
  async function activate(order, node) {
    const v = NodeState.validate(node.status, 'active');
    if (!v.valid) return { ok: false, error: v.error, phase: 'primary' };

    // 顺序模型守卫：复用 guardSingleActive（单点实现，与 resume/undo 一致）
    const guardErr = guardSingleActive(order, node.id);
    if (guardErr) return guardErr;

    const r1 = await OrdersAPI.updateNode(node.id, { status: 'active' });
    if (!r1.ok) return { ok: false, error: r1.error, phase: 'primary' };

    await markStarted(order.id, r1.data);
    await logEvent(order.id, node, 'activate', { from: node.status, to: 'active' });

    const updatedNodes = (order.nodes || []).map(n => n.id === node.id ? r1.data : n);
    const newStatus = OrderState.derive(updatedNodes, order.status);
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

    // FIX(R46500): 同 append —— 返工时若本单已有进行中节点，新节点插入为 waiting，
    // 避免出现两个 active（当前节点完成后再激活返工节点）。
    const hasOtherActive = nodes.some(n => n.status === 'active');
    const initialStatus = hasOtherActive ? 'waiting' : 'active';

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
      status:       initialStatus,
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
    const newStatus = OrderState.derive(allNodes, order.status);
    const r3 = await OrdersAPI.updateStatus(order.id, newStatus);
    if (!r3.ok && !warning) warning = 'status_update_delayed';

    await logEvent(order.id, newNode, 'rework', { to: newNode.status });

    await logEvent(order.id, newNode, 'append', { to: newNode.status });

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

    // FIX(R46500): 不允许同时出现两个 active。若本单已有进行中的节点，
    // 新节点插入为 waiting —— 当前节点完成后会被 advance 自动激活，语义仍是“下一步”。
    const hasOtherActive = nodes.some(n => n.status === 'active');
    const initialStatus = hasOtherActive ? 'waiting' : 'active';

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
      status:       initialStatus,
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
    const newStatus = OrderState.derive(allNodes, order.status);
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

    // P0 守卫：done/paused → active 会把节点重新变回进行中，
    // 若本单已有其它 active 节点，撤销会造成双 active，必须拒绝。
    if (action.target === 'active') {
      const guardErr = guardSingleActive(order, node.id);
      if (guardErr) return guardErr;
    }

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

    await logEvent(order.id, node, 'undo', { from: node.status, to: action.target });

    // 反向闭环：撤销「完成」→ 记录退回「生产中」，否则再次完成会被幂等逻辑跳过
    if (node.status === 'done' && typeof ProductionRecordsAPI !== 'undefined'
        && ProductionRecordsAPI.reopenForNode) {
      const pr = await ProductionRecordsAPI.reopenForNode(order.id, node.id);
      if (!pr.ok) console.warn('[undo] 生产记录回退失败:', pr.error);
    }

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
    const insertedNodes = []; // B6: keep real inserted rows for status derivation

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
      insertedNodes.push(r.data);
      if (!firstNewId) firstNewId = r.data.id;
      currentSeq += 2; // micro-gap within segment
    }

    // Bump if needed
    let warning = null;
    if (needsBump) {
      const br = await OrdersAPI.bumpSeq(order.id, bumpFrom, SeqCalc.GAP_STEP, firstNewId);
      if (!br.ok) warning = 'seq_bump_failed';
    }

    // B6: derive from real inserted nodes, not empty placeholders
    const allNodes = [...nodes, ...insertedNodes];
    const newStatus = OrderState.derive(allNodes, order.status);
    await OrdersAPI.updateStatus(order.id, newStatus);

    for (const n of insertedNodes) {
      await logEvent(order.id, n, 'rework', { to: n.status });
    }

    return { ok: true, newSeq, needsBump, newOrderStatus: newStatus, warning };
  }

  // ==========================================================
  // M8 · removeNode — 删除未开始的节点（清理误加的工序）
  // 不做 seq 重排（GAP_STEP=10 间隙制，留空号合法）；
  // production_records.node_id 为 ON DELETE SET NULL，历史记录保留。
  // ==========================================================
  async function removeNode(order, node) {
    // 守卫1：只能移除尚未开始的工序，防止误删在产或已完工的记录
    if (node.status !== 'waiting') {
      return { ok: false, error: '只能移除未开始的工序', phase: 'forbidden' };
    }
    // 守卫2：返工节点不可单独移除（与 undo 的 F5 一致）
    if (node.rework_pass > 0) {
      return { ok: false, error: '返工节点不可单独移除', phase: 'forbidden' };
    }

    // 节点移除：清掉它的生产记录；事件由 node_events.node_id 外键 CASCADE 自动删除
    if (typeof ProductionRecordsAPI !== 'undefined' && ProductionRecordsAPI.deleteByNodeId) {
      await ProductionRecordsAPI.deleteByNodeId(node.id);
    }

    const r1 = await OrdersAPI.deleteNode(node.id);
    if (!r1.ok) return { ok: false, error: r1.error, phase: 'primary' };

    // 删除后用「去掉该节点」的数组重新推导订单状态
    const remaining = (order.nodes || []).filter(n => n.id !== node.id);
    const newStatus = OrderState.derive(remaining, order.status);
    let warning = null;
    const r2 = await OrdersAPI.updateStatus(order.id, newStatus);
    if (!r2.ok) warning = 'status_update_delayed';

    return { ok: true, removedNodeId: node.id, newOrderStatus: newStatus, warning };
  }

  return { advance, pause, resume, activate, removeNode, rework, append, recordException, undo, reworkSegment };
})();
