-- ============================================================
-- DialFactory V1 · Migration 023 — 生产记录真实开工时间
-- 目的：让「生产轨迹」和「耗时」对齐实际生产，而不是从建单时间瞎算。
--
-- 背景：P2 删掉「开始生产」按钮后，系统里不再有任何地方记录"真正开工时间"，
--   于是 duration_minutes 一直用 created_at（建单时间）算 —— 排队时间被算进生产耗时。
--
-- 变更内容：
--   1. production_records.started_at —— 节点被置为 active 的时刻（可空）
--   2. set_duration_minutes() 触发器改为：
--        · 有 started_at → duration = completed_at - started_at
--        · 无 started_at → duration 置 NULL（不编造）
--
-- 语义：
--   · started_at 只在 advance/activate/resume 把节点变成 active 时写入
--   · 建单时第一个节点虽为 active，但没有"开工事件"，started_at 留空 —— 只显示完成时间
--   · 历史记录 started_at 为空，duration 会被算成 NULL（旧数据不追溯编造）
--
-- 在 Supabase Dashboard → SQL Editor（东京项目 wzfkmwrqnvjegunjueka）手动执行。
-- ============================================================

ALTER TABLE production_records
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION set_duration_minutes() RETURNS trigger AS $$
BEGIN
  IF NEW.status = '已完成' AND OLD.status IS DISTINCT FROM '已完成' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    IF NEW.started_at IS NOT NULL THEN
      NEW.duration_minutes := ROUND(EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) / 60)::int;
    ELSE
      -- 没有开工时间就不算耗时，避免把排队时间当生产时间
      NEW.duration_minutes := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 触发器本身已存在（010），函数替换后自动生效，无需重建。

NOTIFY pgrst, 'reload schema';
