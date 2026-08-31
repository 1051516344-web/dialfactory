/* ============================================================
   DialFactory V1 · P6 Exception List Page
   Read-only. All data via ExceptionsAPI.listAll().
   ============================================================ */

const ExceptionListPage = (() => {

  let currentType = '';
  let currentPage = 0;
  let allItems = [];
  let totalCount = 0;   // server-side exact count (drives "load more" — #16)

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
    totalCount = count || items.length;
    renderFull(container, items, totalCount);
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
          共 ${totalCount || allItems.length} 条
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
    totalCount = count || allItems.length;
    renderFull(container, allItems, totalCount);
  }

  async function loadMore() {
    currentPage++;
    const { ok, data, count } = await ExceptionsAPI.listAll({ type: currentType || undefined, page: currentPage });
    if (!ok || !data || data.length === 0) return;

    allItems = [...allItems, ...data];
    if (count != null) totalCount = count;
    renderFull(document.getElementById('page-container'), allItems, totalCount);
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
    // #16: base "load more" on server-side total, not the loaded-page heuristic
    const hasMore = items.length < totalCount;

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
    // B22: node/order may be orphaned (node deleted) — guard against /orders/undefined
    const node = e.node;
    const orderId = node ? node.order_id : null;
    const orderNo = node?.orders?.order_no || node?.order_no || '—';
    const processName = node?.process_name || '—';

    return `
      <div class="card exception-list-card" ${orderId ? `onclick="Router.navigate('/orders/${orderId}')" style="cursor:pointer;"` : ''}>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-weight:600;color:var(--color-danger);">${escapeHTML(e.type)}</span>
          <span style="font-size:var(--font-size-sm);color:var(--text-muted);">${Format.date(e.created_at)}</span>
        </div>
        <div style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-top:var(--space-xs);">
          ${escapeHTML(String(e.qty))}件 · ${escapeHTML(e.resolution || '—')}
        </div>
        <div style="font-size:var(--font-size-sm);color:var(--text-muted);margin-top:2px;">
          #${escapeHTML(orderNo)} · ${escapeHTML(processName)}
        </div>
      </div>
    `;
  }

  function escapeHTML(str) {
    return DOM.escapeHtml(str);
  }

  return { render, onFilter, loadMore };
})();
