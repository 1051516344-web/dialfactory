/* ============================================================
   DialFactory V1 · P3 Order Create Page
   UI-only 2-step wizard. All logic in OrderCreate domain.
   ============================================================ */

const OrderCreatePage = (() => {

  let step = 1;
  let formData = {};
  let routeSteps = [];

  async function render() {
    step = 1;
    formData = {};
    routeSteps = [];

    const container = document.getElementById('page-container');
    if (!container) return;

    const [custResult, routeResult] = await Promise.all([
      CustomersAPI.list(),
      ProcessesAPI.listRoutes()
    ]);
    const customers = custResult.ok ? custResult.data : [];
    const routes = routeResult.ok ? routeResult.data : [];

    renderStep1(container, customers, routes);
  }

  // ==========================================================
  // Step 1: Basic Info
  // ==========================================================
  function renderStep1(container, customers, routes) {
    const custOptions = customers.length > 0
      ? customers.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('')
      : '<option value="">— 暂无客户数据，可手动输入 —</option>';

    const routeOptions = routes.map(r =>
      `<option value="${r.id}">${escapeHTML(r.name)} (${r.steps?.length || 0}道工序)</option>`
    ).join('');

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
          <label class="form-label">工艺路线 *</label>
          <select id="form-route" class="form-select"><option value="">— 请选择 —</option>${routeOptions}</select>
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
  // Step 2: Route Confirmation (ADL-001)
  // ==========================================================
  async function goToStep2() {
    // Collect form data
    const container = document.getElementById('page-container');
    formData.order_no    = document.getElementById('form-order-no')?.value || '';
    formData.order_qty   = document.getElementById('form-qty')?.value || '';
    formData.due_date    = document.getElementById('form-due')?.value || '';
    formData.base_texture = document.getElementById('form-texture')?.value || '';
    formData.plate_color = document.getElementById('form-color')?.value || '';
    formData.sand_type   = document.getElementById('form-sand')?.value || '';
    formData.route_id    = document.getElementById('form-route')?.value || '';
    formData.note        = document.getElementById('form-note')?.value || '';

    const custSelect = document.getElementById('form-customer');
    if (custSelect) {
      formData.customer_id = custSelect.value || null;
    } else {
      formData.customer_id = null;
      formData._customer_text = document.getElementById('form-customer-text')?.value || '';
    }

    // Quick validation
    const v = OrderCreate.validateOrderForm(formData, []);
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

    // Load route steps
    const route = document.getElementById('form-route')?.selectedOptions?.[0];
    formData.route_name = route?.text?.split(' (')[0] || '';

    container.innerHTML = `<div class="page-header"><h1>确认工序</h1></div>${Skeleton.cards(3)}`;

    const { ok: rok, data: routeData } = await ProcessesAPI.getRouteWithSteps(formData.route_id);
    if (!rok) {
      container.innerHTML = `
        <div class="page-header"><h1>确认工序</h1></div>
        <div class="card" style="text-align:center;"><p style="color:var(--color-danger);">无法加载路线步骤</p></div>
      `;
      return;
    }

    routeSteps = (routeData.steps || []).map(s => ({
      ...s,
      confirmed: true  // default: all confirmed
    }));

    step = 2;
    renderStep2(container);
  }

  function renderStep2(container) {
    const rows = routeSteps.map((s, i) => {
      const locked = s.is_required;
      const status = locked ? 'locked' : (s.confirmed ? 'confirmed' : 'cancelled');
      const label = locked ? '🔒 必修' : (s.confirmed ? '✅ 确认' : '❌ 取消');
      const click = locked ? '' : `onclick="OrderCreatePage.toggleStep(${i})"`;

      return `
        <div class="route-step-row">
          <span class="route-step-seq">${s.seq}</span>
          <div class="route-step-info">
            <span class="route-step-name">${escapeHTML(s.code)} ${escapeHTML(s.name)}</span>
            <span class="route-step-dept">${escapeHTML(s.type)} · ${escapeHTML(s.dept_name || '—')}</span>
          </div>
          ${locked ? '<span class="route-step-required">必修</span>' : ''}
          <span class="route-step-toggle ${status}" ${click}>${label}</span>
        </div>
      `;
    }).join('');

    const confirmedCount = routeSteps.filter(s => s.confirmed).length;
    const cancelledCount = routeSteps.filter(s => !s.confirmed).length;

    container.innerHTML = `
      <div class="page-header">
        <a href="javascript:OrderCreatePage.backToStep1()" class="btn btn-ghost" style="font-size:0.85rem;">← 返回修改</a>
        <h1>确认工序</h1>
      </div>

      <div class="card">
        <div style="margin-bottom:var(--space-md);color:var(--text-secondary);font-size:var(--font-size-sm);">
          路线: <strong>${escapeHTML(formData.route_name)}</strong><br>
          以下为该路线的全部建议工序。必修工序 (🔒) 不可取消。
        </div>

        ${rows}

        <div style="margin-top:var(--space-md);padding-top:var(--space-md);border-top:1px solid var(--bg-muted);
                    display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:var(--font-size-sm);color:var(--text-secondary);">
            已确认: ${confirmedCount} 道 · 已取消: ${cancelledCount} 道
          </span>
          <div style="display:flex;gap:var(--space-sm);">
            <button class="btn btn-ghost" onclick="OrderCreatePage.backToStep1()">← 返回修改</button>
            <button class="btn btn-primary" id="btn-submit"
                    ${confirmedCount === 0 ? 'disabled' : ''}
                    onclick="OrderCreatePage.submitOrder()">创建订单 ✓</button>
          </div>
        </div>
      </div>
    `;
  }

  function toggleStep(index) {
    if (routeSteps[index].is_required) return;
    routeSteps[index].confirmed = !routeSteps[index].confirmed;
    renderStep2(document.getElementById('page-container'));
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

    const result = await OrderCreate.submit(formData, routeSteps);

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

  return { render, goToStep2, toggleStep, backToStep1, submitOrder };
})();
