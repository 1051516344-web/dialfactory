/* ============================================================
   DialFactory V1 · Batches API
   Phase 1: production_batches + batch_relations.
   batch_no is entered by humans; system enforces uniqueness + tracks relations.
   ============================================================ */

const BatchesAPI = (() => {

  /**
   * Create a root batch (manually, from the order detail page).
   * @param {{ order_id:string, batch_no:string, quantity:number, color?:string, note?:string }} input
   */
  async function createRootBatch({ order_id, batch_no, quantity, color, note }) {
    const user = await DB.getUser();
    const created_by = user ? user.id : null;
    const res = await DB.call(
      DB.get().from('production_batches')
        .insert({
          order_id,
          batch_no,
          quantity,
          color: color || null,
          note: note || null,
          status: 'active',
          created_by
        })
        .select()
        .single()
    );

    // P3：建批次后立即回填历史 + 初始化当前位置（幂等）。
    // 出生点由 DB 函数自动取「订单当前 active 节点」；失败不阻断建批次。
    if (res.ok && res.data && res.data.id) {
      const bp = await DB.call(
        DB.get().rpc('backfill_batch_progress', { p_batch_id: res.data.id })
      );
      if (!bp.ok) console.warn('[Batches] 批次回填失败:', bp.error);
    }

    return res;
  }

  /**
   * List all batches for an order, plus their split relations (for tree rendering).
   * @returns {{ ok:true, data:{ batches:Array, relations:Array } } | { ok:false, error:string }}
   */
  async function listByOrderId(orderId) {
    const bRes = await DB.call(
      DB.get().from('production_batches')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })
    );
    if (!bRes.ok) return { ok: false, error: bRes.error };

    const batches = bRes.data || [];
    if (batches.length === 0) return { ok: true, data: { batches: [], relations: [] } };

    const ids = batches.map(b => b.id);
    const rRes = await DB.call(
      DB.get().from('batch_relations')
        .select('*')
        .in('source_batch_id', ids)
    );
    if (!rRes.ok) return { ok: false, error: rRes.error };

    return { ok: true, data: { batches, relations: rRes.data || [] } };
  }

  /**
   * Batch detail: base info + parent relations + child relations.
   * @returns {{ ok:true, data:{ batch, parents, children } } | { ok:false, error:string }}
   */
  async function getById(batchId) {
    const [bRes, pRes, cRes] = await Promise.all([
      DB.call(
        DB.get().from('production_batches')
          .select('*, order:orders(order_no, order_qty)')
          .eq('id', batchId)
          .maybeSingle()
      ),
      DB.call(
        DB.get().from('batch_relations')
          .select('*, source:production_batches(batch_no, quantity, color, status)')
          .eq('target_batch_id', batchId)
      ),
      DB.call(
        DB.get().from('batch_relations')
          .select('*, target:production_batches(batch_no, quantity, color, status)')
          .eq('source_batch_id', batchId)
      )
    ]);

    if (!bRes.ok) return { ok: false, error: bRes.error };
    if (!bRes.data) return { ok: false, error: '批次不存在' };

    return {
      ok: true,
      data: {
        batch: bRes.data,
        parents: pRes.ok ? (pRes.data || []) : [],
        children: cRes.ok ? (cRes.data || []) : []
      }
    };
  }

  /**
   * Split a batch into children, atomically (DB RPC `split_batch`).
   * @param {string} sourceBatchId
   * @param {Array<{batch_no:string, quantity:number, color?:string}>} children
   */
  async function splitBatch(sourceBatchId, children) {
    return DB.call(
      DB.get().rpc('split_batch', { p_source_id: sourceBatchId, p_children: children })
    );
  }

  /**
   * 删除一个「叶子」批次（误建批次的撤销入口）。
   * 规则：
   *   · 已拆分的父批次不可直接删除 —— 先删子批次，避免留下孤儿批次
   *   · 子批次可删：连带删除它的 split 关系与 batch_progress（外键 CASCADE）
   *   · 删完子批次后，按剩余分配量重算父批次状态（active / partially_split / split）
   */
  async function deleteBatch(batchId) {
    const db = DB.get();

    // 1) 有子批次 → 拒绝
    const kids = await DB.call(
      db.from('batch_relations').select('id').eq('source_batch_id', batchId)
    );
    if (!kids.ok) return kids;
    if ((kids.data || []).length > 0) {
      return { ok: false, error: '该批次已拆分，请先删除子批次' };
    }

    // 2) 找父批次（若本批次是拆分出来的）
    const par = await DB.call(
      db.from('batch_relations').select('id, source_batch_id').eq('target_batch_id', batchId)
    );
    if (!par.ok) return par;
    const parentId = par.data && par.data[0] ? par.data[0].source_batch_id : null;

    // 3) 删掉「父 → 本批次」的关系（FK RESTRICT，必须先删）
    if (parentId) {
      const r1 = await DB.call(db.from('batch_relations').delete().eq('target_batch_id', batchId));
      if (!r1.ok) return { ok: false, error: '删除批次关系失败' };
    }

    // 4) 删批次本身（batch_progress 级联删除）
    const r2 = await DB.call(db.from('production_batches').delete().eq('id', batchId));
    if (!r2.ok) return { ok: false, error: '删除批次失败' };

    // 5) 重算父批次状态
    if (parentId) await recomputeParentStatus(parentId);

    return { ok: true };
  }

  /** 按剩余子批次分配量，重算父批次状态 */
  async function recomputeParentStatus(parentId) {
    const db = DB.get();
    const p = await DB.call(
      db.from('production_batches').select('quantity').eq('id', parentId).maybeSingle()
    );
    if (!p.ok || !p.data) return;

    const rel = await DB.call(
      db.from('batch_relations').select('quantity').eq('source_batch_id', parentId)
    );
    const allocated = (rel.data || []).reduce((s, r) => s + (Number(r.quantity) || 0), 0);

    let status;
    if (allocated === 0) status = 'active';
    else if (allocated >= Number(p.data.quantity)) status = 'split';
    else status = 'partially_split';

    await DB.call(db.from('production_batches').update({ status }).eq('id', parentId));
  }

  /** 更新批次字段（当前节点 / 状态等，批次独立流转用） */
  async function updateBatch(batchId, fields) {
    return DB.call(
      DB.get().from('production_batches').update(fields).eq('id', batchId).select().single()
    );
  }

  return { createRootBatch, listByOrderId, getById, splitBatch, deleteBatch, updateBatch };
})();
