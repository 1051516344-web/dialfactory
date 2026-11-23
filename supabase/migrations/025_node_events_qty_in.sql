-- ============================================================
-- DialFactory V1 · Migration 025 — 事件增加「投入数量」
-- 用于生产轨迹看板计算：投入 / 良品 / 次品 / 损耗
--
-- 在 Supabase Dashboard → SQL Editor（东京项目 wzfkmwrqnvjegunjueka）手动执行。
-- ============================================================

ALTER TABLE node_events
    ADD COLUMN IF NOT EXISTS qty_in INTEGER;

NOTIFY pgrst, 'reload schema';
