/* ============================================================
   DialFactory V1 · P5 Route List Page
   ============================================================ */

const RouteListPage = (() => {

  async function render() {
    const container = document.getElementById('page-container');
    if (!container) return;

    // Loading state
    container.innerHTML = `
      <div class="page-header">
        <h1>工艺路线</h1>
      </div>
      ${Skeleton.cards(3)}
    `;

    // Fetch data
    const { ok, data: routes, error } = await ProcessesAPI.listRoutes();

    if (!ok) {
      container.innerHTML = `
        <div class="page-header">
          <h1>工艺路线</h1>
        </div>
        <div class="card" style="text-align:center;padding:var(--space-xl);">
          <p style="font-size:2rem;margin-bottom:var(--space-md);">⚠️</p>
          <p style="color:var(--color-danger);">加载失败：${escapeHTML(error)}</p>
          <button class="btn btn-primary" style="margin-top:var(--space-md);" onclick="RouteListPage.render()">重试</button>
        </div>
      `;
      return;
    }

    if (!routes || routes.length === 0) {
      container.innerHTML = `
        <div class="page-header">
          <h1>工艺路线</h1>
        </div>
        <div class="empty-state">
          <div class="empty-state-icon">🗺️</div>
          <div class="empty-state-title">暂无工艺路线</div>
          <div class="empty-state-desc">路线模板尚未创建。请联系管理员添加。</div>
        </div>
      `;
      return;
    }

    // Render
    const cardsHtml = routes.map(route => renderRouteCard(route)).join('');

    container.innerHTML = `
      <div class="page-header">
        <h1>工艺路线</h1>
        <span class="badge" style="background:var(--bg-muted);color:var(--text-secondary);">
          ${routes.length} 条路线
        </span>
      </div>
      ${cardsHtml}
    `;
  }

  function renderRouteCard(route) {
    const stepsHtml = route.steps.length > 0
      ? route.steps.map(s => renderStepRow(s)).join('')
      : '<div class="route-step-row"><span style="color:var(--text-muted);">暂无步骤</span></div>';

    return `
      <div class="card route-card">
        <div class="route-card-header">
          <span class="route-card-name">${escapeHTML(route.name)}</span>
          <span class="badge badge-sm" style="background:var(--bg-done);color:var(--color-done);">
            ${route.steps.length} 道工序
          </span>
        </div>
        <div class="route-steps-list">
          ${stepsHtml}
        </div>
      </div>
    `;
  }

  function renderStepRow(step) {
    return `
      <div class="route-step-row">
        <span class="route-step-seq">${step.seq}</span>
        <div class="route-step-info">
          <span class="route-step-name">${escapeHTML(step.code)} ${escapeHTML(step.name)}</span>
          <span class="route-step-dept">${escapeHTML(step.type)}</span>
        </div>
      </div>
    `;
  }

  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { render };
})();
