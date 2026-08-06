/* ============================================================
   DialFactory V1 · P1 Dashboard Page
   CONSTRAINT D-2-002: All queries through API layer
   CONSTRAINT D-2-004: Centralized data loading via Promise.all
   ============================================================ */

const DashboardPage = (() => {

  let deptMap = {}; // id → name cache

  async function render() {
    const container = document.getElementById('page-container');
    if (!container) return;

    // Loading
    container.innerHTML = `
      <div class="page-header"><h1>DialFactory</h1></div>
      ${Skeleton.cards(4)}
    `;

    // Load dept map first
    await loadDeptMap();

    // Centralized data fetch — CONSTRAINT D-2-004
    const [ordersResult, activeNodesResult] = await Promise.all([
      OrdersAPI.list({ pageSize: 1000 }), // get all for dashboard aggregation
      DB.call(
        DB.get().from('order_nodes')
          .select('order_id, dept_id, dept_name, status, updated_at, process_name, seq')
          .eq('status', 'active')
          .order('seq', { ascending: true })
      )
    ]);

    if (!ordersResult.ok) {
      container.innerHTML = `
        <div class="page-header"><h1>DialFactory</h1></div>
        <div class="card" style="text-align:center;padding:var(--space-xl);">
          <p style="font-size:2rem;">⚠️</p>
          <p style="color:var(--color-danger);">加载失败</p>
          <button class="btn btn-primary" style="margin-top:var(--space-md);" onclick="DashboardPage.render()">重试</button>
        </div>
      `;
      return;
    }

    const orders = ordersResult.data || [];
    const activeNodes = (activeNodesResult.ok ? activeNodesResult.data : []) || [];

    // Compute stats
    const stats = computeStats(orders);
    const stalledItems = computeStalled(activeNodes);
    const dueItems = computeDueSoon(orders);
    const deptCounts = computeDeptQueue(activeNodes);

    // Render
    container.innerHTML = `
      <div class="page-header">
        <h1>DialFactory</h1>
        <a href="#/orders/new" class="btn btn-primary">+ 新建订单</a>
      </div>

      <div class="stats-grid">
        <div class="card stats-card stats-active" onclick="Router.navigate('/orders')">
          <div class="stats-value">${stats.inProduction}</div>
          <div class="stats-label">生产中</div>
        </div>
        <div class="card stats-card stats-paused" onclick="Router.navigate('/orders')">
          <div class="stats-value">${stats.paused}</div>
          <div class="stats-label">已暂停</div>
        </div>
        <div class="card stats-card stats-done" onclick="Router.navigate('/orders')">
          <div class="stats-value">${stats.completed}</div>
          <div class="stats-label">已完成</div>
        </div>
        <div class="card stats-card" style="border-top:3px solid #9CA3AF;" onclick="Router.navigate('/orders')">
          <div class="stats-value" style="color:#9CA3AF;">${stats.cancelled}</div>
          <div class="stats-label">已取消</div>
        </div>
      </div>

      ${renderStalledSection(stalledItems, orders)}
      ${renderDueSection(dueItems, orders)}
      ${renderDeptSection(deptCounts)}
    `;
  }

  function computeStats(orders) {
    let inProduction = 0, paused = 0, completed = 0, cancelled = 0;
    for (const o of orders) {
      if (o.status === 'in_production') inProduction++;
      else if (o.status === 'paused') paused++;
      else if (o.status === 'completed') completed++;
      else if (o.status === 'cancelled') cancelled++;
    }
    return { inProduction, paused, completed, cancelled };
  }

  function computeStalled(activeNodes) {
    const now = Date.now();
    const stalled = [];
    const seen = new Set();
    for (const n of activeNodes) {
      if (seen.has(n.order_id)) continue;
      const days = Math.floor((now - new Date(n.updated_at).getTime()) / (1000 * 60 * 60 * 24));
      if (days >= CONFIG.STALL_DAYS) {
        stalled.push({ ...n, stalledDays: days });
        seen.add(n.order_id);
      }
    }
    return stalled.sort((a, b) => b.stalledDays - a.stalledDays);
  }

  function computeDueSoon(orders) {
    const now = new Date();
    return orders
      .filter(o => {
        if (o.status === 'completed') return false;
        const diff = Math.ceil((new Date(o.due_date) - now) / (1000 * 60 * 60 * 24));
        return diff >= 0 && diff <= 3;
      })
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  }

  function computeDeptQueue(activeNodes) {
    const counts = {};
    for (const n of activeNodes) {
      const name = n.dept_name || deptMap[n.dept_id] || '—';
      counts[name] = (counts[name] || 0) + 1;
    }
    return counts;
  }

  function renderStalledSection(items, orders) {
    if (items.length === 0) {
      return `
        <div class="section-title">⚠️ 卡顿订单</div>
        ${EmptyState.render({ icon: '✅', title: '无卡顿订单', desc: '所有进行中的订单都在正常流转。' })}
      `;
    }
    const orderMap = {};
    orders.forEach(o => { orderMap[o.id] = o; });

    const chips = items.map(item => {
      const order = orderMap[item.order_id];
      const orderNo = order ? order.order_no : item.order_id.slice(0, 8);
      return `
        <div class="card order-card" onclick="Router.navigate('/orders/${item.order_id}')" style="cursor:pointer;">
          <div class="order-card-warning stalled">
            ⚠ #${escapeHTML(orderNo)} · ${escapeHTML(item.dept_name || '—')}${escapeHTML(item.process_name || '')} · ${Format.stalledSince(item.updated_at)}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="section-title">⚠️ 卡顿订单 (${items.length})</div>
      ${chips}
    `;
  }

  function renderDueSection(items, orders) {
    if (items.length === 0) {
      return `
        <div class="section-title">⏰ 交期预警</div>
        ${EmptyState.render({ icon: '✅', title: '无交期预警', desc: '未来3天内无到期订单。' })}
      `;
    }

    const chips = items.map(o => `
      <div class="card order-card" onclick="Router.navigate('/orders/${o.id}')" style="cursor:pointer;">
        <div class="order-card-warning due-soon">
          ⏰ #${escapeHTML(o.order_no)} · ${Format.date(o.due_date)} · ${Format.dueDays(o.due_date)}
        </div>
      </div>
    `).join('');

    return `
      <div class="section-title">⏰ 交期预警 (${items.length})</div>
      ${chips}
    `;
  }

  function renderDeptSection(counts) {
    const deptNames = ['制一', '制二', '制三', '制四', '总QC'];
    const cells = deptNames.map(name => {
      const count = counts[name] || 0;
      return `
        <div class="card dept-queue-card" onclick="Router.navigate('/orders')">
          <div class="dept-queue-name">${name}</div>
          <div class="dept-queue-count">${count}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="section-title">部门待办</div>
      <div class="dept-grid">
        ${cells}
      </div>
    `;
  }

  async function loadDeptMap() {
    if (Object.keys(deptMap).length > 0) return;
    const { ok, data } = await DB.call(DB.get().from('departments').select('id, name'));
    if (ok && data) {
      data.forEach(d => { deptMap[d.id] = d.name; });
    }
  }

  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { render };
})();
