/* ============================================================
   DialFactory V1 · 首页 = 今日待办清单（巡检式使用）

   数据来源（全部为现有 API，不依赖 production_records.status='生产中' 的旧口径）：
     OrdersAPI.list({})                          → 在产 + 已暂停（默认已排除终态）
     OrdersAPI.getNodeStats(ids)                  → 当前工序 / 距上次更新 / 进度
     ProductionRecordsAPI.getRecentActivity(20)   → 最近生产动态
     ProductionRecordsAPI.getTodayCompleted()     → 今日完成工序数
   排序：updated_at 升序（与订单列表页一致 —— 两页顺序必须相同）
   ============================================================ */

const DashboardPage = (() => {

  const TODO_LIMIT = 8;   // 待巡检清单条数
  const DUE_LIMIT  = 5;   // 交期临近条数

  async function render() {
    const container = document.getElementById('page-container');
    if (!container) return;

    container.innerHTML = `
      <div class="page-header">
        <h1>今日待办</h1>
        <a href="#/orders/new" class="btn btn-primary">+ 新建订单</a>
      </div>
      ${Skeleton.cards(3)}
    `;

    // 主数据：在产 + 已暂停（list({}) 默认已排除 completed / cancelled）
    // 另外两个是各自独立的轻查询；不再使用 getProductionOverview 的 currentProduction 旧口径
    const [ordersResult, recentResult, todayResult] = await Promise.all([
      OrdersAPI.list({ pageSize: 100 }),
      ProductionRecordsAPI.getRecentActivity(20),
      ProductionRecordsAPI.getTodayCompleted()
    ]);

    if (!ordersResult.ok) {
      container.innerHTML = `
        <div class="page-header"><h1>今日待办</h1></div>
        <div class="card" style="text-align:center;padding:var(--space-xl);">
          <p style="font-size:2rem;">⚠️</p>
          <p style="color:var(--color-danger);">加载失败</p>
          <p style="font-size:var(--font-size-sm);color:var(--text-secondary);">${escapeHTML(String(ordersResult.error || ''))}</p>
          <button class="btn btn-primary" style="margin-top:var(--space-md);" onclick="DashboardPage.render()">重试</button>
        </div>
      `;
      return;
    }

    const orders = ordersResult.data || [];
    const recentActivity = recentResult.ok ? (recentResult.data || []) : [];
    const todayDone = (todayResult.ok && todayResult.count) || 0;

    // 先排序截断，再只为「要显示的两份清单」取节点统计（≤ 13 单）
    const todoTop = orders.slice().sort(sortByUpdatedAsc).slice(0, TODO_LIMIT);
    const dueTop = pickDueSoon(orders);
    const needIds = [...new Set([...todoTop, ...dueTop].map(o => o.id))];

    let statsMap = {};
    if (needIds.length > 0) {
      const statsResult = await OrdersAPI.getNodeStats(needIds);
      if (statsResult.ok) statsMap = statsResult.data;
    }
    const attachStats = (list) => list.map(o => ({ ...o, stats: statsMap[o.id] || defaultStats() }));

    const summary = buildSummary(orders, todayDone);
    const truncated = (ordersResult.count || 0) > orders.length;

    container.innerHTML = `
      <div class="page-header">
        <h1>今日待办</h1>
        <a href="#/orders/new" class="btn btn-primary">+ 新建订单</a>
      </div>

      ${renderSummaryLine(summary, truncated)}
      ${renderTodoList(attachStats(todoTop), orders.length)}
      ${renderDueSoon(attachStats(dueTop))}
      ${renderRecentActivity(recentActivity)}
    `;
  }

  // ==========================================================
  // 汇总行（一行小字，取代原来的 4 张大 KPI 卡）
  // 口径统一为「订单状态 + 交期 + production_records 已完成」，与列表页同源
  // ==========================================================
  function renderSummaryLine(s, truncated) {
    const tail = truncated ? ' · <span style="color:var(--color-danger);">仅统计前 100 单</span>' : '';
    return `
      <div class="order-list-count">
        在产 <strong>${s.active}</strong> ·
        已暂停 <strong>${s.paused}</strong> ·
        逾期 <strong style="${s.overdue > 0 ? 'color:var(--color-danger);' : ''}">${s.overdue}</strong> ·
        今日完成工序 <strong>${s.todayDone}</strong>${tail}
      </div>
    `;
  }

  function buildSummary(orders, todayDone) {
    let active = 0, paused = 0, overdue = 0;
    for (const o of orders) {
      if (o.status === 'in_production') active++;
      else if (o.status === 'paused') paused++;
      const d = dueDiffDays(o.due_date);
      if (d != null && d < 0) overdue++;
    }
    return { active, paused, overdue, todayDone };
  }

  // ==========================================================
  // 1 · 待巡检清单（updated_at 升序的前 N 单）
  // ==========================================================
  function renderTodoList(list, totalCount) {
    const header = `
      <div class="section-title">
        <span>待巡检清单 <span style="font-weight:400;color:var(--text-secondary);font-size:var(--font-size-sm);">(前 ${list.length} / 共 ${totalCount} 单)</span></span>
        <a href="#/orders" style="font-size:var(--font-size-sm);color:var(--color-primary);text-decoration:none;">查看全部 →</a>
      </div>
    `;
    if (list.length === 0) {
      return header + EmptyState.render({ icon: '✅', title: '没有需要巡检的订单', desc: '当前没有在产或已暂停的订单。' });
    }
    return header + `
      <div class="card" style="padding:0;overflow:hidden;">
        <div class="todo-list">${list.map(renderTodoRow).join('')}</div>
      </div>
    `;
  }

  // ==========================================================
  // 2 · 交期临近（已超期 或 3 天内到期，按交期升序）
  // ==========================================================
  function renderDueSoon(list) {
    const header = `
      <div class="section-title">
        <span>交期临近 <span style="font-weight:400;color:var(--text-secondary);font-size:var(--font-size-sm);">(已超期 / 3 天内)</span></span>
      </div>
    `;
    if (list.length === 0) {
      return header + EmptyState.render({ icon: '📅', title: '近 3 天无到期订单', desc: '没有需要催交期的在产订单。' });
    }
    return header + `
      <div class="card" style="padding:0;overflow:hidden;">
        <div class="todo-list">${list.map(renderTodoRow).join('')}</div>
      </div>
    `;
  }

  /** 一行式待办条目：订单号 · 客户简称 · 当前工序(部门) · 距上次更新 · 交期剩余 */
  function renderTodoRow(o) {
    const s = o.stats || {};
    const cur = s.currentNode;
    const proc = cur ? `${cur.dept_name || ''}${cur.process_name || ''}` : '—';
    const pausedBadge = o.status === 'paused'
      ? '<span class="badge badge-sm" style="background:var(--bg-paused);color:#92400E;margin-left:var(--space-xs);">⏸ 已暂停</span>'
      : '';
    const d = dueDiffDays(o.due_date);
    const dueCls = d == null ? '' : (d < 0 ? ' due-over' : (d <= 3 ? ' due-soon' : ''));
    return `
      <div class="todo-row" onclick="Router.navigate('/orders/${o.id}')">
        <span class="todo-order-no">#${escapeHTML(o.order_no)}</span>
        <span class="todo-customer">${escapeHTML(o.customer?.short_name || o.customer?.name || '—')}</span>
        <span class="todo-process">${escapeHTML(proc)}${pausedBadge}</span>
        <span class="todo-updated">${escapeHTML(updatedAgo(o.updated_at))}</span>
        <span class="todo-due${dueCls}">${d == null ? '—' : escapeHTML(Format.dueDays(o.due_date))}</span>
      </div>
    `;
  }

  // ==========================================================
  // 小工具
  // ==========================================================
  /** 交期距今天数：<0 已超期、0 今天到期、>0 还剩 N 天（与 Format.dueDays 同口径） */
  function dueDiffDays(dateStr) {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
  }

  /** 交期临近集合：已超期或 3 天内到期，按交期升序取前 N */
  function pickDueSoon(orders) {
    return orders
      .filter(o => { const d = dueDiffDays(o.due_date); return d != null && d <= 3; })
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, DUE_LIMIT);
  }

  /** 距上次更新：小时级（巡检式使用，整天粒度太粗） */
  function updatedAgo(isoStr) {
    if (!isoStr) return '—';
    const ms = Date.now() - new Date(isoStr).getTime();
    if (ms < 0) return '刚刚更新';
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    if (days >= 1) return `${days} 天未更新`;
    const hours = Math.floor(ms / (1000 * 60 * 60));
    return hours >= 1 ? `${hours} 小时未更新` : '刚刚更新';
  }

  /** 排序：与订单列表页一致（updated_at 升序 = 最久未更新在前） */
  function sortByUpdatedAsc(a, b) {
    return new Date(a.updated_at || 0) - new Date(b.updated_at || 0);
  }

  /** stats 缺省值（与 order-list.js 的 defaultStats 保持一致） */
  function defaultStats() {
    return { total: 0, done: 0, active: 0, paused: 0, waiting: 0, currentNode: null, isStalled: false, stalledDays: 0, hasNodes: false, progressPercent: 0 };
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
