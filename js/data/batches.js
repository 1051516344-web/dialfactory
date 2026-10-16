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
    return DB.call(
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
