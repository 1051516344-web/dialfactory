/* ============================================================
   DialFactory V1 · Batch Detail Page
   Phase 1: view batch info + parent/child relations + manual split.
   batch_no is entered by humans (no auto-generation).
   ============================================================ */

const BatchDetailPage = (() => {

  let currentBatch = null;
  let currentParents = [];
  let currentChildren = [];

  async function render(batchId) {
    const container = document.getElementById('page-container');
    if (!container) return;

    container.innerHTML = `
      <div class="page-header"><h1>批次详情</h1></div>
      ${Skeleton.cards(3)}
    `;

    const { ok, data, error } = await BatchesAPI.getById(batchId);
    if (!ok) {
      container.innerHTML = `
        <div class="page-header"><h1>批次详情</h1></div>
        <div class="card" style="text-align:center;padding:var(--space-xl);">
          <p style="font-size:2rem;">⚠️</p>
          <p style="color:var(--color-danger);">${escapeHTML(error)}</p>
          <button class="btn btn-primary" style="margin-top:var(--space-md);" onclick="history.back()">返回</button>
        </div>
      `;
      return;
    }

    currentBatch = data.batch;
    currentParents = data.parents || [];
    currentChildren = data.children || [];

    renderFull(container);
  }

  function renderFull(container) {
    const b = currentBatch;
    const st = BatchState.statusLabel(b.status);

    container.innerHTML = `
      <div class="page-header">
        <a href="#/orders/${b.order_id}" class="btn btn-ghost" style="font-size:0.85rem;">← 订单</a>
        <h1>#${escapeHTML(b.batch_no)}</h1>
        <span>${renderStatusBadge(b.status)}</span>
      </div>

      <div class="card">
        <div style="display:flex;flex-wrap:wrap;gap:var(--space-md);font-size:var(--font-size-sm);">
          <div><span style="color:var(--text-secondary);">编号:</span> ${escapeHTML(b.batch_no)}</div>
          <div><span style="color:var(--text-secondary);">数量:</span> ${Format.number(b.quantity)}片</div>
          <div><span style="color:var(--text-secondary);">颜色:</span> ${escapeHTML(b.color || '—')}</div>
          <div><span style="color:var(--text-secondary);">状态:</span> ${escapeHTML(st.label)}</div>
          <div><span style="color:var(--text-secondary);">所属订单:</span> <a href="#/orders/${b.order_id}" style="color:var(--color-primary);">#${escapeHTML(b.order?.order_no || '')}</a></div>
          <div><span style="color:var(--text-secondary);">当前位置:</span> ${escapeHTML(b.current_location || '—')}</div>
          <div><span style="color:var(--text-secondary);">当前工序:</span> ${escapeHTML(b.current_process_name || '—')}</div>
          <div><span style="color:var(--text-secondary);">备注:</span> ${escapeHTML(b.note || '—')}</div>
          <div><span style="color:var(--text-secondary);">创建时间:</span> ${Format.date(b.created_at)}</div>
        </div>
      </div>

      <div class="section-title" style="margin-top:var(--space-lg);">父批次</div>
      ${currentParents.length === 0
        ? `<div class="card" style="color:var(--text-secondary);font-size:var(--font-size-sm);">无（根批次）</div>`
        : `<div class="card" style="padding:0;overflow:hidden;">${renderParentRows()}</div>`
      }

      <div class="section-title" style="margin-top:var(--space-lg);">子批次</div>
      ${currentChildren.length === 0
        ? `<div class="card" style="color:var(--text-secondary);font-size:var(--font-size-sm);">尚未拆分</div>`
        : `<div class="card" style="padding:0;overflow:hidden;">${renderChildRows()}</div>`
      }

      <div style="margin-top:var(--space-lg);">
        <button class="btn btn-primary" onclick="BatchDetailPage.showSplitModal()">拆分批次</button>
      </div>
    `;
  }

  function renderParentRows() {
    return currentParents.map(r => {
      const src = r.source || {};
      return `
        <div style="padding:var(--space-md);border-bottom:1px solid var(--bg-muted);display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="Router.navigate('/batches/${src.id}')">
          <span style="font-weight:600;">#${escapeHTML(src.batch_no)}</span>
          <span style="font-size:var(--font-size-sm);color:var(--text-secondary);">${Format.number(r.quantity)}片 · ${escapeHTML(src.color || '—')}</span>
        </div>
      `;
    }).join('');
  }

  function renderChildRows() {
    return currentChildren.map(r => {
      const tgt = r.target || {};
      const st = BatchState.statusLabel(tgt.status);
      return `
        <div style="padding:var(--space-md);border-bottom:1px solid var(--bg-muted);display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="Router.navigate('/batches/${tgt.id}')">
          <div>
            <div style="font-weight:600;">#${escapeHTML(tgt.batch_no)}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);">${Format.number(r.quantity)}片 · ${escapeHTML(tgt.color || '—')}</div>
          </div>
          <span>${renderStatusBadge(tgt.status)}</span>
        </div>
      `;
    }).join('');
  }

  function renderStatusBadge(status) {
    const st = BatchState.statusLabel(status);
    return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:var(--font-size-xs);color:#fff;background:${st.color};">${escapeHTML(st.label)}</span>`;
  }

  // ==========================================================
  // Split modal (manual batch_no, dynamic child rows)
  // ==========================================================
  function showSplitModal() {
    const b = currentBatch;
    if (!b) return;

    const allocated = currentChildren.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const allocatable = (Number(b.quantity) || 0) - allocated;

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-box" style="max-width:600px;">
        <div class="dialog-title">拆分批次 #${escapeHTML(b.batch_no)}</div>
        <div class="dialog-content">
          <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-md);">
            批次数量 ${Format.number(b.quantity)}片 · 可分配 ${Format.number(allocatable)}片
          </p>
          <div id="split-rows"></div>
          <button class="btn btn-ghost btn-sm" type="button" id="split-add-row">+ 添加子批次</button>
          <div id="split-error" style="color:var(--color-danger);font-size:var(--font-size-sm);min-height:1.2em;margin-top:var(--space-sm);"></div>
        </div>
        <div class="dialog-actions">
          <button class="btn btn-ghost cancel-btn">取消</button>
          <button class="btn btn-primary confirm-btn">确认拆分</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const rowsEl = overlay.querySelector('#split-rows');
    const errEl = overlay.querySelector('#split-error');
    const confirmBtn = overlay.querySelector('.confirm-btn');

    function addRow(data = {}) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:var(--space-sm);margin-bottom:var(--space-sm);align-items:center;';
      row.innerHTML = `
        <input type="text" class="form-input" placeholder="批次编号(必填)" value="${escapeHTML(data.batch_no || '')}" style="flex:1.4;">
        <input type="number" class="form-input" placeholder="数量" min="1" value="${data.quantity || ''}" style="flex:1;">
        <input type="text" class="form-input" placeholder="颜色(可空)" value="${escapeHTML(data.color || '')}" style="flex:1;">
        <button type="button" class="btn btn-ghost btn-sm" style="flex:0 0 auto;">✕</button>
      `;
      row.querySelector('button').addEventListener('click', () => {
        row.remove();
        if (rowsEl.children.length === 0) addRow();
      });
      rowsEl.appendChild(row);
    }
    addRow();

    overlay.querySelector('#split-add-row').addEventListener('click', () => addRow());

    function collectRows() {
      return Array.from(rowsEl.children).map(row => {
        const inputs = row.querySelectorAll('input');
        return {
          batch_no: inputs[0].value.trim(),
          quantity: Number(inputs[1].value),
          color: inputs[2].value.trim()
        };
      }).filter(c => c.batch_no || c.quantity);
    }

    function close() {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    }

    const escHandler = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', escHandler);

    overlay.querySelector('.cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    confirmBtn.addEventListener('click', async () => {
      const children = collectRows();
      const v = BatchState.validateSplit(b, currentChildren, children);
      if (!v.ok) { errEl.textContent = v.error; return; }

      confirmBtn.disabled = true;
      const res = await BatchesAPI.splitBatch(b.id, children);
      if (!res.ok) {
        errEl.textContent = res.error || '拆分失败';
        confirmBtn.disabled = false;
        return;
      }
      close();
      Toast.success('拆分成功');
      await render(b.id);
    });
  }

  function escapeHTML(str) {
    return DOM.escapeHtml(str);
  }

  return { render, showSplitModal };
})();
