/* ============================================================
   DialFactory V1 · P6 Exception List Page
   Read-only. All data via ExceptionsAPI.listAll().
   ============================================================ */

const ExceptionListPage = (() => {

  let currentType = '';
  let currentPage = 0;
  let allItems = [];

  async function render() {
    currentPage = 0;
    allItems = [];

    const container = document.getElementById('page-container');
    if (!container) return;

    container.innerHTML = `
      <div class="page-header"><h1>异常记录</h1></div>
      ${renderFilterBar()}
      ${Skeleton.cards(5)}
    `;

    const { ok, data, count, error } = await ExceptionsAPI.listAll({ type: currentType || undefined, page: 0 });

    if (!ok) {
      container.innerHTML = `
        <div class="page-header"><h1>异常记录</h1></div>
        ${renderFilterBar()}
        <div class="card" style="text-align:center;padding:var(--space-xl);">
          <p style="font-size:2rem;">⚠️</p>
          <p style="color:var(--color-danger);">${escapeHTML(error || '加载失败')}</p>
          <button class="btn btn-primary" style="margin-top:var(--space-md);" onclick="ExceptionListPage.render()">重试</button>
        </div>
      `;
      return;
    }

    const items = data || [];
    allItems = items;
    renderFull(container, items, count || items.length);
  }

  function renderFilterBar() {
    const typeOptions = ['', ...CONFIG.EXCEPTION_TYPES].map(t =>
      `<option value="${t}" ${currentType === t ? 'selected' : ''}>${t || '全部类型'}</option>`
    ).join('');

    return `
      <div class="filter-bar">
        <select class="form-select" onchange="ExceptionListPage.onFilter(this.value)">
          ${typeOptions}
        </select>
        <span style="font-size:var(--font-size-sm);color:var(--text-secondary);display:flex;align-items:center;">
          共 ${allItems.length} 条
        </span>
      </div>
    `;
  }

  async function onFilter(type) {
    currentType = type;
    currentPage = 0;
    allItems = [];

    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="page-header"><h1>异常记录</h1></div>
      ${renderFilterBar()}
      ${Skeleton.cards(5)}
    `;

    const { ok, data, count, error } = await ExceptionsAPI.listAll({ type: currentType || undefined, page: 0 });

    if (!ok) {
      container.innerHTML = `
        <div class="page-header"><h1>异常记录</h1></div>
        ${renderFilterBar()}
        <div class="card" style="text-align:center;"><p style="color:var(--color-danger);">${escapeHTML(error)}</p></div>
      `;
      return;
    }

    allItems = data || [];
    renderFull(container, allItems, count || allItems.length);
  }

  async function loadMore() {
    currentPage++;
    const { ok, data } = await ExceptionsAPI.listAll({ type: currentType || undefined, page: currentPage });
    if (!ok || !data || data.length === 0) return;

    allItems = [...allItems, ...data];
    renderFull(document.getElementById('page-container'), allItems, allItems.length);
  }

  function renderFull(container, items, totalCount) {
    if (items.length === 0) {
      container.innerHTML = `
        <div class="page-header"><h1>异常记录</h1></div>
        ${renderFilterBar()}
        ${EmptyState.render({ icon: '✅', title: '无异常记录', desc: currentType ? `没有 "${currentType}" 类型的异常。` : '所有订单暂无质量异常。' })}
      `;
      return;
    }

    const cardsHtml = items.map(e => renderCard(e)).join('');
    const hasMore = items.length >= (currentPage + 1) * CONFIG.PAGE_SIZE;

    container.innerHTML = `
      <div class="page-header"><h1>异常记录</h1></div>
      ${renderFilterBar()}
      ${cardsHtml}
      ${hasMore ? `
        <div style="text-align:center;margin-top:var(--space-md);">
          <button class="btn btn-ghost" onclick="ExceptionListPage.loadMore()">加载更多...</button>
        </div>
      ` : ''}
    `;
  }

  function renderCard(e) {
    const node = e.node || {};
    const orders = node.orders || {};
    const orderId = node.order_id;

    return `
      <div class="card exception-list-card" onclick="Router.navigate('/orders/${orderId}')">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-weight:600;color:var(--color-danger);">${escapeHTML(e.type)}</span>
          <span style="font-size:var(--font-size-sm);color:var(--text-muted);">${Format.date(e.created_at)}</span>
        </div>
        <div style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-top:var(--space-xs);">
          ${escapeHTML(String(e.qty))}件 · ${escapeHTML(e.resolution || '—')}
        </div>
        <div style="font-size:var(--font-size-sm);color:var(--text-muted);margin-top:2px;">
          #${escapeHTML(orders.order_no || '—')} · ${escapeHTML(node.process_name || '—')}
        </div>
      </div>
    `;
  }

  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  return { render, onFilter, loadMore };
})();
