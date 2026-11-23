-- ============================================================
-- DialFactory V1 · Migration 021 — P1 批次记账表
-- 目的：节点完成时，把「哪个批次、在哪道工序、进出多少」记一笔，
--       让订单详情能按颜色看到批次流转与产出。
--
-- 设计取舍（重要）：
--   · 一个 (批次, 节点) 只有一条记录 —— UNIQUE 约束即幂等键，重复完成不会写重
--   · qty_in  = 批次进入该工序时的数量（= 批次自身数量）
--   · qty_out / good_qty / bad_qty 仅在「该订单只有一个批次」时精确记录；
--     多批次时写 NULL，表示未按批次拆分统计 —— 不编造数据
--   · 不改 order_nodes、不影响单 active 与巡检
--
-- 在 Supabase Dashboard → SQL Editor（东京项目 wzfkmwrqnvjegunjueka）手动执行。
-- ============================================================

CREATE TABLE IF NOT EXISTS batch_progress (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id      UUID NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
    node_id       UUID NOT NULL REFERENCES order_nodes(id)      ON DELETE CASCADE,
    order_id      UUID NOT NULL REFERENCES orders(id)           ON DELETE CASCADE,
    process_name  TEXT,
    qty_in        INTEGER,
    qty_out       INTEGER,
    good_qty      INTEGER,
    bad_qty       INTEGER,
    completed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT batch_progress_unique UNIQUE (batch_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_batch_progress_order ON batch_progress(order_id);
CREATE INDEX IF NOT EXISTS idx_batch_progress_batch ON batch_progress(batch_id);

ALTER TABLE batch_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth full access" ON batch_progress;
CREATE POLICY "auth full access" ON batch_progress
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 校验
-- SELECT count(*) FROM batch_progress;
-- SELECT conname FROM pg_constraint WHERE conrelid = 'batch_progress'::regclass;

NOTIFY pgrst, 'reload schema';
