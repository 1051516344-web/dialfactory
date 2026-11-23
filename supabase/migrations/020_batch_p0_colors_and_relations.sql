-- ============================================================
-- DialFactory V1 · Migration 020 — P0 批次结构扩展
-- 目的：让批次能挂到工序节点上，并支持「分流 / 合并 / 返工改色」三类关系。
--
-- 变更内容：
--   1. production_batches.current_node_id —— 批次当前所在节点（可空）
--   2. batch_relations.relation_type 扩展为 split / merge / rework
--   3. batch_relations.loss_qty —— 损耗片数（洗漆重做场景必填，默认 0）
--   4. 配套索引
--
-- 说明：
--   · 全部为 ADD COLUMN / 约束替换，幂等，可重复执行
--   · 不动 order_nodes、不动 production_records、不影响单 active 规则
--   · orders.specs.colors 是 JSONB 内部结构，无需改表（由前端录入）
--
-- 在 Supabase Dashboard → SQL Editor（东京项目 wzfkmwrqnvjegunjueka）手动执行。
-- ============================================================


-- ----------------------------------------------------------
-- 1. 批次当前所在节点（可空：根批次刚创建时还没有进入工序）
-- ----------------------------------------------------------
ALTER TABLE production_batches
    ADD COLUMN IF NOT EXISTS current_node_id UUID
    REFERENCES order_nodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_batches_current_node
    ON production_batches(current_node_id);


-- ----------------------------------------------------------
-- 2. 关系类型扩展：split（分流）/ merge（合并）/ rework（返工改色）
--    原来的内联 CHECK 由 PostgreSQL 自动命名为 batch_relations_relation_type_check
-- ----------------------------------------------------------
ALTER TABLE batch_relations
    DROP CONSTRAINT IF EXISTS batch_relations_relation_type_check;

ALTER TABLE batch_relations
    ADD CONSTRAINT batch_relations_relation_type_check
    CHECK (relation_type IN ('split', 'merge', 'rework'));


-- ----------------------------------------------------------
-- 3. 损耗片数（洗漆、报废等）
--    注意：split/merge 的 loss_qty 通常为 0；rework 场景必填实际损耗
-- ----------------------------------------------------------
ALTER TABLE batch_relations
    ADD COLUMN IF NOT EXISTS loss_qty INTEGER NOT NULL DEFAULT 0;

ALTER TABLE batch_relations
    DROP CONSTRAINT IF EXISTS batch_relations_loss_qty_check;

ALTER TABLE batch_relations
    ADD CONSTRAINT batch_relations_loss_qty_check
    CHECK (loss_qty >= 0);


-- ----------------------------------------------------------
-- 4. 校验（执行后确认三项都存在）
-- ----------------------------------------------------------
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name IN ('production_batches','batch_relations')
--    AND column_name IN ('current_node_id','loss_qty');
--
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conname = 'batch_relations_relation_type_check';


NOTIFY pgrst, 'reload schema';
