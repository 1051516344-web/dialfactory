/* ============================================================
   DialFactory V1 · P3 Order Create Page
   UI-only 2-step wizard. All logic in OrderCreate domain.
   ============================================================ */

const OrderCreatePage = (() => {

  let step = 1;
  let formData = {};
  let processList = [];    // all 35 processes for Route Builder
  let selectedMap = {};    // process_id -> boolean

  async function render() {
    step = 1;
    formData = {};
    processList = [];
    selectedMap = {};

    const container = document.getElementById('page-container');
    if (!container) return;

    const [custResult, procResult] = await Promise.all([
      CustomersAPI.list(),
      ProcessesAPI.listProcesses()
    ]);
    const customers = custResult.ok ? custResult.data : [];
    processList = procResult.ok ? procResult.data : [];

    // Pre-load dept names
    if (processList.length > 0) {
      const deptIds = [...new Set(processList.map(p => p.default_dept_id).filter(Boolean))];
      if (deptIds.length > 0) {
        for (const did of deptIds) {
          if (!deptCache[did]) {
            const { ok, data } = await DB.call(DB.get().from('departments').select('name').eq('id', did).single());
            if (ok && data) deptCache[did] = data.name;
          }
        }
      }
    }

    renderStep1(container, customers);
  }

  let deptCache = {};

  // ==========================================================
  // Step 1: Basic Info
  // ==========================================================
  function renderStep1(container, customers) {
    const custOptions = customers.length > 0
      ? customers.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('')
      : '<option value="">— 暂无客户数据，可手动输入 —</option>';

    const texOptions = CONFIG.BASE_TEXTURES.map(t => `<option value="${t}">${t}</option>`).join('');
    const sandOptions = CONFIG.SAND_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');

    container.innerHTML = `
      <div class="page-header">
        <a href="#/orders" class="btn btn-ghost" style="font-size:0.85rem;">← 返回</a>
        <h1>新建订单</h1>
      </div>

      <div class="card">
        <div class="form-group">
          <label class="form-label">订单编号 *</label>
          <input type="text" id="form-order-no" class="form-input" placeholder="如 CUST-2026-0088" value="${escapeHTML(formData.order_no || '')}">
        </div>

        <div class="form-group">
          <label class="form-label">客户 *</label>
          ${customers.length > 0
            ? `<select id="form-customer" class="form-select">${custOptions}</select>`
            : `<input type="text" id="form-customer-text" class="form-input" placeholder="输入客户名称">`
          }
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md);">
          <div class="form-group">
            <label class="form-label">订单数量 *</label>
            <input type="number" id="form-qty" class="form-input" placeholder="件数" min="1" value="${escapeHTML(formData.order_qty || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">交期 *</label>
            <input type="date" id="form-due" class="form-input" value="${escapeHTML(formData.due_date || '')}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">底质纹理</label>
          <select id="form-texture" class="form-select"><option value="">—</option>${texOptions}</select>
        </div>
        <div class="form-group">
          <label class="form-label">电镀颜色</label>
          <input type="text" id="form-color" class="form-input" placeholder="如 银白60s" value="${escapeHTML(formData.plate_color || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">喷砂类型</label>
          <select id="form-sand" class="form-select"><option value="">—</option>${sandOptions}</select>
        </div>

        <div class="form-group">
          <label class="form-label">备注</label>
          <textarea id="form-note" class="form-textarea" rows="2" placeholder="选填">${escapeHTML(formData.note || '')}</textarea>
        </div>

        <div id="step1-errors" style="color:var(--color-danger);font-size:var(--font-size-sm);margin-bottom:var(--space-md);"></div>

        <button class="btn btn-primary" style="width:100%;" onclick="OrderCreatePage.goToStep2()">
          下一步：确认工序 →
        </button>
      </div>
    `;
  }

  // ==========================================================
  // Step 2: Route Builder — Dept-grouped checklist
  // ==========================================================
  async function goToStep2() {
    const container = document.getElementById('page-container');
    formData.order_no    = document.getElementById('form-order-no')?.value || '';
    formData.order_qty   = document.getElementById('form-qty')?.value || '';
    formData.due_date    = document.getElementById('form-due')?.value || '';
    formData.base_texture = document.getElementById('form-texture')?.value || '';
    formData.plate_color = document.getElementById('form-color')?.value || '';
    formData.sand_type   = document.getElementById('form-sand')?.value || '';
    formData.note        = document.getElementById('form-note')?.value || '';
    formData.route_id    = null;
    formData.source      = 'manual';

    const custSelect = document.getElementById('form-customer');
    if (custSelect) {
      formData.customer_id = custSelect.value || null;
    } else {
      formData.customer_id = null;
    }

    // Skip steps check
    const v = OrderCreate.validateOrderForm(formData, [], { checkSteps: false });
    if (!v.valid) {
      document.getElementById('step1-errors').innerHTML = v.errors.map(e => `<div>· ${escapeHTML(e)}</div>`).join('');
      return;
    }

    // Check uniqueness
    const { ok, data: existing } = await OrdersAPI.list({ search: formData.order_no });
    if (ok && existing && existing.some(o => o.order_no === formData.order_no)) {
      document.getElementById('step1-errors').innerHTML = '<div>· 订单编号已存在</div>';
      return;
    }

    // Init selection: none checked initially
    selectedMap = {};
    processList.forEach(p => { selectedMap[p.id] = false; });

    step = 2;
    renderStep2(container);
  }

  function renderStep2(container) {
    // Group processes by department
    const deptGroups = {};
    processList.forEach(p => {
      const deptName = deptCache[p.default_dept_id] || '其他';
      if (!deptGroups[deptName]) deptGroups[deptName] = [];
      deptGroups[deptName].push(p);
    });

    // Sort depts by config order
    const sortedDepts = CONFIG.DEPT_ORDER.filter(d => deptGroups[d]);
    // Add any depts not in config order
    Object.keys(deptGroups).forEach(d => {
      if (!sortedDepts.includes(d)) sortedDepts.push(d);
    });

    const deptSections = sortedDepts.map(deptName => {
      const procs = deptGroups[deptName].sort((a, b) => a.code.localeCompare(b.code));
      const checks = procs.map(p => {
        const checked = selectedMap[p.id] ? 'checked' : '';
        return `<label style="display:inline-flex;align-items:center;gap:4px;margin:2px 8px 2px 0;font-size:0.85rem;cursor:pointer;">
          <input type="checkbox" ${checked} onchange="OrderCreatePage.toggleProcess('${p.id}')" style="cursor:pointer;">
          <span>${escapeHTML(p.code)} ${escapeHTML(p.name)}</span>
        </label>`;
      }).join('');

      return `<div style="margin-bottom:var(--space-md);">
        <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;color:var(--text-secondary);">
          ${escapeHTML(deptName)} (${procs.length})
        </div>
        <div style="display:flex;flex-wrap:wrap;">${checks}</div>
      </div>`;
    }).join('');

    const selectedCount = Object.values(selectedMap).filter(Boolean).length;

    container.innerHTML = `
      <div class="page-header">
        <a href="javascript:OrderCreatePage.backToStep1()" class="btn btn-ghost" style="font-size:0.85rem;">← 返回修改</a>
        <h1>建立生产路线</h1>
      </div>

      <div class="card">
        <div style="margin-bottom:var(--space-md);">
          <input type="text" class="form-input" placeholder="搜索工序名称或编号..." style="max-width:300px;"
                 oninput="OrderCreatePage.filterProcesses(this.value)">
        </div>

        <div id="dept-sections">
          ${deptSections}
        </div>

        <div style="margin-top:var(--space-md);padding-top:var(--space-md);border-top:1px solid var(--bg-muted);
                    display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:var(--font-size-sm);color:var(--text-secondary);">
            已选择: ${selectedCount} 道工序
          </span>
          <div style="display:flex;gap:var(--space-sm);">
            <button class="btn btn-ghost" onclick="OrderCreatePage.backToStep1()">← 返回修改</button>
            <button class="btn btn-primary" id="btn-submit"
                    ${selectedCount === 0 ? 'disabled' : ''}
                    onclick="OrderCreatePage.submitOrder()">创建订单 ✓</button>
          </div>
        </div>
      </div>
    `;
  }

  function toggleProcess(processId) {
    selectedMap[processId] = !selectedMap[processId];
    renderStep2(document.getElementById('page-container'));
  }

  function filterProcesses(query) {
    if (!query || !query.trim()) {
      // Show all
      document.querySelectorAll('#dept-sections label').forEach(el => el.style.display = '');
      document.querySelectorAll('#dept-sections > div > div:first-child').forEach(el => el.style.display = '');
      return;
    }
    const q = query.trim().toLowerCase();
    document.querySelectorAll('#dept-sections label').forEach(el => {
      const text = el.textContent.toLowerCase();
      el.style.display = text.includes(q) ? '' : 'none';
    });
  }

  function backToStep1() {
    step = 1;
    render();
  }

  // ==========================================================
  // Submit
  // ==========================================================
  async function submitOrder() {
    const btn = document.getElementById('btn-submit');
    if (btn) { btn.disabled = true; btn.textContent = '创建中...'; }

    // Build selected steps from processList + selectedMap + deptCache
    const selectedSteps = processList.map(p => ({
      process_id: p.id,
      process_code: p.code,
      process_name: p.name,
      dept_id: p.default_dept_id,
      dept_name: deptCache[p.default_dept_id] || '',
      selected: !!selectedMap[p.id]
    }));

    formData.source = 'manual';
    const result = await OrderCreate.submit(formData, selectedSteps);

    if (result.ok) {
      Router.navigate('/orders/' + result.orderId);
    } else {
      if (btn) { btn.disabled = false; btn.textContent = '创建订单 ✓'; }
      alert(result.error || '创建失败，请重试');
    }
  }

  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { render, goToStep2, toggleProcess, filterProcesses, backToStep1, submitOrder };
})();
