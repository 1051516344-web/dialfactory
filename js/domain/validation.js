/* ============================================================
   DialFactory V1 · Business Rule Validation
   ============================================================ */

const Validation = (() => {

  /** 检验类型节点完成时，qty_out 必填且 > 0 */
  function validateQtyOut(processType, qtyOut) {
    if (processType !== '检验') return { valid: true };

    if (qtyOut == null || qtyOut === '' || qtyOut === undefined) {
      return { valid: false, error: '检验工序必须填写产出数量' };
    }
    const n = Number(qtyOut);
    if (!Number.isInteger(n) || n <= 0) {
      return { valid: false, error: '产出数量必须是正整数' };
    }
    if (n > 999999) {
      return { valid: false, error: '产出数量超出合理范围' };
    }
    return { valid: true };
  }

  /** 交期校验 */
  function validateDueDate(dateStr) {
    if (!dateStr) return { valid: false, error: '请选择交期' };
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { valid: false, error: '无效日期' };
    return { valid: true };
  }

  return { validateQtyOut, validateDueDate };
})();
