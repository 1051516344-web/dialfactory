-- ============================================================
-- DialFactory · 一次性修复：节点已完成但生产记录未闭环
-- 生成日期：2026-11-23
-- 背景：修复前 advance() 不联动 production_records，
--       导致 27 个节点里 11 个处于「节点 done / 记录缺失或未完成」。
--
-- 【执行方式】Supabase Dashboard → SQL Editor（东京项目 wzfkmwrqnvjegunjueka）
-- 【执行顺序】必须 0 → 1 → 2 → 3 → 4
-- 【幂等性】可重复执行：第 1 步用 NOT EXISTS，第 2 步只看未完成的记录
--
-- ⚠️ 为什么要第 3 步：
--   010 迁移的 trg_production_records_duration 是 BEFORE UPDATE 触发器，
--   状态一旦变成「已完成」就会用 created_at 到现在重算 duration_minutes。
--   历史节点的 created_at 是建单时间，算出来会是几天甚至几十天——那是假数据。
--   所以第 2 步让触发器算完，第 3 步把 duration 置回 NULL（状态已是已完成，触发器不再介入）。
-- ============================================================


-- ------------------------------------------------------------
-- 0. 备份（先跑这一条；表已存在则跳过）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production_records_backup_20261123 AS
SELECT * FROM production_records;

-- 顺便备份节点状态，便于回滚对照
CREATE TABLE IF NOT EXISTS order_nodes_backup_20261123 AS
SELECT * FROM order_nodes;


-- ------------------------------------------------------------
-- 1. 诊断（只读；执行前先看这一条的结果，预期 11 行）
-- ------------------------------------------------------------
WITH latest AS (
  SELECT DISTINCT ON (r.node_id) r.node_id, r.id AS rec_id, r.status AS rec_status
  FROM production_records r
  WHERE r.node_id IS NOT NULL
  ORDER BY r.node_id, r.created_at DESC
)
SELECT n.id AS node_id, n.order_id, n.process_name, n.updated_at,
       l.rec_id, COALESCE(l.rec_status, '（无记录）') AS rec_status
FROM order_nodes n
LEFT JOIN latest l ON l.node_id = n.id
WHERE n.status = 'done'
  AND (l.rec_status IS NULL OR l.rec_status <> '已完成')
ORDER BY n.updated_at;


-- ------------------------------------------------------------
-- 2. 补建：done 但完全没有记录的节点（7 条）
--    created_at / completed_at 都取节点 updated_at（最后一次状态变更 ≈ 完成时刻）
-- ------------------------------------------------------------
INSERT INTO production_records (order_id, node_id, process_name, status, created_at, completed_at, duration_minutes)
SELECT n.order_id, n.id, n.process_name, '已完成', n.updated_at, n.updated_at, NULL
FROM order_nodes n
WHERE n.status = 'done'
  AND NOT EXISTS (
    SELECT 1 FROM production_records r WHERE r.node_id = n.id
  );


-- ------------------------------------------------------------
-- 3. 收口：done 但记录还停在「待生产 / 生产中」的节点（4 条）
-- ------------------------------------------------------------
UPDATE production_records r
SET status = '已完成',
    completed_at = n.updated_at
FROM order_nodes n
WHERE r.node_id = n.id
  AND n.status = 'done'
  AND r.status IN ('待生产', '生产中');


-- ------------------------------------------------------------
-- 4. 把触发器算出来的假时长清掉（历史数据没有真实计时）
-- ------------------------------------------------------------
UPDATE production_records r
SET duration_minutes = NULL
FROM order_nodes n
WHERE r.node_id = n.id
  AND n.status = 'done'
  AND r.status = '已完成'
  AND r.completed_at = n.updated_at;


-- ------------------------------------------------------------
-- 5. 校验（预期 0 行）
-- ------------------------------------------------------------
WITH latest AS (
  SELECT DISTINCT ON (r.node_id) r.node_id, r.status AS rec_status
  FROM production_records r
  WHERE r.node_id IS NOT NULL
  ORDER BY r.node_id, r.created_at DESC
)
SELECT n.id, n.process_name, n.status AS node_status, COALESCE(l.rec_status,'（无记录）') AS rec_status
FROM order_nodes n
LEFT JOIN latest l ON l.node_id = n.id
WHERE n.status = 'done' AND (l.rec_status IS NULL OR l.rec_status <> '已完成');


-- ------------------------------------------------------------
-- 回滚（如需）
-- ------------------------------------------------------------
-- DELETE FROM production_records r
-- USING production_records_backup_20261123 b
-- WHERE r.id = b.id AND r.status = '已完成' AND b.status <> '已完成';
-- TRUNCATE production_records;
-- INSERT INTO production_records SELECT * FROM production_records_backup_20261123;
