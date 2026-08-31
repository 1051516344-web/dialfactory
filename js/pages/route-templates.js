/* ============================================================
   DialFactory V1 · Route Templates Page
   Phase 4: View collected route templates with signatures.
   Template names are user-editable inline.
   ============================================================ */

const RouteTemplatesPage = (() => {

  let templatesCache = []; // current template list (for edit/delete handlers)

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
    templatesCache = templates;

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

    attachHandlers(container);
  }

  function renderTable(templates) {
    const rows = templates.map(t => {
      const tplId = t.id.replace(/-/g, '').slice(0, 8);
      const orderCount = (t.associated_orders || []).length;
      const name = t.template_name || t.route_signature || '—';
      const signature = t.route_signature || '';
      const displaySig = signature.length > 40
        ? signature.slice(0, 40) + '…'
        : signature;

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
              <span class="tpl-name-display" id="tpl-name-text-${tplId}" title="点击编辑名称">${escapeHTML(name)}</span>
              <input type="text" class="tpl-name-input" id="tpl-name-input-${tplId}"
                     value="${escapeHTML(name)}" style="display:none;"
                     data-id="${t.id}" data-tpl-id="${tplId}">
              <span class="tpl-name-edit-icon" id="tpl-name-icon-${tplId}" title="编辑名称">✎</span>
              <span class="tpl-signature" title="${escapeHTML(signature)}">${escapeHTML(displaySig)}</span>
              ${orderCount > 0 ? `<span class="tpl-order-count">${orderCount} 个订单</span>` : ''}
            </div>
            <div class="tpl-col-count">
              <span class="tpl-used-count">${t.used_count}</span>
              <span class="tpl-used-label">次使用</span>
            </div>
            <div class="tpl-col-time">${formatDate(t.last_used_at)}</div>
            <button class="btn btn-ghost btn-sm" onclick="RouteTemplatesPage.onEditProcesses('${t.id}')">编辑工序</button>
            <button class="btn btn-danger btn-sm" onclick="RouteTemplatesPage.onDelete('${t.id}')">删除</button>
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

  function attachHandlers(container) {
    // Expand/collapse
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

    // Inline edit: click name text or edit icon to start editing
    container.querySelectorAll('.tpl-name-display, .tpl-name-edit-icon').forEach(el => {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        const tplId = this.dataset.tplId || this.id.replace('tpl-name-text-', '').replace('tpl-name-icon-', '');
        startEdit(tplId);
      });
    });

    // Inline edit: input keydown
    container.querySelectorAll('.tpl-name-input').forEach(input => {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { saveEdit(this.dataset.tplId); }
        if (e.key === 'Escape') { cancelEdit(this.dataset.tplId); }
      });
      input.addEventListener('blur', function() {
        // Small delay to allow Enter/Escape to fire first
        setTimeout(() => {
          if (this.style.display !== 'none') {
            cancelEdit(this.dataset.tplId);
          }
        }, 150);
      });
    });
  }

  function startEdit(tplId) {
    const textEl = document.getElementById('tpl-name-text-' + tplId);
    const inputEl = document.getElementById('tpl-name-input-' + tplId);
    const iconEl = document.getElementById('tpl-name-icon-' + tplId);
    if (!textEl || !inputEl) return;

    textEl.style.display = 'none';
    if (iconEl) iconEl.style.display = 'none';
    inputEl.style.display = '';
    inputEl.focus();
    inputEl.select();
  }

  async function saveEdit(tplId) {
    const inputEl = document.getElementById('tpl-name-input-' + tplId);
    const textEl = document.getElementById('tpl-name-text-' + tplId);
    const iconEl = document.getElementById('tpl-name-icon-' + tplId);
    if (!inputEl || !textEl) return;

    const newName = inputEl.value.trim();
    const id = inputEl.dataset.id;
    const prevName = textEl.textContent; // B23: capture pre-edit value before optimistic update

    if (!newName) {
      cancelEdit(tplId);
      return;
    }

    // Optimistic update
    textEl.textContent = newName;
    textEl.style.display = '';
    inputEl.style.display = 'none';
    if (iconEl) iconEl.style.display = '';

    const result = await RouteTemplatesAPI.updateName(id, newName);
    if (!result.ok) {
      // Revert on failure — B23: revert to prevName, not stale defaultValue
      textEl.textContent = prevName;
      Toast.warning('保存失败：' + (result.error || '未知错误'));
    }
  }

  function cancelEdit(tplId) {
    const textEl = document.getElementById('tpl-name-text-' + tplId);
    const inputEl = document.getElementById('tpl-name-input-' + tplId);
    const iconEl = document.getElementById('tpl-name-icon-' + tplId);
    if (!textEl || !inputEl) return;

    inputEl.value = textEl.textContent; // reset to current
    inputEl.style.display = 'none';
    textEl.style.display = '';
    if (iconEl) iconEl.style.display = '';
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
    return DOM.escapeHtml(str);
  }

  async function onEditProcesses(templateId) {
    const template = templatesCache.find(t => t.id === templateId);
    if (!template) return;

    const { ok, data: processes } = await ProcessesAPI.listProcesses();
    if (!ok || !processes) { Toast.error('无法加载工序列表'); return; }

    // Pre-check the template's current processes (match by process name).
    // Preserve existing department labels when a process is already in the template.
    const currentNames = new Set((template.process_list || []).map(p => p.process));
    const existingDept = {};
    (template.process_list || []).forEach(p => { existingDept[p.process] = p.department; });

    const checkboxes = processes.map(p => {
      const checked = currentNames.has(p.name) ? 'checked' : '';
      return `<label style="display:inline-flex;align-items:center;gap:4px;margin:2px 8px 2px 0;font-size:0.85rem;cursor:pointer;">
        <input type="checkbox" name="proc" value="${p.id}" ${checked} style="cursor:pointer;">
        <span>${escapeHTML(p.code)} ${escapeHTML(p.name)}</span>
      </label>`;
    }).join('');

    ConfirmDialog.show({
      title: '编辑模板工序 — ' + (template.template_name || template.route_signature || ''),
      content: `<div style="max-height:340px;overflow-y:auto;">${checkboxes}</div>`,
      confirmLabel: '保存',
      onConfirm: async () => {
        // Read checked boxes directly (ConfirmDialog's naive form collection can't
        // represent multiple same-name checkboxes). DOM order = catalog order.
        const checkedEls = document.querySelectorAll('.dialog-overlay input[name="proc"]:checked');
        const ordered = Array.from(checkedEls).map((el, i) => {
          const p = processes.find(x => x.id === el.value);
          if (!p) return null;
          return {
            order: i + 1,
            process: p.name,
            department: existingDept[p.name] !== undefined
              ? existingDept[p.name]
              : (p.default_dept ? p.default_dept.name : '')
          };
        }).filter(Boolean);

        if (ordered.length === 0) { Toast.error('请至少选择一道工序'); return; }

        const result = await RouteTemplatesAPI.updateProcesses(template.id, ordered);
        if (result.ok) {
          Toast.success('模板工序已更新');
          render();
        } else {
          Toast.error(result.error || '保存失败');
        }
      }
    });
  }

  function onDelete(templateId) {
    const template = templatesCache.find(t => t.id === templateId);
    if (!template) return;
    ConfirmDialog.show({
      title: '删除模板',
      content: `<p>确认删除模板 <strong>${escapeHTML(template.template_name || template.route_signature || '—')}</strong>？</p>
                <p style="color:var(--text-secondary);font-size:var(--font-size-sm);">删除后不影响任何已创建订单的路线。</p>`,
      confirmLabel: '确认删除',
      dangerous: true,
      onConfirm: async () => {
        const result = await RouteTemplatesAPI.deleteTemplate(template.id);
        if (result.ok) {
          Toast.success('模板已删除');
          render();
        } else {
          Toast.error(result.error || '删除失败');
        }
      }
    });
  }

  return { render, onEditProcesses, onDelete };
})();
