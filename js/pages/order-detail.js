/* ============================================================
   DialFactory V1 · P4 Order Detail Page (Core)
   UI-only. All business operations delegated to NodeActions.
   ============================================================ */

const OrderDetailPage = (() => {

  let currentOrder = null;
  let currentNodeList = [];
  let currentExceptions = [];
  let currentProductionRecords = [];
  let currentBatches = [];
  let currentBatchRelations = [];

  async function render(orderId) {
    const container = document.getElementById('page-container');
    if (!container) return;

    container.innerHTML = `
      <div class="page-header"><h1>订单详情</h1></div>
      ${Skeleton.cards(6)}
    `;

    // Load data
    const { ok, data: order, error } = await OrdersAPI.getById(orderId);
    if (!ok) {
      container.innerHTML = `
        <div class="page-header"><h1>订单详情</h1></div>
        <div class="card" style="text-align:center;padding:var(--space-xl);">
          <p style="font-size:2rem;">⚠️</p>
          <p style="color:var(--color-danger);">${escapeHTML(error)}</p>
          <button class="btn btn-primary" style="margin-top:var(--space-md);" onclick="history.back()">返回</button>
        </div>
      `;
      return;
    }

    currentOrder = order;
    currentNodeList = order.nodes || [];
    currentOrder.nodes = currentNodeList; // keep in sync

    // Load exceptions
    const nodeIds = currentNodeList.map(n => n.id);
    if (nodeIds.length > 0) {
      const er = await ExceptionsAPI.listByNodeIds(nodeIds);
      currentExceptions = er.ok ? er.data : [];
    } else {
      currentExceptions = [];
    }

    // Phase 4: Load production records
    const pr = await ProductionRecordsAPI.listByOrderId(orderId);
    currentProductionRecords = pr.ok ? pr.data : [];

    // Phase 4 (Batch layer): Load batches + split relations
    const br = await BatchesAPI.listByOrderId(orderId);
    if (br.ok) {
      currentBatches = br.data.batches || [];
      currentBatchRelations = br.data.relations || [];
    } else {
      currentBatches = [];
      currentBatchRelations = [];
    }

    renderFull(container);
    await loadDrawing(order);
  }

  function renderFull(container) {
    const order = currentOrder;
    const nodes = currentNodeList;
    const stats = OrderState.nodeStats(nodes);
    // ①: pass current order status so a cancelled order stays 'cancelled'
    // (derive() would otherwise fall through to 'paused' since all nodes were paused)
    const derivedStatus = OrderState.derive(nodes, order.status);

    const excByNode = {};
    currentExceptions.forEach(e => {
      if (!excByNode[e.node_id]) excByNode[e.node_id] = [];
      excByNode[e.node_id].push(e);
    });

    const specText = [order.base_texture, order.plate_color, order.specs?.base_plate_color].filter(Boolean).join('+') || '—';
    const prodNo = order.specs?.production_no || '';
    const custOrderNo = order.specs?.customer_order_no || '';

    container.innerHTML = `
      <div class="page-header">
        <a href="#/orders" class="btn btn-ghost" style="font-size:0.85rem;">← 订单列表</a>
        <h1>#${escapeHTML(order.order_no)}</h1>
        <span id="order-status-badge">${StatusBadge.render(derivedStatus)}</span>
      </div>

      <div class="card">
        <div style="display:flex;flex-wrap:wrap;gap:var(--space-md);font-size:var(--font-size-sm);">
          <div><span style="color:var(--text-secondary);">客户:</span> ${escapeHTML(order.customer?.short_name || order.customer?.name || '—')}</div>
          <div><span style="color:var(--text-secondary);">数量:</span> ${Format.number(order.order_qty)}件</div>
          <div><span style="color:var(--text-secondary);">交期:</span> ${Format.date(order.due_date)} (${Format.dueDays(order.due_date)})</div>
          <div><span style="color:var(--text-secondary);">规格:</span> ${escapeHTML(specText)}</div>
          ${prodNo ? `<div><span style="color:var(--text-secondary);">生产号:</span> <span style="font-weight:600;color:var(--color-primary);">${escapeHTML(prodNo)}</span></div>` : ''}
          ${custOrderNo ? `<div><span style="color:var(--text-secondary);">客单号:</span> ${escapeHTML(custOrderNo)}</div>` : ''}
          <div><span style="color:var(--text-secondary);">备注:</span> ${escapeHTML(order.note || '—')}</div>
        </div>
        <div id="drawing-section" style="margin-top:var(--space-md);padding-top:var(--space-sm);border-top:1px solid var(--bg-muted);">
          <span style="font-size:var(--font-size-xs);color:var(--text-secondary);">📎 图纸</span>
          <div id="drawing-content"></div>
        </div>
        <div id="order-progress-bar">${ProgressBar.render(stats)}</div>
      </div>

      <div id="order-flow-section">
        <div class="section-title" style="margin-top:var(--space-lg);">生产流程</div>
        ${nodes.length === 0
          ? EmptyState.render({ icon: '📋', title: '暂无工序节点', desc: '该订单尚未生成工序执行记录。' })
          : renderFlow(nodes, excByNode)
        }
      </div>

      <div id="order-batch-section">
        ${renderBatchSection()}
      </div>

      <div id="production-timeline-section">
        ${renderProductionTimeline(currentProductionRecords)}
      </div>

      <div class="section-title" style="margin-top:var(--space-lg);">异常记录 (${currentExceptions.length})</div>
      ${currentExceptions.length === 0
        ? EmptyState.render({ icon: '✅', title: '无异常记录', desc: '该订单暂无质量异常。' })
        : renderExceptions(currentExceptions, nodes)
      }
    `;

    attachHeaderButtons(container);
  }

  // ==========================================================
  // Flow Rendering
  // ==========================================================
  function renderFlow(nodes, excByNode) {
    const sorted = [...nodes].sort((a, b) => a.seq - b.seq);
    let html = '<div class="flow-container">';

    sorted.forEach((node, i) => {
      html += renderNodeCard(node, excByNode[node.id] || []);
      if (i < sorted.length - 1) {
        html += '<div class="flow-arrow">↓</div>';
      }
    });

    html += '</div>';
    return html;
  }

  function renderNodeCard(node, exceptions) {
    const iconMap = { waiting: '○', active: '▶', done: '✓', paused: '⏸' };
    const icon = iconMap[node.status] || '?';
    const reworkBadge = node.rework_pass > 0
      ? `<span class="rework-badge" style="background:${CONFIG.REWORK_COLORS[Math.min(node.rework_pass, 3)]};">
           返工×${node.rework_pass}
         </span>`
      : '';
    const actions = NodeState.getAvailableActions(node);

    // Exceptions inline
    let excHtml = '';
    if (exceptions.length > 0) {
      excHtml = exceptions.map(e => `
        <div class="exception-card">
          <span class="exception-type">${escapeHTML(e.type)}</span>
          · ${e.qty}件
          ${e.resolution ? `· ${escapeHTML(e.resolution)}` : ''}
          <span style="color:var(--text-muted);font-size:0.75rem;margin-left:var(--space-xs);">
            ${Format.date(e.created_at)}
          </span>
        </div>
      `).join('');
    }

    // Phase 3-E: Look up production record for this node
    // B5: prefer node_id match (rework/append may reuse a process name)
    const prodRecord = currentProductionRecords.find(r => r.node_id === node.id)
      || currentProductionRecords.find(r => r.process_name === node.process_name);
    const prodIsActive = prodRecord && prodRecord.status === '生产中';

    // Action buttons
    let actionsHtml = '';
    // Hide node "完成" when production record is active — avoid duplicate completion buttons
    if (actions.includes('advance') && !prodIsActive) {
      const label = (node.process_type === '检验' || node.process?.type === '检验') ? '完成(需填产出)' : '完成';
      actionsHtml += `<button class="btn btn-success btn-sm" onclick="OrderDetailPage.onAdvance('${node.id}')">${label}</button>`;
    }
    if (actions.includes('pause')) {
      actionsHtml += `<button class="btn btn-warning btn-sm" onclick="OrderDetailPage.onPause('${node.id}')">暂停</button>`;
    }
    if (actions.includes('resume')) {
      actionsHtml += `<button class="btn btn-primary btn-sm" onclick="OrderDetailPage.onResume('${node.id}')">恢复</button>`;
    }
    if (actions.includes('rework')) {
      actionsHtml += `<button class="btn btn-warning btn-sm" onclick="OrderDetailPage.onRework('${node.id}')">返工</button>`;
    }
    if (actions.includes('append')) {
      actionsHtml += `<button class="btn btn-ghost btn-sm" onclick="OrderDetailPage.onAppend('${node.id}')">+ 追加工序</button>`;
    }
    if (actions.includes('record_exception')) {
      actionsHtml += `<button class="btn btn-danger btn-sm" onclick="OrderDetailPage.onRecordException('${node.id}')">记录异常</button>`;
    }

    // Phase 4: Production record buttons
    if (node.status === 'active' && (!prodRecord || prodRecord.status === '待生产')) {
      actionsHtml += `<button class="btn btn-primary btn-sm" onclick="OrderDetailPage.onStartProduction('${node.id}')">开始生产</button>`;
    } else if (prodIsActive) {
      actionsHtml += `<button class="btn btn-success btn-sm" onclick="OrderDetailPage.onCompleteProduction('${node.id}','${prodRecord.id}')">生产完成</button>`;
    }

    // V1.1: Undo (within time window) — B14 moved from string-replace override
    const elapsed = Date.now() - new Date(node.updated_at).getTime();
    const undoWindow = (CONFIG.UNDO_WINDOW_MINUTES || 5) * 60 * 1000;
    const canUndo = (node.status === 'done' || node.status === 'paused' || node.status === 'active')
                    && elapsed < undoWindow
                    && currentOrder.status !== 'completed'
                    && currentOrder.status !== 'cancelled'
                    && (node.rework_pass || 0) === 0;
    if (canUndo) {
      actionsHtml += `<button class="btn btn-ghost btn-sm" onclick="OrderDetailPage.onUndo('${node.id}')">撤销</button>`;
    }

    // V1.1: Segment rework on done nodes
    if (node.status === 'done' && node.dept_id && currentOrder.status !== 'completed' && currentOrder.status !== 'cancelled') {
      actionsHtml += `<button class="btn btn-warning btn-sm" onclick="OrderDetailPage.onSegmentRework('${node.id}')">段返工</button>`;
    }

    return `
      <div class="node-card status-${node.status}" data-node-id="${node.id}">
        <div class="node-header">
          <span class="node-status-icon">${icon}</span>
          <span class="node-process-code">${escapeHTML(node.process_code || '—')}</span>
          <span class="node-process-name">${escapeHTML(node.process_name || '未命名工序')}</span>
          ${reworkBadge}
        </div>
        <div class="node-info">
          <span>${escapeHTML(node.dept_name || '—')}</span>
          <span style="margin-left:var(--space-sm);">${CONFIG.STATUS_LABELS[node.status]}</span>
          ${node.pause_reason ? `<span style="margin-left:var(--space-sm);color:var(--color-paused);">· ${escapeHTML(node.pause_reason)}</span>` : ''}
          ${node.qty_out != null ? `<span style="margin-left:var(--space-sm);">· 产出: ${node.qty_out}件</span>` : ''}
        </div>
        ${excHtml}
        ${actionsHtml ? `<div class="node-actions">${actionsHtml}</div>` : ''}
      </div>
    `;
  }

  // ==========================================================
  // Exception Section
  // ==========================================================
  function renderExceptions(exceptions, nodes) {
    const nodeMap = {};
    nodes.forEach(n => { nodeMap[n.id] = n; });

    return exceptions.map(e => {
      const node = nodeMap[e.node_id];
      return `
        <div class="card exception-list-card" onclick="Router.navigate('/orders/${currentOrder.id}')">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span class="exception-type" style="font-weight:600;">${escapeHTML(e.type)}</span>
            <span style="font-size:var(--font-size-sm);color:var(--text-muted);">${Format.date(e.created_at)}</span>
          </div>
          <div style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-top:var(--space-xs);">
            ${e.qty}件 · ${escapeHTML(e.resolution || '—')}
            ${node ? `· ${escapeHTML(node.process_name || '')}` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // ==========================================================
  // Action Handlers (UI → NodeActions → Toast → Re-render)
  // ==========================================================
  function getNode(id) {
    return currentNodeList.find(n => n.id === id);
  }

  async function onAdvance(nodeId) {
    const node = getNode(nodeId);
    if (!node) return;

    // Check if 检验 type
    const processType = node.process_type || node.process?.type;
    if (processType === '检验') {
      ConfirmDialog.show({
        title: '填写产出数量',
        content: `
          <div class="form-group">
            <label class="form-label">产出数量 *</label>
            <input type="number" name="qtyOut" class="form-input" placeholder="合格品数量" min="1" autofocus>
          </div>
        `,
        confirmLabel: '确认完成',
        onConfirm: async (data) => {
          const result = await NodeActions.advance(currentOrder, node, { qtyOut: data.qtyOut });
          handleActionResult(result);
        }
      });
    } else {
      const result = await NodeActions.advance(currentOrder, node);
      handleActionResult(result);
    }
  }

  async function onPause(nodeId) {
    const node = getNode(nodeId);
    if (!node) return;

    const options = CONFIG.PAUSE_REASONS.map(r =>
      `<option value="${r.value}">${r.label}</option>`
    ).join('');

    ConfirmDialog.show({
      title: '暂停原因',
      content: `
        <div class="form-group">
          <select name="reason" class="form-select" autofocus>
            ${options}
          </select>
        </div>
      `,
      confirmLabel: '确认暂停',
      onConfirm: async (data) => {
        const result = await NodeActions.pause(currentOrder, node, data.reason);
        handleActionResult(result);
      }
    });
  }

  async function onResume(nodeId) {
    const node = getNode(nodeId);
    if (!node) return;
    const result = await NodeActions.resume(currentOrder, node);
    handleActionResult(result);
  }

  async function onRework(nodeId) {
    const node = getNode(nodeId);
    if (!node) return;

    const newPass = (node.rework_pass || 0) + 1;
    ConfirmDialog.show({
      title: '确认返工',
      content: `
        <p>确认对 <strong>${escapeHTML(node.process_name || '该工序')}</strong> 执行返工？</p>
        <p style="color:var(--text-secondary);font-size:var(--font-size-sm);">
          将创建第 ${newPass} 次执行记录。
        </p>
      `,
      confirmLabel: '确认返工',
      onConfirm: async () => {
        const result = await NodeActions.rework(currentOrder, node);
        handleActionResult(result);
      }
    });
  }

  async function onAppend(nodeId) {
    const node = getNode(nodeId);
    if (!node) return;

    // Load processes for the dropdown
    const { ok, data: processes } = await ProcessesAPI.listProcesses();
    if (!ok) { Toast.error('无法加载工序列表'); return; }

    const options = processes.map(p =>
      `<option value="${p.id}">${escapeHTML(p.code)} ${escapeHTML(p.name)} (${escapeHTML(p.type)})</option>`
    ).join('');

    ConfirmDialog.show({
      title: '追加工序',
      content: `
        <div class="form-group">
          <label class="form-label">选择工序 *</label>
          <select name="processId" class="form-select" autofocus>${options}</select>
        </div>
        <div class="form-group">
          <label class="form-label">插入位置</label>
          <p style="font-size:var(--font-size-sm);color:var(--text-secondary);">
            在 <strong>${escapeHTML(node.process_name || '当前节点')}</strong> 之后
          </p>
        </div>
        <div class="form-group">
          <label class="form-label">原因（选填）</label>
          <input type="text" name="reason" class="form-input" placeholder="追加原因">
        </div>
      `,
      confirmLabel: '确认追加',
      onConfirm: async (data) => {
        const result = await NodeActions.append(currentOrder, node, data.processId, data.reason);
        handleActionResult(result);
      }
    });
  }

  async function onRecordException(nodeId) {
    const typeOptions = CONFIG.EXCEPTION_TYPES.map(t =>
      `<option value="${t}">${t}</option>`
    ).join('');
    const resOptions = CONFIG.EXCEPTION_RESOLUTIONS.map(r =>
      `<option value="${r}">${r}</option>`
    ).join('');

    ConfirmDialog.show({
      title: '记录异常',
      content: `
        <div class="form-group">
          <label class="form-label">缺陷类型 *</label>
          <select name="type" class="form-select" autofocus>${typeOptions}</select>
        </div>
        <div class="form-group">
          <label class="form-label">影响数量 *</label>
          <input type="number" name="qty" class="form-input" placeholder="件数" min="1">
        </div>
        <div class="form-group">
          <label class="form-label">处理方式</label>
          <select name="resolution" class="form-select">${resOptions}</select>
        </div>
      `,
      confirmLabel: '记录异常',
      dangerous: true,
      onConfirm: async (data) => {
        const result = await NodeActions.recordException(nodeId, data);
        if (result.ok) {
          Toast.success('异常已记录');
          // Refresh exceptions
          const nodeIds = currentNodeList.map(n => n.id);
          const er = await ExceptionsAPI.listByNodeIds(nodeIds);
          currentExceptions = er.ok ? er.data : [];
          renderFull(document.getElementById('page-container'));
          await loadDrawing(currentOrder);
        } else {
          Toast.error(result.error);
        }
      }
    });
  }

  // ==========================================================
  // Result Handler — P0-FIX: partial DOM updates for simple operations
  // ==========================================================
  async function handleActionResult(result) {
    if (!result.ok) {
      Toast.error(result.error || '操作失败');
      return;
    }

    // Complex if: newNode created, seq bump failed, or no updatedNode (structural change like segment rework)
    const isComplex = !!(result.newNode || result.warning === 'seq_bump_failed' || !result.updatedNode);

    if (isComplex) {
      // B13: structural change (rework/append/segment) — refetch authoritative state
      // so seq bumps and other node mutations are reflected, not guessed locally.
      const { ok, data: order } = await OrdersAPI.getById(currentOrder.id);
      if (ok) {
        currentOrder = order;
        currentOrder.nodes = order.nodes || [];
        currentNodeList = currentOrder.nodes;
      }
      renderFull(document.getElementById('page-container'));
      await loadDrawing(currentOrder);
    } else {
      // Success — update local state
      if (result.updatedNode) {
        const idx = currentNodeList.findIndex(n => n.id === result.updatedNode.id);
        if (idx >= 0) currentNodeList[idx] = result.updatedNode;
      }
      if (result.activatedNode) {
        const idx = currentNodeList.findIndex(n => n.id === result.activatedNode.id);
        if (idx >= 0) currentNodeList[idx] = result.activatedNode;
      }
      if (result.newOrderStatus) {
        currentOrder.status = result.newOrderStatus;
      }

      // P0-FIX: Simple — partial DOM update (no full page rebuild)
      const container = document.getElementById('page-container');
      updateNodeCardInDOM(result.updatedNode);
      if (result.activatedNode) updateNodeCardInDOM(result.activatedNode);
      updateProgressBarDOM();
      updateStatusBadgeDOM(result.newOrderStatus || currentOrder.status);
      // Re-attach header buttons (cancel / trial delete)
      attachHeaderButtons(container);
    }

    // Warnings
    if (result.warning === 'downstream_activation_failed') {
      Toast.info('下游激活失败，请手动激活');
    } else if (result.warning === 'seq_bump_failed') {
      Toast.info('Seq重算失败，已刷新');
    }
  }

  /** P0-FIX: Replace a single node card in the DOM without full page rebuild */
  function updateNodeCardInDOM(node) {
    if (!node) return;
    const card = document.querySelector(`.node-card[data-node-id="${node.id}"]`);
    if (!card) return;

    const excByNode = {};
    currentExceptions.forEach(e => {
      if (!excByNode[e.node_id]) excByNode[e.node_id] = [];
      excByNode[e.node_id].push(e);
    });

    const newHTML = renderNodeCard(node, excByNode[node.id] || []);
    const temp = document.createElement('div');
    temp.innerHTML = newHTML;
    const newCard = temp.firstElementChild;
    if (newCard) card.replaceWith(newCard);
  }

  /** P0-FIX: Update progress bar without full page rebuild */
  function updateProgressBarDOM() {
    const bar = document.getElementById('order-progress-bar');
    if (!bar) return;
    const stats = OrderState.nodeStats(currentNodeList);
    const temp = document.createElement('div');
    temp.innerHTML = ProgressBar.render(stats);
    const progressEl = temp.firstElementChild;
    if (progressEl) {
      bar.innerHTML = '';
      bar.appendChild(progressEl);
    }
  }

  /** P0-FIX: Update status badge without full page rebuild */
  function updateStatusBadgeDOM(status) {
    const badge = document.getElementById('order-status-badge');
    if (!badge) return;
    const derivedStatus = status || OrderState.derive(currentNodeList, currentOrder.status);
    badge.innerHTML = StatusBadge.render(derivedStatus);
  }

  /** P0-FIX: Re-attach cancel + trial delete buttons to header after partial update */
  function attachHeaderButtons(container) {
    if (!currentOrder || currentOrder.status === 'completed' || currentOrder.status === 'cancelled') return;
    const header = container.querySelector('.page-header');
    if (!header) return;
    // Avoid duplicates
    if (header.querySelector('button')) return;
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-danger btn-sm';
    cancelBtn.textContent = '取消订单';
    cancelBtn.style.cssText = 'margin-left:auto;font-size:0.8rem;';
    cancelBtn.onclick = onCancelOrder;
    header.appendChild(cancelBtn);
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger btn-sm';
    deleteBtn.textContent = '试运行清理';
    deleteBtn.style.cssText = 'margin-left:4px;font-size:0.8rem;background:#DC2626;';
    deleteBtn.onclick = onDeleteOrder;
    header.appendChild(deleteBtn);
  }

  function escapeHTML(str) {
    return DOM.escapeHtml(str);
  }

  // ==========================================================
  // Undo, Cancel, Segment Rework (V1.1)
  // ==========================================================
  async function onUndo(nodeId) {
    const node = getNode(nodeId);
    if (!node) return;
    const result = await NodeActions.undo(currentOrder, node);
    handleActionResult(result);
  }

  async function onCancelOrder() {
    ConfirmDialog.show({
      title: '确认取消订单',
      content: `<p>确认取消订单 <strong>#${escapeHTML(currentOrder.order_no)}</strong>？</p>
                <p style="color:var(--text-secondary);font-size:var(--font-size-sm);">取消后所有进行中的工序将暂停。此操作不可撤销。</p>`,
      confirmLabel: '确认取消',
      dangerous: true,
      onConfirm: async () => {
        // Set all active/waiting nodes to paused, checking each result (③)
        let nodeFailures = 0;
        for (const n of currentNodeList) {
          if (n.status === 'active' || n.status === 'waiting') {
            const r = await OrdersAPI.updateNode(n.id, { status: 'paused', pause_reason: '订单已取消' });
            if (!r.ok) nodeFailures++;
          }
        }
        const statusResult = await OrdersAPI.updateStatus(currentOrder.id, 'cancelled');
        if (nodeFailures > 0 || !statusResult.ok) {
          Toast.error(nodeFailures > 0
            ? `取消失败：${nodeFailures} 个工序节点更新未生效`
            : '取消失败：订单状态更新未生效');
          return;
        }
        currentOrder.status = 'cancelled';
        Toast.info('订单已取消');
        renderFull(document.getElementById('page-container'));
        await loadDrawing(currentOrder);
      }
    });
  }

  // ==========================================================
  // Trial Delete (temporary safety patch)
  // ==========================================================
  async function onDeleteOrder() {
    // Trial Cleanup — Revised Rules (Phase 3-B.3)
    // Only reject: completed orders
    // Nodes (waiting/active/paused), exceptions, and rework ARE allowed during trial
    if (currentOrder.status === 'completed') {
      Toast.error('已完成订单不可清理'); return;
    }

    const nodeCount = currentNodeList.length;
    const exceptionCount = currentExceptions.length;

    const customerName = currentOrder.customer?.short_name || currentOrder.customer?.name || '—';

    ConfirmDialog.show({
      title: '试运行清理',
      content: `<p style="color:var(--color-danger);">该功能仅用于删除试运行阶段错误录入的数据。</p>
                <p style="color:var(--text-secondary);font-size:var(--font-size-sm);">真实生产订单请使用取消订单。</p>
                <p><strong>#${escapeHTML(currentOrder.order_no)}</strong> · ${escapeHTML(customerName)}</p>
                ${nodeCount > 0 ? `<p style="color:var(--text-secondary);font-size:var(--font-size-sm);">将同时删除 ${nodeCount} 个工序节点。</p>` : ''}
                ${exceptionCount > 0 ? `<p style="color:var(--text-secondary);font-size:var(--font-size-sm);">将同时删除 ${exceptionCount} 条异常记录。</p>` : ''}
                <p style="color:var(--color-danger);font-size:var(--font-size-sm);">⚠ 此操作将永久删除数据，不可恢复。</p>`,
      confirmLabel: '确认清理',
      dangerous: true,
      onConfirm: async () => {
        const result = await OrdersAPI.deleteOrder(currentOrder.id);
        if (result.ok) {
          Toast.success('订单已清理');
          Router.navigate('/orders');
        } else {
          Toast.error(result.error || '清理失败');
        }
      }
    });
  }

  async function onSegmentRework(nodeId) {
    const node = getNode(nodeId);
    if (!node) return;
    const deptNodes = currentNodeList.filter(n => n.dept_id === node.dept_id).sort((a, b) => a.seq - b.seq);
    const firstInDept = deptNodes[0];
    const rangeDesc = firstInDept
      ? `从 ${escapeHTML(firstInDept.process_code)} ${escapeHTML(firstInDept.process_name)} 到 ${escapeHTML(node.process_code)} ${escapeHTML(node.process_name)}`
      : `部门段返工`;

    ConfirmDialog.show({
      title: '确认部门段返工',
      content: `<p>将对 <strong>${escapeHTML(node.dept_name || '本部门')}</strong> 执行段返工。</p>
                <p style="color:var(--text-secondary);font-size:var(--font-size-sm);">${rangeDesc}</p>
                <p style="color:var(--text-secondary);font-size:var(--font-size-sm);">原始节点将保留。新节点将创建。</p>`,
      confirmLabel: '确认返工',
      onConfirm: async () => {
        const result = await NodeActions.reworkSegment(currentOrder, node);
        handleActionResult(result);
      }
    });
  }

  // NOTE (B14): cancel/delete header buttons are attached inside renderFull() via
  // attachHeaderButtons(), and undo/segment-rework buttons are rendered directly in
  // renderNodeCard(). No string-replace overrides are used anymore.

  // ==========================================================
  // Phase 4: Production Timeline
  // ==========================================================
  function renderProductionTimeline(records) {
    if (!records || records.length === 0) {
      return `
        <div class="card">
          <div class="section-title">生产轨迹</div>
          ${EmptyState.render({ icon: '📋', title: '暂无记录', desc: '该订单尚未录入生产记录。' })}
        </div>
      `;
    }

    const now = new Date();

    const entries = records.map(r => {
      const statusIcon = { '待生产': '○', '生产中': '▶', '已完成': '✓' };
      const icon = statusIcon[r.status] || '○';
      const dotClass = r.status === '生产中' ? 'active' : r.status === '已完成' ? 'done' : 'pending';

      // Time display varies by status
      let timeHTML = '';
      if (r.status === '生产中' && r.created_at) {
        // Active: show start time + live elapsed duration
        const startTime = Format.date(r.created_at) + ' ' +
          new Date(r.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        const elapsed = formatDuration(new Date(r.created_at), now);
        timeHTML = `
          <div class="timeline-time">开始：${startTime}</div>
          <div class="timeline-time" style="color:#2563EB;font-weight:500;">已生产：${elapsed}</div>
        `;
      } else if (r.status === '已完成' && r.created_at) {
        // Completed: show start, completion, total duration
        const startTime = Format.date(r.created_at) + ' ' +
          new Date(r.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        const endTime = r.completed_at
          ? Format.date(r.completed_at) + ' ' + new Date(r.completed_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          : '';
        const duration = r.completed_at
          ? formatDuration(new Date(r.created_at), new Date(r.completed_at))
          : '';
        timeHTML = `
          <div class="timeline-time">开始：${startTime}</div>
          ${endTime ? `<div class="timeline-time">完成：${endTime}</div>` : ''}
          ${duration ? `<div class="timeline-time" style="color:#16A34A;font-weight:500;">耗时：${duration}</div>` : ''}
        `;
      } else if (r.status === '待生产') {
        // Pending: show status note
        timeHTML = `<div class="timeline-time" style="color:var(--text-secondary);">等待开始生产</div>`;
      }

      return `
        <div class="timeline-entry">
          <div class="timeline-dot ${dotClass}">${icon}</div>
          <div class="timeline-content">
            <div class="timeline-header">
              <span class="timeline-process">${escapeHTML(r.process_name)}</span>
              ${StatusBadge.render(r.status)}
            </div>
            ${timeHTML}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="card">
        <div class="section-title">生产轨迹</div>
        <div class="timeline">
          ${entries}
        </div>
      </div>
    `;
  }

  function formatDuration(start, end) {
    const diffMs = end - start;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}小时${mins > 0 ? mins + '分' : ''}`;
    return `${mins}分`;
  }

  /** B16: parse optional numeric input — null for empty, number for valid (incl. 0). */
  function parseQty(v) {
    if (v == null || v === '') return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }

  async function onStartProduction(nodeId) {
    const node = getNode(nodeId);
    if (!node) return;
    // B11: update an existing 待生产 record instead of creating a duplicate
    // B5: match by node_id first (rework/append may reuse a process name)
    const existing = currentProductionRecords.find(r => r.node_id === node.id && r.status === '待生产')
      || currentProductionRecords.find(r => r.process_name === node.process_name && r.status === '待生产');
    const result = existing
      ? await ProductionRecordsAPI.update(existing.id, { status: '生产中', created_at: new Date().toISOString() })
      : await ProductionRecordsAPI.create({
          order_id: currentOrder.id,
          node_id: node.id,
          process_name: node.process_name,
          status: '生产中'
        });
    if (result.ok) {
      Toast.success('已开始生产: ' + node.process_name);
      refreshProductionRecords();
    } else {
      Toast.error(result.error || '操作失败');
    }
  }

  async function onCompleteProduction(nodeId, recordId) {
    const node = getNode(nodeId);
    if (!node) return;

    ConfirmDialog.show({
      title: '完成生产',
      content: `
        <p>确认完成 <strong>${escapeHTML(node.process_name)}</strong> ？</p>
        <div class="form-group">
          <label class="form-label">良品数 (选填)</label>
          <input type="number" name="good_qty" class="form-input" placeholder="件数" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">次品数 (选填)</label>
          <input type="number" name="bad_qty" class="form-input" placeholder="件数" min="0">
        </div>
      `,
      confirmLabel: '确认完成',
      onConfirm: async (data) => {
        // B16: robust parse — distinguish empty input ("") from a valid "0"
        const goodQty = parseQty(data.good_qty);
        const badQty = parseQty(data.bad_qty);

        // 1. Complete the production record (sets completed_at + duration_minutes)
        const fields = { status: '已完成' };
        if (goodQty != null) fields.good_qty = goodQty;
        if (badQty != null) fields.bad_qty = badQty;
        const prResult = await ProductionRecordsAPI.update(recordId, fields);
        if (!prResult.ok) {
          Toast.error(prResult.error || '操作失败');
          return;
        }

        // 2. Refresh production timeline to show updated duration
        await refreshProductionRecords();

        // 3. Advance the node to move the flow forward (B12: 检验 needs qty_out)
        const processType = node.process_type || node.process?.type;
        const advanceOpts = (processType === '检验') ? { qtyOut: goodQty } : {};
        const advanceResult = await NodeActions.advance(currentOrder, node, advanceOpts);
        handleActionResult(advanceResult);

        Toast.success('生产完成: ' + node.process_name);
      }
    });
  }

  async function refreshProductionRecords() {
    const pr = await ProductionRecordsAPI.listByOrderId(currentOrder.id);
    currentProductionRecords = pr.ok ? pr.data : [];
    // B10: re-render in place — keep #production-timeline-section so later updates find it
    const container = document.getElementById('page-container');
    const timelineSection = document.getElementById('production-timeline-section');
    if (timelineSection) {
      timelineSection.innerHTML = renderProductionTimeline(currentProductionRecords);
    }
    // Refresh all node cards to update production buttons
    currentNodeList.forEach(n => updateNodeCardInDOM(n));
    // Re-attach header buttons
    attachHeaderButtons(container);
  }

  // ==========================================================
  // Drawing Display (read-only — no replacement, no deletion)
  // ==========================================================
  async function loadDrawing(order) {
    const section = document.getElementById('drawing-section');
    const content = document.getElementById('drawing-content');
    if (!section || !content) {
      console.warn('[Drawing] Target elements not found in DOM — drawing section will not render');
      return;
    }

    const drawingPath = order.specs?.drawing_path;
    const drawingName = order.specs?.drawing_name || '客户图纸';

    if (!drawingPath) {
      content.innerHTML = '<span style="font-size:var(--font-size-xs);color:var(--text-muted);">无图纸</span>';
      return;
    }

    // Show loading placeholder
    content.innerHTML = `
      <span style="font-size:var(--font-size-sm);color:var(--text-secondary);">📎 加载图纸中...</span>
    `;

    const result = await StorageAPI.getDrawingUrl(drawingPath);

    if (!result.ok) {
      content.innerHTML = `
        <span style="font-size:var(--font-size-sm);color:var(--color-danger);">⚠️ 图纸加载失败: ${escapeHTML(result.error)}</span>
      `;
      return;
    }

    const url = result.data;
    const isImageFile = drawingName.match(/\.(png|jpg|jpeg|webp)$/i);

    if (isImageFile) {
      content.innerHTML = `
        <div style="border:1px solid var(--bg-muted);border-radius:8px;overflow:hidden;margin-top:4px;">
          <div style="display:flex;align-items:center;justify-content:space-between;
                      padding:var(--space-sm) var(--space-md);background:var(--bg-muted);
                      font-size:var(--font-size-sm);">
            <span>📎 ${escapeHTML(drawingName)}</span>
            <a href="${escapeHTML(url)}" target="_blank" rel="noopener"
               style="color:var(--color-primary);text-decoration:none;font-weight:500;">下载</a>
          </div>
          <a href="${escapeHTML(url)}" target="_blank" rel="noopener">
            <img src="${escapeHTML(url)}" alt="${escapeHTML(drawingName)}"
                 style="width:100%;max-height:400px;object-fit:contain;display:block;cursor:pointer;"
                 onerror="this.style.display='none';">
          </a>
        </div>
      `;
    } else {
      // PDF — show download card with prominent "查看" button
      content.innerHTML = `
        <div style="display:flex;align-items:center;gap:var(--space-md);padding:var(--space-sm);
                    border:1px solid var(--bg-muted);border-radius:8px;margin-top:4px;
                    background:var(--bg-surface);">
          <span style="font-size:1.5rem;">📄</span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:var(--font-size-sm);word-break:break-all;">
              ${escapeHTML(drawingName)}
            </div>
            <div style="font-size:var(--font-size-xs);color:var(--text-secondary);">PDF 图纸</div>
          </div>
          <a href="${escapeHTML(url)}" target="_blank" rel="noopener"
             class="btn btn-primary btn-sm">查看</a>
        </div>
      `;
    }
  }

  // ==========================================================
  // Production Batch section (Phase 4 · Batch layer)
  // ==========================================================
  function renderBatchSection() {
    const { roots } = BatchState.buildTree(currentBatches, currentBatchRelations);
    const body = currentBatches.length === 0
      ? EmptyState.render({ icon: '🧾', title: '暂无生产批次', desc: '订单数量 ≠ 实际生产数量。请按现场实际创建批次。' })
      : renderBatchTree(roots);

    return `
      <div class="section-title" style="margin-top:var(--space-lg);display:flex;align-items:center;gap:var(--space-sm);">
        <span>生产批次 (${currentBatches.length})</span>
        <button class="btn btn-primary btn-sm" style="margin-left:auto;" onclick="OrderDetailPage.showCreateBatchDialog()">创建批次</button>
      </div>
      <div class="card" style="padding:0;overflow:hidden;">${body}</div>
    `;
  }

  function renderBatchTree(nodes, depth = 0) {
    return nodes.map(node => {
      const indent = depth * 20;
      return `
        <div style="padding:var(--space-sm) var(--space-md);border-bottom:1px solid var(--bg-muted);${depth ? `padding-left:${indent + 16}px;` : ''}">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-sm);">
            <span style="font-weight:600;cursor:pointer;" onclick="Router.navigate('/batches/${node.id}')">${depth > 0 ? '├ ' : ''}#${escapeHTML(node.batch_no)}</span>
            <span style="font-size:var(--font-size-sm);color:var(--text-secondary);">${Format.number(node.quantity)}片 · ${escapeHTML(node.color || '—')}</span>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px;">
            ${batchBadge(node.status)}
            ${node.status !== 'completed' && node.status !== 'cancelled'
              ? `<button class="btn btn-ghost btn-sm" onclick="Router.navigate('/batches/${node.id}')">拆分</button>`
              : ''}
          </div>
        </div>
        ${node.children && node.children.length ? renderBatchTree(node.children.map(c => c.batch), depth + 1) : ''}
      `;
    }).join('');
  }

  function batchBadge(status) {
    const st = BatchState.statusLabel(status);
    return `<span style="display:inline-block;padding:1px 8px;border-radius:999px;font-size:var(--font-size-xs);color:#fff;background:${st.color};">${escapeHTML(st.label)}</span>`;
  }

  function showCreateBatchDialog() {
    if (!currentOrder) return;
    ConfirmDialog.show({
      title: '创建批次',
      content: `
        <div class="form-group">
          <label class="form-label">批次编号（人工填写）</label>
          <input type="text" name="batch_no" class="form-input" placeholder="如 ${escapeHTML(currentOrder.order_no)}-01">
        </div>
        <div class="form-group">
          <label class="form-label">数量</label>
          <input type="number" name="quantity" class="form-input" min="1" value="${currentOrder.order_qty || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">颜色（可空）</label>
          <input type="text" name="color" class="form-input" placeholder="银色 / 黑色 / 蓝色">
        </div>
        <div class="form-group">
          <label class="form-label">备注（可空）</label>
          <input type="text" name="note" class="form-input">
        </div>
      `,
      confirmLabel: '创建',
      onConfirm: async (formData) => {
        const batch_no = (formData.batch_no || '').trim();
        const quantity = Number(formData.quantity);
        if (!batch_no) { Toast.error('请填写批次编号'); return; }
        if (!quantity || quantity <= 0) { Toast.error('数量必须大于 0'); return; }
        const res = await BatchesAPI.createRootBatch({
          order_id: currentOrder.id,
          batch_no,
          quantity,
          color: formData.color,
          note: formData.note
        });
        if (!res.ok) {
          Toast.error(res.error || '创建失败');
          return;
        }
        Toast.success('批次已创建');
        // Refetch batches + re-render the batch section only
        const br = await BatchesAPI.listByOrderId(currentOrder.id);
        if (br.ok) {
          currentBatches = br.data.batches || [];
          currentBatchRelations = br.data.relations || [];
        }
        const section = document.getElementById('order-batch-section');
        if (section) section.innerHTML = renderBatchSection();
      }
    });
  }

  return { render, onAdvance, onPause, onResume, onRework, onAppend, onRecordException, onUndo, onCancelOrder, onSegmentRework, onStartProduction, onCompleteProduction, showCreateBatchDialog };
})();
