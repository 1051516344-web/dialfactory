/* ============================================================
   DialFactory V1 · P4 Order Detail Page (Core)
   UI-only. All business operations delegated to NodeActions.
   ============================================================ */

const OrderDetailPage = (() => {

  let currentOrder = null;
  let currentNodeList = [];
  let currentExceptions = [];

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

    renderFull(container);
  }

  function renderFull(container) {
    const order = currentOrder;
    const nodes = currentNodeList;
    const stats = OrderState.nodeStats(nodes);
    const derivedStatus = OrderState.derive(nodes);

    const excByNode = {};
    currentExceptions.forEach(e => {
      if (!excByNode[e.node_id]) excByNode[e.node_id] = [];
      excByNode[e.node_id].push(e);
    });

    const specText = [order.base_texture, order.plate_color].filter(Boolean).join('+') || '—';

    container.innerHTML = `
      <div class="page-header">
        <a href="#/orders" class="btn btn-ghost" style="font-size:0.85rem;">← 订单列表</a>
        <h1>#${escapeHTML(order.order_no)}</h1>
        ${StatusBadge.render(derivedStatus)}
      </div>

      <div class="card">
        <div style="display:flex;flex-wrap:wrap;gap:var(--space-md);font-size:var(--font-size-sm);">
          <div><span style="color:var(--text-secondary);">客户:</span> ${escapeHTML(order.customer?.name || '—')}</div>
          <div><span style="color:var(--text-secondary);">数量:</span> ${Format.number(order.order_qty)}件</div>
          <div><span style="color:var(--text-secondary);">交期:</span> ${Format.date(order.due_date)} (${Format.dueDays(order.due_date)})</div>
          <div><span style="color:var(--text-secondary);">规格:</span> ${escapeHTML(specText)}</div>
          <div><span style="color:var(--text-secondary);">备注:</span> ${escapeHTML(order.note || '—')}</div>
        </div>
        ${ProgressBar.render(stats)}
      </div>

      <div class="section-title" style="margin-top:var(--space-lg);">生产流程</div>
      ${nodes.length === 0
        ? EmptyState.render({ icon: '📋', title: '暂无工序节点', desc: '该订单尚未生成工序执行记录。' })
        : renderFlow(nodes, excByNode)
      }

      <div class="section-title" style="margin-top:var(--space-lg);">异常记录 (${currentExceptions.length})</div>
      ${currentExceptions.length === 0
        ? EmptyState.render({ icon: '✅', title: '无异常记录', desc: '该订单暂无质量异常。' })
        : renderExceptions(currentExceptions, nodes)
      }
    `;
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

    // Action buttons
    let actionsHtml = '';
    if (actions.includes('advance')) {
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

    return `
      <div class="node-card status-${node.status}">
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
        } else {
          Toast.error(result.error);
        }
      }
    });
  }

  // ==========================================================
  // Result Handler
  // ==========================================================
  async function handleActionResult(result) {
    if (!result.ok) {
      Toast.error(result.error || '操作失败');
      return;
    }

    // Success — update local state
    if (result.updatedNode) {
      const idx = currentNodeList.findIndex(n => n.id === result.updatedNode.id);
      if (idx >= 0) currentNodeList[idx] = result.updatedNode;
    }
    if (result.activatedNode) {
      const idx = currentNodeList.findIndex(n => n.id === result.activatedNode.id);
      if (idx >= 0) currentNodeList[idx] = result.activatedNode;
    }
    if (result.newNode) {
      currentNodeList.push(result.newNode);
    }

    // Refresh full node list from DB if seq changed
    if (result.newNode || result.warning === 'seq_bump_failed') {
      const { ok, data: order } = await OrdersAPI.getById(currentOrder.id);
      if (ok) {
        currentNodeList = order.nodes || [];
        currentOrder.nodes = currentNodeList;
      }
    }

    // Update order status
    if (result.newOrderStatus) {
      currentOrder.status = result.newOrderStatus;
    }

    // Re-render
    renderFull(document.getElementById('page-container'));

    // Warnings
    if (result.warning === 'downstream_activation_failed') {
      Toast.info('下游激活失败，请手动激活');
    } else if (result.warning === 'seq_bump_failed') {
      Toast.info('Seq重算失败，已刷新');
    }
  }

  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { render, onAdvance, onPause, onResume, onRework, onAppend, onRecordException };
})();
