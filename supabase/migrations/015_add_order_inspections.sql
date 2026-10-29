-- ============================================================
-- DialFactory V1 · Migration 015 — 巡检记录（order_inspections）
--
-- 设计要点：**独立表，而不是 orders.last_inspected_at**
--   orders 上有 trg_orders_updated_at（010），任何 UPDATE orders 都会被
--   触发器把 updated_at 刷成 now()。若把巡检时间写进 orders，
--   "刚巡检" 会立刻变成 "刚更新"，直接破坏首页/列表页按 updated_at
--   升序的「未推进时长」排序。
--   独立表与 orders 完全解耦：巡检只作为辅助标记。
--
-- 在 Supabase Dashboard → SQL Editor 手动执行本文件。
-- ============================================================

CREATE TABLE IF NOT EXISTS order_inspections (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    inspected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    inspected_by UUID,                       -- 预留：接入 auth.uid() 后可填
    note         TEXT
);

-- 每单取"最近一次巡检"、首页取"今日已巡检"各需要一个索引方向
CREATE INDEX IF NOT EXISTS idx_order_inspections_order_time
    ON order_inspections (order_id, inspected_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_inspections_time
    ON order_inspections (inspected_at DESC);

COMMENT ON TABLE  order_inspections IS '巡检记录（辅助）：详情页点「确认巡检」追加一行，不写 orders，故不影响 updated_at 排序';
COMMENT ON COLUMN order_inspections.inspected_at IS '巡检确认时间（默认 now()）';

-- RLS：与 009 保持一致（仅 authenticated 可读写）
ALTER TABLE order_inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth full access" ON order_inspections;
CREATE POLICY "auth full access" ON order_inspections
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
