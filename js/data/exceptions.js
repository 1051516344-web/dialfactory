/* ============================================================
   DialFactory V1 · Exception Events API
   ============================================================ */

const ExceptionsAPI = (() => {

  async function listByNodeIds(nodeIds) {
    if (!nodeIds || nodeIds.length === 0) {
      return { ok: true, data: [] };
    }
    return DB.call(
      DB.get().from('exception_events')
        .select('id,node_id,type,qty,resolution,created_at')
        .in('node_id', nodeIds)
        .order('created_at', { ascending: false })
    );
  }

  async function create({ node_id, type, qty, resolution }) {
    return DB.call(
      DB.get().from('exception_events')
        .insert({ node_id, type, qty, resolution })
        .select()
        .single()
    );
  }

  async function listAll({ type, page = 0, pageSize = 20 } = {}) {
    let query = DB.get().from('exception_events')
      .select('id,node_id,type,qty,resolution,created_at, node:order_nodes(order_id, process_name, orders!inner(order_no))', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (type) query = query.eq('type', type);

    return DB.call(query);
  }

  return { listByNodeIds, create, listAll };
})();
