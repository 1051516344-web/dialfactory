-- ============================================================
-- DialFactory V1 · Migration 017 — 单 active 节点约束（P0 兜底）
-- ------------------------------------------------------------
-- 目标：同一订单同一时刻最多只能有一个 status='active' 的节点。
--
-- 前端已在 3 个入口加了守卫（activate / resume / undo，共用
-- js/domain/node-actions.js 的 guardSingleActive），本索引是
-- 数据库层的最后一道防线，用于拦住「并发 / 异常 / 绕过前端」的写入。
--
-- ⚠️ 执行顺序（务必按顺序）：
--   ① 先跑 §1，确认库里是否存在存量"双 active"异常；
--   ② 若 §1 有结果，先按 §2 人工修正数据（确认保留哪一道工序！）；
--   ③ 最后执行 §3 创建唯一索引。
--   若 §1 无结果，可直接跳到 §3。
--
-- 在 Supabase Dashboard → SQL Editor 中手动执行。
-- ============================================================


-- ============================================================
-- §1 检查：存量的"双 active"异常
-- ============================================================

-- 1a) 概览：哪些订单存在多个 active 节点
SELECT
    order_id,
    count(*)                                  AS active_cnt,
    array_agg(process_code ORDER BY seq)      AS active_codes
FROM order_nodes
WHERE status = 'active'
GROUP BY order_id
HAVING count(*) > 1
ORDER BY active_cnt DESC;

-- 1b) 明细：带订单号与工序信息，便于人工判断哪一道才是在制的
SELECT
    o.order_no,
    n.order_id,
    n.seq,
    n.process_code,
    n.process_name,
    n.dept_name,
    n.updated_at
FROM order_nodes n
JOIN orders o ON o.id = n.order_id
WHERE n.status = 'active'
  AND n.order_id IN (
      SELECT order_id
      FROM order_nodes
      WHERE status = 'active'
      GROUP BY order_id
      HAVING count(*) > 1
  )
ORDER BY o.order_no, n.seq;


-- ============================================================
-- §2 修正（可选：仅在 §1 查出异常时执行）
-- ------------------------------------------------------------
-- 默认策略：同一订单内保留 seq 最小（最靠前）的那个 active，
-- 其余重复的 active 改回 waiting。
--
-- ⚠️ 执行前请先人工确认：真正在制的是哪一道工序？
--    如果是在制的是 seq 较大的那道，请改用「保留 seq 最大」的版本
--    （把 m.seq < n.seq 改成 m.seq > n.seq）。
-- ============================================================

-- UPDATE order_nodes n
-- SET status = 'waiting', pause_reason = NULL
-- WHERE n.status = 'active'
--   AND EXISTS (
--       SELECT 1
--       FROM order_nodes m
--       WHERE m.order_id = n.order_id
--         AND m.status = 'active'
--         AND m.seq < n.seq          -- 保留 seq 最小的 active
--   );


-- ============================================================
-- §3 创建部分唯一索引（单 active 的数据库级保证）
-- 索引只覆盖 status='active' 的行，不影响 waiting/done/paused 的数量。
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_order_nodes_one_active
    ON order_nodes (order_id)
    WHERE status = 'active';


-- ============================================================
-- §4 验证
-- ============================================================

-- 4a) 异常检查：应返回 0 行
SELECT order_id, count(*) AS active_cnt
FROM order_nodes
WHERE status = 'active'
GROUP BY order_id
HAVING count(*) > 1;

-- 4b) 索引确认：应能看到 ux_order_nodes_one_active
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'order_nodes'
  AND indexname = 'ux_order_nodes_one_active';

NOTIFY pgrst, 'reload schema';
