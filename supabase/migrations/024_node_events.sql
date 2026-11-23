-- ============================================================
-- DialFactory V1 · Migration 024 — 工序事件流（生产轨迹的唯一事实源）
-- 目的：生产轨迹不再依赖「建单时预建的 production_records」，
--       而是由每一次工序状态变化追加一条不可变事件。
--
-- 关键点：node_events.node_id → order_nodes(id) ON DELETE CASCADE
--   → 工序被移除时，它的轨迹自动消失（与用户要求一致）
--
-- 事件类型：activate / done / pause / resume / undo / append / rework
--
-- 在 Supabase Dashboard → SQL Editor（东京项目 wzfkmwrqnvjegunjueka）手动执行。
-- ============================================================

CREATE TABLE IF NOT EXISTS node_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    node_id      UUID REFERENCES order_nodes(id) ON DELETE CASCADE,
    process_name TEXT,
    event        TEXT NOT NULL,
    from_status  TEXT,
    to_status    TEXT,
    good_qty     INTEGER,
    bad_qty      INTEGER,
    note         TEXT,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_node_events_order ON node_events(order_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_node_events_node  ON node_events(node_id);

ALTER TABLE node_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth full access" ON node_events;
CREATE POLICY "auth full access" ON node_events
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 回填历史（幂等）
-- ------------------------------------------------------------
-- 1) 已完成的节点 → done 事件（数量取最新生产记录）
INSERT INTO node_events (order_id, node_id, process_name, event, to_status, good_qty, bad_qty, occurred_at)
SELECT n.order_id, n.id, n.process_name, 'done', 'done', r.good_qty, r.bad_qty,
       COALESCE(n.updated_at, now())
FROM order_nodes n
LEFT JOIN LATERAL (
    SELECT good_qty, bad_qty FROM production_records
    WHERE node_id = n.id ORDER BY created_at DESC LIMIT 1
) r ON TRUE
WHERE n.status = 'done'
  AND NOT EXISTS (SELECT 1 FROM node_events e WHERE e.node_id = n.id AND e.event = 'done');

-- 2) 进行中 / 暂停的节点 → activate / pause 事件
INSERT INTO node_events (order_id, node_id, process_name, event, to_status, occurred_at)
SELECT n.order_id, n.id, n.process_name,
       CASE WHEN n.status = 'paused' THEN 'pause' ELSE 'activate' END,
       n.status, COALESCE(n.updated_at, now())
FROM order_nodes n
WHERE n.status IN ('active', 'paused')
  AND NOT EXISTS (
    SELECT 1 FROM node_events e
    WHERE e.node_id = n.id AND e.event IN ('activate', 'resume', 'pause')
  );

NOTIFY pgrst, 'reload schema';
