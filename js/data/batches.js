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

  return { createRootBatch, listByOrderId, getById, splitBatch };
})();
