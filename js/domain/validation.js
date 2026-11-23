/* ============================================================
   DialFactory V1 · Business Rule Validation
   ============================================================ */

const Validation = (() => {

  /** 需要强制填写产出数量的工序：仅总QC（P35）。
   *  部门QC（P23-P25）等中间检验在巡检式使用下填不出产出 → 不强制。
   *  process_code 缺失的历史节点按工序名兜底。 */
  function requiresQtyOut(node) {
    if (!node) return false;
    if (node.process_code) return node.process_code === 'P35';
    return node.process_name === '总QC';
  }

  /** 需填产出的工序：qty_out 必填且为正整数 */
  function validateQtyOut(node, qtyOut) {
    if (!requiresQtyOut(node)) return { valid: true };

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

  return { validateQtyOut, requiresQtyOut, validateDueDate };
})();
