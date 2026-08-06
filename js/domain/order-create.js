/* ============================================================
   DialFactory V1 · Order Create Orchestration
   Page delegates all creation logic here. (REVISION 5)
   ============================================================ */

const OrderCreate = (() => {

  /**
   * Submit order creation.
   * @returns { ok, orderId } | { ok: false, error, errors? }
   */
  async function submit(formData, confirmedSteps) {
    // 1. Validate
    const v = validateOrderForm(formData, confirmedSteps);
    if (!v.valid) return { ok: false, error: v.errors[0], errors: v.errors };

    // 2. Check unique order_no
    const { ok: cok, data: existing } = await OrdersAPI.list({ search: formData.order_no });
    if (cok && existing && existing.some(o => o.order_no === formData.order_no)) {
      return { ok: false, error: '订单编号已存在', errors: ['订单编号已存在'] };
    }

    // 3. Build route_snapshot (REVISION 3)
    const snapshot = {
      route_id: formData.route_id,
      route_name: formData.route_name || '',
      snapshot_at: new Date().toISOString(),
      steps: confirmedSteps.map(s => ({
        seq: s.seq,
        process_code: s.process_code,
        process_name: s.process_name,
        dept_name: s.dept_name,
        is_required: s.is_required || false,
        confirmed: s.confirmed
      }))
    };

    // 4. Build order data
    const orderData = {
      order_no:      formData.order_no,
      customer_id:   formData.customer_id || null,
      order_qty:     Number(formData.order_qty),
      due_date:      formData.due_date,
      base_texture:  formData.base_texture || null,
      plate_color:   formData.plate_color || null,
      sand_type:     formData.sand_type || null,
      route_id:      formData.route_id || null,
      route_snapshot: snapshot,
      status:        'in_production',
      note:          formData.note || null
    };

    // 5. Build nodes data with gap-based seq (REVISION 2)
    const activeNodes = confirmedSteps.filter(s => s.confirmed);
    const nodesData = activeNodes.map((s, i) => ({
      process_id:   s.process_id,
      process_name: s.process_name,
      process_code: s.process_code,
      dept_id:      s.dept_id,
      dept_name:    s.dept_name,
      seq:          (i + 1) * 10,        // 10, 20, 30, ...
      rework_pass:  0,
      status:       i === 0 ? 'active' : 'waiting'
    }));

    // 6. Create
    const result = await OrdersAPI.createOrder(orderData, nodesData);
    if (!result.ok) return result;

    return { ok: true, orderId: result.data.order.id };
  }

  /**
   * Validate order form and confirmed steps.
   */
  function validateOrderForm(formData, confirmedSteps, { checkSteps = true } = {}) {
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
    if (!formData.route_id) {
      errors.push('请选择工艺路线');
    }

    if (checkSteps) {
      const confirmedCount = (confirmedSteps || []).filter(s => s.confirmed).length;
      if (confirmedCount === 0) {
        errors.push('至少确认一道工序');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  return { submit, validateOrderForm };
})();
