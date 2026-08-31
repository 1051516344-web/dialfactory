/* ============================================================
   DialFactory V1 · P3 Order Create Page
   UI-only 2-step wizard. All logic in OrderCreate domain.
   ============================================================ */

const OrderCreatePage = (() => {

  let step = 1;
  let formData = {};
  let processList = [];    // all 35 processes for Route Builder
  let selectedMap = {};    // process_id -> boolean
  let customerList = [];   // cached customers (B9: preserved across step1 back-navigation)

  async function render() {
    step = 1;
    formData = {};
    processList = [];
    selectedMap = {};
    selectedOrderFile = null;
    recognitionDone = false;

    const container = document.getElementById('page-container');
    if (!container) return;

    const [custResult, procResult] = await Promise.all([
      CustomersAPI.list(),
      ProcessesAPI.listProcesses()
    ]);
    customerList = custResult.ok ? custResult.data : [];
    processList = procResult.ok ? procResult.data : [];

    // P1-FIX: Batch department names — single query instead of sequential for-loop
    if (processList.length > 0) {
      const deptIds = [...new Set(processList.map(p => p.default_dept_id).filter(Boolean))];
      if (deptIds.length > 0) {
        const missingIds = deptIds.filter(did => !deptCache[did]);
        if (missingIds.length > 0) {
          const { ok, data } = await DB.call(
            DB.get().from('departments').select('id, name').in('id', missingIds)
          );
          if (ok && data) {
            data.forEach(d => { deptCache[d.id] = d.name; });
          }
        }
      }
    }

    renderStep1(container, customerList);
  }

  let deptCache = {};
  let selectedOrderFile = null; // single merged "客户订单资料" file (image or PDF)
  let recognitionDone = false;  // whether recognition has filled the form this session
  let recognizing = false;      // whether an auto-recognition request is in flight

  // ==========================================================
  // Step 1: Basic Info
  // ==========================================================
  function renderStep1(container, customers) {
    const custOptions = customers.length > 0
      ? '<option value="" ' + (formData.customer_id ? '' : 'selected') + '>请选择客户</option>' +
        customers.map(c => `<option value="${c.id}" ${formData.customer_id === c.id ? 'selected' : ''}>${escapeHTML(c.short_name || c.name)}</option>`).join('')
      : '<option value="">— 暂无客户数据，可手动输入 —</option>';

    const texSuggestions = CONFIG.TEXTURE_SUGGESTIONS.map(t => `<option value="${t}">`).join('');

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
          <label class="form-label">客户订单号 <span style="color:var(--text-secondary);font-weight:400;">（选填）</span></label>
          <input type="text" id="form-customer-order-no" class="form-input" placeholder="客户方的采购单号/参考号" value="${escapeHTML(formData.customer_order_no || '')}">
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
          <input type="text" id="form-texture" class="form-input" list="texture-suggestions"
                 placeholder="如 太阳纹、直线纹" value="${escapeHTML(formData.base_texture || '')}">
          <datalist id="texture-suggestions">${texSuggestions}</datalist>
        </div>
        <div class="form-group">
          <label class="form-label">上传客户订单资料 <span style="color:var(--text-secondary);font-weight:400;">（选填）</span></label>
          <input type="file" id="form-order-file" class="form-input"
                 accept=".pdf,.png,.jpg,.jpeg"
                 onchange="OrderCreatePage.onOrderFileSelected(this)"
                 style="padding:6px;">
          ${selectedOrderFile ? `<div style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-top:2px;">已选择: ${escapeHTML(selectedOrderFile.name)} (${(selectedOrderFile.size / 1024).toFixed(0)} KB)</div>` : ''}
          <div id="recognize-status" style="font-size:var(--font-size-xs);color:var(--text-secondary);margin-top:2px;">
            ${recognitionDone ? '✅ 已识别，请核对下方字段（均可手动修改）' : '上传客户订单图片/图纸，系统将自动识别订单信息'}
          </div>
          <div style="font-size:var(--font-size-xs);color:var(--text-secondary);margin-top:2px;">支持 PDF / PNG / JPEG，最大 10 MB</div>
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
  // Step 2: Route Builder — Dept-grouped checklist
  // ==========================================================
  async function goToStep2() {
    const container = document.getElementById('page-container');
    formData.order_no    = document.getElementById('form-order-no')?.value || '';
    formData.customer_order_no = document.getElementById('form-customer-order-no')?.value || '';
    formData.order_qty   = document.getElementById('form-qty')?.value || '';
    formData.due_date    = document.getElementById('form-due')?.value || '';
    formData.base_texture = document.getElementById('form-texture')?.value || '';
    formData.note        = document.getElementById('form-note')?.value || '';
    formData.route_id    = null;
    formData.source      = 'manual';

    const custSelect = document.getElementById('form-customer');
    if (custSelect) {
      formData.customer_id = custSelect.value || null;
    } else {
      formData.customer_id = null;
    }

    // Skip steps check
    const v = OrderCreate.validateOrderForm(formData, [], { checkSteps: false });
    if (!v.valid) {
      document.getElementById('step1-errors').innerHTML = v.errors.map(e => `<div>· ${escapeHTML(e)}</div>`).join('');
      return;
    }

    // B18: exact order_no lookup (was a fuzzy list search)
    const existing = await OrdersAPI.getByOrderNo(formData.order_no);
    if (existing.ok && existing.data) {
      document.getElementById('step1-errors').innerHTML = '<div>· 订单编号已存在</div>';
      return;
    }

    // Init selection: none checked initially
    selectedMap = {};
    processList.forEach(p => { selectedMap[p.id] = false; });

    step = 2;
    renderStep2(container);
  }

  function renderStep2(container) {
    // Group processes by department
    const deptGroups = {};
    processList.forEach(p => {
      const deptName = deptCache[p.default_dept_id] || '其他';
      if (!deptGroups[deptName]) deptGroups[deptName] = [];
      deptGroups[deptName].push(p);
    });

    // Sort depts by config order
    const sortedDepts = CONFIG.DEPT_ORDER.filter(d => deptGroups[d]);
    // Add any depts not in config order
    Object.keys(deptGroups).forEach(d => {
      if (!sortedDepts.includes(d)) sortedDepts.push(d);
    });

    const deptSections = sortedDepts.map(deptName => {
      const procs = deptGroups[deptName].sort((a, b) => a.code.localeCompare(b.code));
      const checks = procs.map(p => {
        const checked = selectedMap[p.id] ? 'checked' : '';
        return `<label style="display:inline-flex;align-items:center;gap:4px;margin:2px 8px 2px 0;font-size:0.85rem;cursor:pointer;">
          <input type="checkbox" ${checked} onchange="OrderCreatePage.toggleProcess('${p.id}')" style="cursor:pointer;">
          <span>${escapeHTML(p.code)} ${escapeHTML(p.name)}</span>
        </label>`;
      }).join('');

      return `<div style="margin-bottom:var(--space-md);">
        <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;color:var(--text-secondary);">
          ${escapeHTML(deptName)} (${procs.length})
        </div>
        <div style="display:flex;flex-wrap:wrap;">${checks}</div>
      </div>`;
    }).join('');

    const selectedCount = Object.values(selectedMap).filter(Boolean).length;

    container.innerHTML = `
      <div class="page-header">
        <a href="javascript:OrderCreatePage.backToStep1()" class="btn btn-ghost" style="font-size:0.85rem;">← 返回修改</a>
        <h1>建立生产路线</h1>
      </div>

      <div class="card">
        <div style="margin-bottom:var(--space-md);">
          <input type="text" class="form-input" placeholder="搜索工序名称或编号..." style="max-width:300px;"
                 oninput="OrderCreatePage.filterProcesses(this.value)">
        </div>

        <div id="dept-sections">
          ${deptSections}
        </div>

        <div style="margin-top:var(--space-md);padding-top:var(--space-md);border-top:1px solid var(--bg-muted);
                    display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:var(--font-size-sm);color:var(--text-secondary);">
            已选择: ${selectedCount} 道工序
          </span>
          <div style="display:flex;gap:var(--space-sm);">
            <button class="btn btn-ghost" onclick="OrderCreatePage.backToStep1()">← 返回修改</button>
            <button class="btn btn-primary" id="btn-submit"
                    ${selectedCount === 0 ? 'disabled' : ''}
                    onclick="OrderCreatePage.submitOrder()">创建订单 ✓</button>
          </div>
        </div>
      </div>
    `;
  }

  function toggleProcess(processId) {
    selectedMap[processId] = !selectedMap[processId];
    renderStep2(document.getElementById('page-container'));
  }

  function filterProcesses(query) {
    if (!query || !query.trim()) {
      // Show all
      document.querySelectorAll('#dept-sections label').forEach(el => el.style.display = '');
      document.querySelectorAll('#dept-sections > div > div:first-child').forEach(el => el.style.display = '');
      return;
    }
    const q = query.trim().toLowerCase();
    document.querySelectorAll('#dept-sections label').forEach(el => {
      const text = el.textContent.toLowerCase();
      el.style.display = text.includes(q) ? '' : 'none';
    });
  }

  async function backToStep1() {
    step = 1;
    // B9: preserve formData + selectedOrderFile — render() would reset them
    renderStep1(document.getElementById('page-container'), customerList);
  }

  function onOrderFileSelected(input) {
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const v = StorageAPI.validateFile(file);
      if (!v.valid) {
        Toast.warning(v.error);
        input.value = '';
        selectedOrderFile = null;
        return;
      }
      selectedOrderFile = file;
      // Auto-recognize: images trigger AI extraction, PDFs are stored only.
      const isImage = file.type.startsWith('image/') || /\.(png|jpe?g)$/i.test(file.name);
      if (isImage) recognize();
    } else {
      selectedOrderFile = null;
    }
  }

  // ==========================================================
  // AI recognition (auto-triggered on file select): image → 6 fields → editable form
  // ==========================================================
  async function recognize() {
    const file = selectedOrderFile;
    if (!file || recognizing) return;

    recognizing = true;
    const statusEl = document.getElementById('recognize-status');
    if (statusEl) { statusEl.style.color = ''; statusEl.textContent = '识别中...'; }

    try {
      const res = await RecognizeAPI.extract(file);
      if (!res.ok) {
        if (statusEl) { statusEl.style.color = 'var(--color-danger)'; statusEl.textContent = '❌ ' + res.error + '，请手动填写'; }
        Toast.warning(res.error + '，请手动填写');
        return;
      }
      applyRecognition(res.data);
    } catch (e) {
      console.error('[OrderCreate] recognize failed:', e);
      if (statusEl) { statusEl.style.color = 'var(--color-danger)'; statusEl.textContent = '❌ 识别失败，请手动填写'; }
      Toast.warning('识别失败，请手动填写');
    } finally {
      recognizing = false;
    }
  }

  function applyRecognition(r) {
    const qty = OrderCreate.parseQuantity(r.order_quantity);
    const due = OrderCreate.parseDeliveryDate(r.delivery_date);
    const customer = CustomersAPI.match(customerList, r.customer_name);

    formData.customer_order_no = r.customer_order_no || formData.customer_order_no || '';
    formData.order_qty = qty != null ? String(qty) : formData.order_qty || '';
    formData.due_date = due || formData.due_date || '';
    formData.base_texture = r.base_texture || formData.base_texture || '';
    formData.order_no = r.order_no || formData.order_no || '';
    formData.customer_id = customer ? customer.id : (formData.customer_id || null);
    formData.order_quantity_raw = r.order_quantity || null;

    recognitionDone = true;
    renderStep1(document.getElementById('page-container'), customerList);

    if (r.customer_name && !customer) {
      Toast.warning('未匹配到客户「' + r.customer_name + '」，请手动选择');
    }
  }

  // ==========================================================
  // Submit
  // ==========================================================
  async function submitOrder() {
    const btn = document.getElementById('btn-submit');
    if (btn) { btn.disabled = true; btn.textContent = '创建中...'; }

    try {
      // Build selected steps from processList + selectedMap + deptCache
      const selectedSteps = processList.map(p => ({
        process_id: p.id,
        process_code: p.code,
        process_name: p.name,
        dept_id: p.default_dept_id,
        dept_name: deptCache[p.default_dept_id] || '',
        selected: !!selectedMap[p.id]
      }));

      formData.source = 'manual';
      const result = await OrderCreate.submit(formData, selectedSteps);

      if (result.ok) {
        // Auto-upload the merged "客户订单资料" file if selected
        // (failure does not block order creation)
        if (selectedOrderFile) {
          const uploadResult = await StorageAPI.uploadDrawing(result.orderId, selectedOrderFile);
          if (!uploadResult.ok) {
            Toast.warning('订单已创建，但客户订单资料上传失败：' + uploadResult.error);
          } else if (uploadResult.warning) {
            Toast.warning(uploadResult.warning);
          }
          selectedOrderFile = null;
        }

        // Phase 4: Auto-create production records for the created nodes (B5: node_id linked)
        const nodes = result.nodes || [];
        if (nodes.length > 0) {
          const prResult = await ProductionRecordsAPI.createForOrder(result.orderId, nodes);
          if (!prResult.ok) {
            console.warn('[OrderCreate] Production records creation failed:', prResult.error);
          }
        }

        Router.navigate('/orders/' + result.orderId);
      } else {
        alert(result.error || '创建失败，请重试');
      }
    } catch (e) {
      console.error('[OrderCreate] submit failed:', e);
      alert('创建失败，请重试');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '创建订单 ✓'; }
    }
  }

  function escapeHTML(str) {
    return DOM.escapeHtml(str);
  }

  return { render, goToStep2, toggleProcess, filterProcesses, backToStep1, submitOrder, onOrderFileSelected };
})();
