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
    // FIX #1: Generate production_no + capture customer_order_no in specs
    const now = new Date();
    const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
    const productionNo = `DF${ts}`;

    const orderData = {
      order_no:      formData.order_no,
      customer_id:   formData.customer_id || null,
      order_qty:     Number(formData.order_qty),
      due_date:      formData.due_date,
      base_texture:  formData.base_texture || null,
      plate_color:   formData.plate_color || null,
      // C7: orders.specs JSONB keys — registered contract (see Freeze manifest):
      //   base_plate_color / customer_order_no / production_no
      //   + drawing_name / drawing_path (set later by StorageAPI.uploadDrawing)
      specs:         {
        base_plate_color: formData.base_plate_color || null,
        customer_order_no: formData.customer_order_no || null,
        production_no: productionNo
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

  return { submit, validateOrderForm };
})();
