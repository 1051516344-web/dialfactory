/* ============================================================
   DialFactory V1 · Batch State (pure logic — no DOM, no DB)
   Phase 1: split validation, parent/child tree, status labels.
   batch_no is entered by humans; the system only enforces
   uniqueness (DB) and tracks relations — no auto-generation here.
   ============================================================ */

const BatchState = (() => {

  /**
   * Validate a proposed split before calling the DB RPC.
   * @param {object}  batch     the source batch ({ id, quantity, status })
   * @param {Array}   relations existing outgoing relations ({ quantity }) for this batch
   * @param {Array}   children  proposed children [{ batch_no, quantity, color }]
   * @returns {{ ok:true, remaining:number } | { ok:false, error:string }}
   */
  function validateSplit(batch, relations, children) {
    if (!batch) return { ok: false, error: '批次不存在' };
    if (batch.status === 'completed' || batch.status === 'cancelled' || batch.status === 'split') {
      return { ok: false, error: '当前状态不可拆分' };
    }
    if (!Array.isArray(children) || children.length === 0) {
      return { ok: false, error: '请至少填写一个子批次' };
    }

    const allocated = (relations || []).reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
    const remaining = (Number(batch.quantity) || 0) - allocated;

    let total = 0;
    for (const c of children) {
      const q = Number(c.quantity) || 0;
      const no = (c.batch_no == null ? '' : String(c.batch_no)).trim();
      if (!no) return { ok: false, error: '子批次编号不能为空' };
      if (q <= 0) return { ok: false, error: '子批次数量必须大于 0' };
      total += q;
    }

    if (total <= 0) return { ok: false, error: '拆分数量必须大于 0' };
    if (total > remaining) {
      return { ok: false, error: `拆分数量超过可分配数量（剩余 ${remaining} 片）`, remaining };
    }
    return { ok: true, remaining: remaining - total };
  }

  /**
   * Build a parent→children tree and a child→parent map.
   * @param {Array} batches   flat list of batches ({ id, batch_no, ... })
   * @param {Array} relations flat list of relations ({ source_batch_id, target_batch_id, quantity })
   * @returns {{ roots:Array, parentMap:Object }} roots = top-level batches with nested `.children`
   */
  function buildTree(batches, relations) {
    const byId = {};
    (batches || []).forEach(b => { byId[b.id] = { ...b, children: [] }; });

    const parentMap = {};
    (relations || []).forEach(r => {
      const src = byId[r.source_batch_id];
      const tgt = byId[r.target_batch_id];
      if (src && tgt) {
        src.children.push({ relation: r, batch: tgt });
        parentMap[r.target_batch_id] = r.source_batch_id;
      }
    });

    const hasParent = new Set(Object.keys(parentMap));
    const roots = (batches || [])
      .filter(b => !hasParent.has(b.id))
      .map(b => byId[b.id]);

    const sortRec = (node) => {
      node.children.sort((a, b) => String(a.batch.batch_no || '').localeCompare(String(b.batch.batch_no || '')));
      node.children.forEach(c => sortRec(c.batch));
    };
    roots.forEach(sortRec);

    return { roots, parentMap };
  }

  /** Human-readable label + color for a batch status. */
  const LABELS = {
    active: '在制',
    partially_split: '部分拆分',
    split: '已拆分',
    completed: '已完成',
    cancelled: '已取消'
  };
  const COLORS = {
    active: '#2563EB',
    partially_split: '#EA580C',
    split: '#0F172A',
    completed: '#16A34A',
    cancelled: '#6B7280'
  };
  function statusLabel(status) {
    return { label: LABELS[status] || status, color: COLORS[status] || '#6B7280' };
  }

  return { validateSplit, buildTree, statusLabel };
})();
