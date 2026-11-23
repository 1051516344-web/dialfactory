/* ============================================================
   DialFactory V1 · Node Events API（工序事件流）
   ------------------------------------------------------------
   生产轨迹的唯一事实源：每一次工序状态变化追加一条不可变事件。
   节点被移除时，其事件由外键 ON DELETE CASCADE 一并删除。
   ============================================================ */

const NodeEventsAPI = (() => {

  /** 某订单的全部工序事件（按发生时间升序） */
  async function listByOrderId(orderId) {
    return DB.call(
      DB.get().from('node_events')
        .select('*')
        .eq('order_id', orderId)
        .order('occurred_at', { ascending: true })
    );
  }

  /** 追加一条事件（失败只告警，绝不影响主流程） */
  async function record(evt) {
    try {
      const res = await DB.call(
        DB.get().from('node_events').insert(evt).select().single()
      );
      if (!res.ok) console.warn('[NodeEvents] 写入失败:', res.error);
      return res;
    } catch (e) {
      console.warn('[NodeEvents] 写入异常:', e && e.message);
      return { ok: false, error: e && e.message };
    }
  }

  return { listByOrderId, record };
})();
