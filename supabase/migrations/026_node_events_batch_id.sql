-- ============================================================
-- DialFactory V1 · Migration 026 — 事件归属批次（P1 批次独立流转基础）
-- 目的：让每条工序事件能归属到具体批次，从而推导「每个批次自己走到了哪」。
--
-- 语义：
--   · batch_id 为空 = 订单级事件（无批次订单，或 026 之前的存量历史）
--   · batch_id 有值 = 该批次的独立事件
--   · 批次被删除时，其事件随之删除（与"移除工序 → 轨迹消失"一致）
--
-- 在 Supabase Dashboard → SQL Editor（东京项目 wzfkmwrqnvjegunjueka）手动执行。
-- ============================================================

ALTER TABLE node_events
    ADD COLUMN IF NOT EXISTS batch_id UUID
    REFERENCES production_batches(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_node_events_batch
    ON node_events(batch_id, occurred_at);

NOTIFY pgrst, 'reload schema';
