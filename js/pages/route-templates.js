/* ============================================================
   DialFactory V1 · Route Templates Page
   Phase 4: View collected route templates with signatures.
   Deduplication: same route_signature → count++.
   ============================================================ */

const RouteTemplatesPage = (() => {

  async function render() {
    const container = document.getElementById('page-container');
    if (!container) return;

    container.innerHTML = `
      <div class="page-header"><h1>路线模板</h1></div>
      ${Skeleton.cards(1)}
    `;

    const result = await RouteTemplatesAPI.list();

    if (!result.ok) {
      container.innerHTML = `
        <div class="page-header"><h1>路线模板</h1></div>
        <div class="card" style="text-align:center;padding:var(--space-xl);">
          <p style="font-size:2rem;">⚠️</p>
          <p style="color:var(--color-danger);">加载失败</p>
          <p style="font-size:var(--font-size-sm);color:var(--text-secondary);">${escapeHTML(String(result.error || ''))}</p>
          <button class="btn btn-primary" style="margin-top:var(--space-md);" onclick="RouteTemplatesPage.render()">重试</button>
        </div>
      `;
      return;
    }

    const templates = result.data || [];

    if (templates.length === 0) {
      container.innerHTML = `
        <div class="page-header"><h1>路线模板</h1></div>
        ${EmptyState.render({
          icon: '📦',
          title: '暂无模板',
          desc: '创建订单时，系统会自动收集生产路线为模板。'
        })}
      `;
      return;
    }

    container.innerHTML = `
      <div class="page-header"><h1>路线模板</h1></div>
      <div class="section-title">已收集 <span style="font-weight:400;color:var(--text-secondary);font-size:var(--font-size-sm);">(${templates.length})</span></div>
      <div class="card" style="padding:0;overflow:hidden;">
        ${renderTable(templates)}
      </div>
    `;

    // Attach expand/collapse handlers
    container.querySelectorAll('.tpl-row-toggle').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const id = this.dataset.id;
        const detail = document.getElementById('tpl-detail-' + id);
        if (detail) {
          const isHidden = detail.style.display === 'none';
          detail.style.display = isHidden ? 'block' : 'none';
          this.textContent = isHidden ? '▲' : '▼';
        }
      });
    });
  }

  function renderTable(templates) {
    const rows = templates.map(t => {
      const tplId = t.id.replace(/-/g, '').slice(0, 8);
      const orderCount = (t.associated_orders || []).length;
      const signature = t.route_signature || '—';

      const processItems = (t.process_list || []).map((p, i) => `
        <span class="tpl-step">
          <span class="tpl-step-order">${p.order || i + 1}</span>
          <span class="tpl-step-dept">${escapeHTML(p.department)}</span>
          <span class="tpl-step-name">${escapeHTML(p.process)}</span>
        </span>
      `).join('<span class="tpl-step-arrow">→</span>');

      return `
        <div class="tpl-row">
          <div class="tpl-row-main">
            <div class="tpl-col-name">
              <span class="tpl-signature" title="${escapeHTML(signature)}">${escapeHTML(signature)}</span>
              ${orderCount > 0 ? `<span class="tpl-order-count">${orderCount} 个订单</span>` : ''}
            </div>
            <div class="tpl-col-count">
              <span class="tpl-used-count">${t.used_count}</span>
              <span class="tpl-used-label">次使用</span>
            </div>
            <div class="tpl-col-time">${formatDate(t.last_used_at)}</div>
            <button class="tpl-row-toggle" data-id="${tplId}">▼</button>
          </div>
          <div class="tpl-row-detail" id="tpl-detail-${tplId}" style="display:none;">
            <div class="tpl-process-flow">${processItems}</div>
          </div>
        </div>
      `;
    }).join('');

    return `<div class="tpl-table">${rows}</div>`;
  }

  function formatDate(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleDateString('zh-CN', {
      month: '2-digit', day: '2-digit'
    }) + ' ' + d.toLocaleTimeString('zh-CN', {
      hour: '2-digit', minute: '2-digit'
    });
  }

  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { render };
})();
