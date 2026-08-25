/* ============================================================
   DialFactory V1 · Production Dashboard (Phase 3-E)
   Industrial cockpit — 4 sections: KPI → Orders Table → Process Load → Activity
   Data via ProductionRecordsAPI.getProductionOverview()
   ============================================================ */

const DashboardPage = (() => {

  async function render() {
    const container = document.getElementById('page-container');
    if (!container) return;

    container.innerHTML = `
      <div class="page-header"><h1>生产明细</h1></div>
      ${Skeleton.cards(5)}
    `;

    // Fetch overview + customer names in parallel
    const [overviewResult, custResult] = await Promise.all([
      ProductionRecordsAPI.getProductionOverview(),
      CustomersAPI.list()
    ]);

    if (!overviewResult.ok) {
      container.innerHTML = `
        <div class="page-header"><h1>生产明细</h1></div>
        <div class="card" style="text-align:center;padding:var(--space-xl);">
          <p style="font-size:2rem;">⚠️</p>
          <p style="color:var(--color-danger);">加载失败</p>
          <p style="font-size:var(--font-size-sm);color:var(--text-secondary);">${escapeHTML(String(overviewResult.error || ''))}</p>
          <button class="btn btn-primary" style="margin-top:var(--space-md);" onclick="DashboardPage.render()">重试</button>
        </div>
      `;
      return;
    }

    // Build customer lookup map
    const customerMap = {};
    if (custResult.ok && custResult.data) {
      custResult.data.forEach(c => { customerMap[c.id] = c.short_name || c.name; });
    }

    const d = overviewResult.data;

    container.innerHTML = `
      <div class="page-header">
        <h1>生产明细</h1>
        <a href="#/orders/new" class="btn btn-primary">+ 新建订单</a>
      </div>

      ${renderKPIOverview(d)}
      ${renderCurrentOrders(d.currentProduction, customerMap)}
      ${renderProcessDistribution(d.activeProcesses)}
      ${renderRecentActivity(d.recentActivity)}
    `;
  }

  // ==========================================================
  // Section 1 — KPI Overview
  // ==========================================================
  function renderKPIOverview(d) {
    return `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">生产中订单</div>
          <div class="kpi-value" style="color:#2563EB;">${d.totalRunningOrders}</div>
          <div class="kpi-subtitle">当前运行中</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">已完成订单</div>
          <div class="kpi-value" style="color:#16A34A;">${d.todayCompleted}</div>
          <div class="kpi-subtitle">今日完成</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">待处理订单</div>
          <div class="kpi-value" style="color:#EA580C;">${d.pendingOrders}</div>
          <div class="kpi-subtitle">等待录入工序</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">当前生产工序数</div>
          <div class="kpi-value" style="color:#0F172A;">${d.todayActiveProcesses}</div>
          <div class="kpi-subtitle">活跃工序类型</div>
        </div>
      </div>
    `;
  }

  // ==========================================================
  // Section 2 — Current Production Orders Table
  // ==========================================================
  function renderCurrentOrders(orders, customerMap) {
    if (!orders || orders.length === 0) {
      return `
        <div class="section-title">当前生产状态</div>
        ${EmptyState.render({ icon: '📋', title: '无生产中的订单', desc: '当前没有正在生产的订单。' })}
      `;
    }

    const rows = orders.map(o => {
      const specText = [o.base_texture, o.plate_color, o.specs?.base_plate_color].filter(Boolean).join('+') || '—';
      const custName = customerMap[o.customer_id] || '—';
      return `
        <tr class="prod-table-row" onclick="Router.navigate('/orders/${o.order_id}')">
          <td class="prod-table-cell prod-table-order-no">#${escapeHTML(o.order_no)}</td>
          <td class="prod-table-cell prod-table-customer">${escapeHTML(custName)}</td>
          <td class="prod-table-cell prod-table-product">${escapeHTML(specText)}</td>
          <td class="prod-table-cell prod-table-process">${escapeHTML(o.process_name)}</td>
          <td class="prod-table-cell prod-table-status">${StatusBadge.render(o.status)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="section-title section-collapse" onclick="DashboardPage.toggleSection('current-orders')">
        <span>当前生产状态 <span style="font-weight:400;color:var(--text-secondary);font-size:var(--font-size-sm);">(${orders.length})</span></span>
        <span class="collapse-arrow collapse-arrow-open" id="arrow-current-orders">▼</span>
      </div>
      <div class="card collapse-body" style="padding:0;overflow:hidden;" id="body-current-orders">
        <table class="prod-table">
          <thead>
            <tr>
              <th class="prod-table-th">订单号</th>
              <th class="prod-table-th">客户</th>
              <th class="prod-table-th">产品</th>
              <th class="prod-table-th">当前工序</th>
              <th class="prod-table-th">状态</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  // ==========================================================
  // Section 3 — Process Load Distribution
  // ==========================================================
  function renderProcessDistribution(dist) {
    const entries = Object.entries(dist || {});
    if (entries.length === 0) {
      return `
        <div class="section-title">工序负载分布</div>
        ${EmptyState.render({ icon: '📊', title: '无活跃工序', desc: '当前没有正在进行的生产工序。' })}
      `;
    }

    entries.sort((a, b) => b[1] - a[1]);
    const maxCount = Math.max(...entries.map(([, c]) => c), 1);

    const bars = entries.map(([name, count]) => {
      const barPct = Math.round((count / maxCount) * 100);
      return `
        <div class="process-dist-row" onclick="Router.navigate('/orders?process=${encodeURIComponent(name)}')" style="cursor:pointer;">
          <span class="process-dist-name">${escapeHTML(name)}</span>
          <div class="process-dist-bar-track">
            <div class="process-dist-bar-fill" style="width:${barPct}%;"></div>
          </div>
          <span class="process-dist-count">${count}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="section-title section-collapse" onclick="DashboardPage.toggleSection('process-dist')">
        <span>工序负载分布 <span style="font-weight:400;color:var(--text-secondary);font-size:var(--font-size-sm);">(${entries.length})</span></span>
        <span class="collapse-arrow collapse-arrow-open" id="arrow-process-dist">▼</span>
      </div>
      <div class="card collapse-body" id="body-process-dist">
        <div class="process-dist-list">${bars}</div>
      </div>
    `;
  }

  // ==========================================================
  // Section 4 — Recent Activity Feed
  // ==========================================================
  function renderRecentActivity(activities) {
    if (!activities || activities.length === 0) {
      return `
        <div class="section-title">最近生产动态</div>
        ${EmptyState.render({ icon: '📭', title: '暂无动态', desc: '生产活动将显示在这里。' })}
      `;
    }

    const items = activities.map(a => {
      const time = formatTime(a.created_at);
      const orderNo = a.order?.order_no || a.order_id.slice(0, 8);
      let actionLabel;
      if (a.status === '生产中') {
        actionLabel = '开始';
      } else if (a.status === '已完成') {
        actionLabel = '完成';
      } else {
        actionLabel = a.status;
      }
      return `
        <div class="activity-row">
          <span class="activity-time">${time}</span>
          <a href="#/orders/${a.order_id}" class="activity-order">#${escapeHTML(orderNo)}</a>
          <span class="activity-action">${actionLabel} ${escapeHTML(a.process_name)}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="section-title section-collapse" onclick="DashboardPage.toggleSection('recent-activity')">
        <span>最近生产动态 <span style="font-weight:400;color:var(--text-secondary);font-size:var(--font-size-sm);">(${activities.length})</span></span>
        <span class="collapse-arrow collapse-arrow-open" id="arrow-recent-activity">▼</span>
      </div>
      <div class="card collapse-body" style="padding:0;" id="body-recent-activity">
        ${items}
      </div>
    `;
  }

  // ==========================================================
  // Helpers
  // ==========================================================
  function formatTime(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function toggleSection(id) {
    const body = document.getElementById('body-' + id);
    const arrow = document.getElementById('arrow-' + id);
    if (!body || !arrow) return;
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? '' : 'none';
    arrow.textContent = isHidden ? '▼' : '▶';
    arrow.className = isHidden ? 'collapse-arrow collapse-arrow-open' : 'collapse-arrow';
  }

  function escapeHTML(str) {
    return DOM.escapeHtml(str);
  }

  return { render, toggleSection };
})();
