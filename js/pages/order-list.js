/* ============================================================
   DialFactory V1 · P2 Order List Page
   CONSTRAINT D-2-002: All DB access through OrdersAPI / CustomersAPI
   CONSTRAINT D-2-003: Status derived from nodes, not orders.status column
   ============================================================ */

const OrderListPage = (() => {

  let currentFilters = { status: '', customerId: '', search: '', deptId: '', process: '' };
  let currentPage = 0;
  let allOrders = [];

  async function render(filters = {}) {
    // Phase 4: Parse URL query from hash (e.g. #/orders?process=冲板)
    const hash = window.location.hash.slice(1); // /orders?process=冲板
    const urlQuery = {};
    const qIdx = hash.indexOf('?');
    if (qIdx >= 0) {
      hash.slice(qIdx + 1).split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k) urlQuery[decodeURIComponent(k)] = decodeURIComponent(v || '');
      });
    }
    Object.assign(currentFilters, urlQuery, filters);
    currentPage = 0;
    allOrders = [];

    const container = document.getElementById('page-container');
    if (!container) return;

    // P1-FIX: Preload dept cache before renderFilterBar() to prevent 5x duplicate queries
    ensureDeptCache();

    // Loading
    container.innerHTML = `
      <div class="page-header">
        <h1>订单列表</h1>
        <a href="#/orders/new" class="btn btn-primary">+ 新建订单</a>
      </div>
      ${renderFilterBar()}
      ${Skeleton.cards(5)}
    `;

    // Await dept cache + fetch filters data + orders in parallel
    const [custResult, ordersResult] = await Promise.all([
      CustomersAPI.list(),
      OrdersAPI.list({ ...currentFilters, page: 0 }),
      deptCachePromise || Promise.resolve()
    ]);

    if (!ordersResult.ok) {
      container.innerHTML = `
        <div class="page-header"><h1>订单列表</h1></div>
        ${renderFilterBar()}
        <div class="card" style="text-align:center;padding:var(--space-xl);">
          <p style="font-size:2rem;">⚠️</p>
          <p style="color:var(--color-danger);">加载失败：${escapeHTML(ordersResult.error)}</p>
          <button class="btn btn-primary" style="margin-top:var(--space-md);" onclick="OrderListPage.render()">重试</button>
        </div>
      `;
      return;
    }

    const customers = custResult.ok ? custResult.data : [];
    let orders = ordersResult.data || [];

    // Phase 4: Process filter — query production_records for matching orders
    if (currentFilters.process) {
      const { ok: prOk, data: prData } = await ProductionRecordsAPI.listActive();
      if (prOk && prData) {
        const matchingOrderIds = new Set(
          prData.filter(r => r.process_name === currentFilters.process).map(r => r.order_id)
        );
        orders = orders.filter(o => matchingOrderIds.has(o.id));
      }
    }

    allOrders = orders;

    // Batch fetch node stats
    const orderIds = orders.map(o => o.id);
    let nodeStatsMap = {};
    if (orderIds.length > 0) {
      const statsResult = await OrdersAPI.getNodeStats(orderIds);
      if (statsResult.ok) nodeStatsMap = statsResult.data;
    }

    // Merge + sort
    const enriched = orders.map(o => ({
      ...o,
      stats: nodeStatsMap[o.id] || { total: 0, done: 0, active: 0, paused: 0, waiting: 0, currentNode: null, isStalled: false, stalledDays: 0, hasNodes: false, progressPercent: 0 }
    }));

    // Sort: stalled first, then due_date ascending
    enriched.sort((a, b) => {
      if (a.stats.isStalled && !b.stats.isStalled) return -1;
      if (!a.stats.isStalled && b.stats.isStalled) return 1;
      return new Date(a.due_date) - new Date(b.due_date);
    });

    allOrders = enriched;

    // Render
    renderFull(container, enriched, customers, ordersResult.count || 0);
  }

  function renderFilterBar() {
    return `
      <div class="filter-bar">
        <input type="text" class="form-input" placeholder="🔍 搜索订单号..." id="filter-search"
               value="${escapeHTML(currentFilters.search)}"
               oninput="OrderListPage.onSearch(this.value)">
        <select class="form-select" id="filter-status" onchange="OrderListPage.onFilter('status', this.value)">
          <option value="">全部状态</option>
          <option value="in_production" ${currentFilters.status==='in_production'?'selected':''}>生产中</option>
          <option value="paused" ${currentFilters.status==='paused'?'selected':''}>已暂停</option>
          <option value="completed" ${currentFilters.status==='completed'?'selected':''}>已完成</option>
        </select>
        <select class="form-select" id="filter-dept" onchange="OrderListPage.onFilter('deptId', this.value)">
          <option value="">全部部门</option>
          <option value="${getDeptId('制一')}" ${currentFilters.deptId===getDeptId('制一')?'selected':''}>制一</option>
          <option value="${getDeptId('制二')}" ${currentFilters.deptId===getDeptId('制二')?'selected':''}>制二</option>
          <option value="${getDeptId('制三')}" ${currentFilters.deptId===getDeptId('制三')?'selected':''}>制三</option>
          <option value="${getDeptId('制四')}" ${currentFilters.deptId===getDeptId('制四')?'selected':''}>制四</option>
          <option value="${getDeptId('总QC')}" ${currentFilters.deptId===getDeptId('总QC')?'selected':''}>总QC</option>
        </select>
      </div>
    `;
  }

  // Dept name → ID cache
  let deptCache = null;
  let deptCachePromise = null;

  /** P1-FIX: Preload dept cache once — prevents 5x duplicate query race */
  function ensureDeptCache() {
    if (deptCache) return;
    if (!deptCachePromise) {
      deptCachePromise = DB.call(DB.get().from('departments').select('id, name')).then(({ ok, data }) => {
        if (ok) {
          deptCache = {};
          data.forEach(d => { deptCache[d.name] = d.id; });
        }
      });
    }
  }

  async function getDeptId(name) {
    if (!deptCache) {
      await ensureDeptCache();
      await deptCachePromise; // ensure resolved
    }
    return deptCache ? (deptCache[name] || '') : '';
  }

  async function onFilter(key, value) {
    currentFilters[key] = value;
    await render();
  }

  async function onSearch(value) {
    currentFilters.search = value;
    await render();
  }

  async function loadMore() {
    currentPage++;
    const { ok, data: orders } = await OrdersAPI.list({ ...currentFilters, page: currentPage });
    if (!ok || !orders || orders.length === 0) return;

    const orderIds = orders.map(o => o.id);
    const statsResult = await OrdersAPI.getNodeStats(orderIds);
    const nodeStatsMap = statsResult.ok ? statsResult.data : {};

    const enriched = orders.map(o => ({
      ...o,
      stats: nodeStatsMap[o.id] || { total: 0, done: 0, active: 0, paused: 0, waiting: 0, currentNode: null, isStalled: false, stalledDays: 0, hasNodes: false, progressPercent: 0 }
    }));

    allOrders = [...allOrders, ...enriched];
    // Re-render with updated list
    const container = document.getElementById('page-container');
    renderFull(container, allOrders, [], allOrders.length);
  }

  function renderFull(container, orders, _customers, totalCount) {
    if (orders.length === 0) {
      container.innerHTML = `
        <div class="page-header">
          <h1>订单列表</h1>
          <a href="#/orders/new" class="btn btn-primary">+ 新建订单</a>
        </div>
        ${renderFilterBar()}
        ${EmptyState.render({ icon: '📋', title: '暂无订单', desc: '点击右上角"新建订单"创建第一张订单。' })}
      `;
      return;
    }

    const cardsHtml = orders.map(o => renderOrderCard(o)).join('');
    const hasMore = orders.length >= (currentPage + 1) * CONFIG.PAGE_SIZE;

    container.innerHTML = `
      <div class="page-header">
        <h1>订单列表</h1>
        <a href="#/orders/new" class="btn btn-primary">+ 新建订单</a>
      </div>
      ${renderFilterBar()}
      ${currentFilters.process ? `<div style="padding:var(--space-sm) var(--space-md);background:var(--bg-muted);border-radius:var(--radius-sm);margin-bottom:var(--space-md);font-size:var(--font-size-sm);display:flex;align-items:center;gap:var(--space-sm);"><span style="color:var(--text-secondary);">工序筛选:</span><strong>${escapeHTML(currentFilters.process)}</strong><a href="#/orders" style="color:var(--color-primary);margin-left:auto;text-decoration:none;">清除</a></div>` : ''}
      <div class="order-list-count">共 ${totalCount || orders.length} 条订单</div>
      ${cardsHtml}
      ${hasMore ? `<div style="text-align:center;margin-top:var(--space-md);">
        <button class="btn btn-ghost" onclick="OrderListPage.loadMore()">加载更多...</button>
      </div>` : ''}
    `;
  }

  function renderOrderCard(order) {
    const s = order.stats || {};
    const specText = [order.base_texture, order.plate_color, order.specs?.base_plate_color].filter(Boolean).join('+') || '—';
    const prodNo = order.specs?.production_no || '';
    const custOrderNo = order.specs?.customer_order_no || '';
    const warningHtml = s.isStalled
      ? `<div class="order-card-warning stalled">⚠ ${escapeHTML(s.currentNode?.dept_name || '')}${escapeHTML(s.currentNode?.process_name || '')} · ${Format.stalledSince(s.currentNode?.updated_at)}</div>`
      : (isDueSoon(order.due_date)
        ? `<div class="order-card-warning due-soon">⏰ ${Format.date(order.due_date)} · ${Format.dueDays(order.due_date)}</div>`
        : '');

    // Derive status from nodes (not orders.status directly)
    const derivedStatus = s.hasNodes
      ? OrderState.derive(Array(s.total).fill(null).map((_, i) => {
          if (i < s.done) return { status: 'done' };
          if (i < s.done + s.active) return { status: 'active' };
          if (i < s.done + s.active + s.paused) return { status: 'paused' };
          return { status: 'waiting' };
        }))
      : order.status;

    return `
      <div class="card order-card" onclick="Router.navigate('/orders/${order.id}')">
        <div class="order-card-header">
          <span class="order-card-order-no">#${escapeHTML(order.order_no)}</span>
          ${prodNo ? `<span style="font-size:var(--font-size-xs);color:var(--color-primary);font-weight:500;">${escapeHTML(prodNo)}</span>` : ''}
          <span class="order-card-customer">${escapeHTML(order.customer?.short_name || order.customer?.name || '—')}</span>
          ${custOrderNo ? `<span style="font-size:var(--font-size-xs);color:var(--text-secondary);">客单: ${escapeHTML(custOrderNo)}</span>` : ''}
          ${StatusBadge.render(derivedStatus)}
        </div>
        <div class="order-card-meta">
          ${Format.number(order.order_qty)}件 · ${Format.date(order.due_date)} · ${escapeHTML(specText)}
        </div>
        ${ProgressBar.render(s)}
        ${warningHtml}
      </div>
    `;
  }

  function isDueSoon(dateStr) {
    if (!dateStr) return false;
    const due = new Date(dateStr);
    const now = new Date();
    const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff <= 3;
  }

  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { render, onFilter, onSearch, loadMore };
})();
