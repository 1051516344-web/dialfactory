/* ============================================================
   DialFactory V1 · Order Create Orchestration
   Page delegates all creation logic here. (REVISION 5)
   ============================================================ */

const OrderCreate = (() => {

  /**
   * Submit order creation.
   * @returns { ok, orderId } | { ok: false, error, errors? }
   */
  /**
   * Submit order creation.
   * selectedSteps: processes chosen by supervisor (selected=true).
   */
  async function submit(formData, selectedSteps) {
    // 1. Validate
    const v = validateOrderForm(formData, selectedSteps);
    if (!v.valid) return { ok: false, error: v.errors[0], errors: v.errors };

    // 2. Check unique order_no
    const { ok: cok, data: existing } = await OrdersAPI.list({ search: formData.order_no });
    if (cok && existing && existing.some(o => o.order_no === formData.order_no)) {
      return { ok: false, error: '订单编号已存在', errors: ['订单编号已存在'] };
    }

    // 3. Build route_snapshot
    const allSteps = selectedSteps.map((s, i) => ({
      seq: i + 1,
      process_code: s.process_code,
      process_name: s.process_name,
      dept_name: s.dept_name || '',
      selected: s.selected
    }));

    const snapshot = {
      source: formData.source || 'manual',
      source_order_id: formData.source_order_id || null,
      snapshot_at: new Date().toISOString(),
      steps: allSteps
    };

    // 4. Build order data
    const orderData = {
      order_no:      formData.order_no,
      customer_id:   formData.customer_id || null,
      order_qty:     Number(formData.order_qty),
      due_date:      formData.due_date,
      base_texture:  formData.base_texture || null,
      // C7: orders.specs JSONB keys — registered contract (see Freeze manifest):
      //   customer_order_no / order_quantity_raw
      //   + drawing_name / drawing_path (set later by StorageAPI.uploadDrawing)
      // Note: plate_color / base_plate_color are NOT collected at creation —
      //   colors live in the customer drawing, not order base info.
      specs:         {
        customer_order_no: formData.customer_order_no || null,
        order_quantity_raw: formData.order_quantity_raw || null
      },
      route_id:      formData.route_id || null,
      route_snapshot: snapshot,
      status:        'in_production',
      note:          formData.note || null
    };

    // 5. Build nodes data — only selected processes
    const selected = selectedSteps.filter(s => s.selected);
    if (selected.length === 0) {
      return { ok: false, error: '请至少选择一道工序', errors: ['请至少选择一道工序'] };
    }

    const nodesData = selected.map((s, i) => ({
      process_id:   s.process_id,
      process_name: s.process_name,
      process_code: s.process_code,
      dept_id:      s.dept_id,
      dept_name:    s.dept_name || '',
      seq:          (i + 1) * 10,
      rework_pass:  0,
      status:       i === 0 ? 'active' : 'waiting'
    }));

    // 6. Create
    const result = await OrdersAPI.createOrder(orderData, nodesData);
    if (!result.ok) return result;

    return { ok: true, orderId: result.data.order.id, nodes: result.data.nodes };
  }

  /**
   * Validate order form. No is_required checks. No route_id requirement.
   */
  function validateOrderForm(formData, selectedSteps, { checkSteps = true } = {}) {
    const errors = [];

    if (!formData.order_no || !formData.order_no.trim()) {
      errors.push('请输入订单编号');
    }
    if (!formData.order_qty || Number(formData.order_qty) <= 0 || !Number.isInteger(Number(formData.order_qty))) {
      errors.push('请输入有效数量');
    }
    if (!formData.due_date) {
      errors.push('请选择交期');
    } else {
      const d = new Date(formData.due_date);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (d < today) errors.push('交期不能早于今天');
    }
    // route_id is optional — supervisor may build route manually

    if (checkSteps) {
      const selectedCount = (selectedSteps || []).filter(s => s.selected).length;
      if (selectedCount === 0) {
        errors.push('请至少选择一道工序');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Parse a recognized quantity string ("4100+2%", "4100片", "4100")
   * into a positive integer. Returns null when nothing parseable.
   */
  function parseQuantity(raw) {
    if (raw == null) return null;
    const m = String(raw).replace(/[，,]/g, '').match(/\d+(\.\d+)?/);
    if (!m) return null;
    const n = Math.floor(Number(m[0]));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /**
   * Normalize a recognized delivery date into "YYYY-MM-DD".
   * Accepts "2026年09月01日" / "2026/09/01" / "2026.09.01" / "2026-09-01".
   * Returns null when not parseable.
   */
  function parseDeliveryDate(raw) {
    if (!raw) return null;
    const s = String(raw).trim()
      .replace(/年/g, '-').replace(/月/g, '-').replace(/日/g, '')
      .replace(/[./]/g, '-');
    const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return null;
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  return { submit, validateOrderForm, parseQuantity, parseDeliveryDate };
})();
