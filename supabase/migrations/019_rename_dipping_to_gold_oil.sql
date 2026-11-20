-- ============================================================
-- DialFactory V1 · Migration 019
-- ① 清理 018 误加的 P44「喷金油」
-- ② 将制二既有工序「打底」(P17) 直接改名为「喷金油」
--
-- 【为什么改成"改名"方案】
--   018 的方案是新增 P44 喷金油，但业务确认：
--   · 系统内**没有任何历史订单、没有任何历史路线模板**（无历史包袱）
--   · 制二「打底」与「喷金油」在实际业务中是同一道工序
--   因此不新增编码，直接把现有 P17「打底」改名，字典更干净
--   （避免同一道工序出现两个名字/重复项）。
--
-- 【执行顺序】必须按 1 → 2 → 3：
--   先删 P44，否则改名后会同时存在两条「喷金油」（P44 + P17）。
--
-- 【安全性】
--   · processes 被 order_nodes.process_id 以 FK 引用（ON DELETE RESTRICT），
--     若 P44 已被节点引用，DELETE 会直接报错而**不会**静默留下脏数据。
--   · 改名用 DO 块加守卫：部门必须存在、必须恰好命中 1 条「打底」、
--     改名后不得出现同名重复，否则抛异常阻断。
--   · 改名只改字典 name；order_nodes.process_name 是历史快照，
--     因确认无历史订单，无需回填。
--
-- 在 Supabase Dashboard → SQL Editor 中手动执行。
-- ============================================================


-- ------------------------------------------------------------
-- 0. 前置体检（只读；建议先单独跑，确认结果符合预期再执行 1~3）
-- ------------------------------------------------------------
-- 0a) 「打底」是否被节点引用 / 是否有历史快照（预期 0 / 0）
--   SELECT count(*) AS ref_nodes
--   FROM order_nodes n JOIN processes p ON p.id = n.process_id
--   WHERE p.name = '打底';
--
--   SELECT count(*) AS snapshot_nodes FROM order_nodes WHERE process_name = '打底';
--
-- 0b) 路线模板 JSON 里是否含「打底」（预期 0）
--   SELECT count(*) AS templates_with_dibase
--   FROM process_route_templates
--   WHERE process_list::text LIKE '%打底%';
--
-- 0c) P44 现状（跑过 018 则有 1 行：P44 | 喷金油）
--   SELECT code, name FROM processes WHERE code = 'P44';


-- ------------------------------------------------------------
-- 1. 删除 018 误加的 P44「喷金油」
--    幂等：未跑过 018 时为 0 行；若已被节点引用会因 FK RESTRICT 报错（安全的失败）
-- ------------------------------------------------------------
DELETE FROM processes WHERE code = 'P44';


-- ------------------------------------------------------------
-- 2. 将制二「打底」改名为「喷金油」（带守卫，失败即回滚）
-- ------------------------------------------------------------
DO $$
DECLARE
    v_dept  uuid;
    v_cnt   integer;
    v_dup   integer;
BEGIN
    -- 2.1 定位部门「制二」
    SELECT id INTO v_dept FROM departments WHERE name = '制二' LIMIT 1;
    IF v_dept IS NULL THEN
        RAISE EXCEPTION '未找到部门「制二」，请先核对 departments.name 的实际值';
    END IF;

    -- 2.2 必须恰好命中 1 条「打底」
    SELECT count(*) INTO v_cnt
    FROM processes
    WHERE name = '打底' AND default_dept_id = v_dept;

    IF v_cnt = 0 THEN
        RAISE NOTICE '制二未找到「打底」（可能已改名或已删除），跳过改名';
    ELSIF v_cnt > 1 THEN
        RAISE EXCEPTION '制二存在 % 条「打底」，请人工确认后再改名', v_cnt;
    ELSE
        UPDATE processes
        SET name = '喷金油'
        WHERE name = '打底' AND default_dept_id = v_dept;
        RAISE NOTICE '已完成：制二「打底」改名为「喷金油」';
    END IF;

    -- 2.3 改名后不得出现同名重复
    SELECT count(*) INTO v_dup
    FROM processes
    WHERE name = '喷金油' AND default_dept_id = v_dept;
    IF v_dup > 1 THEN
        RAISE EXCEPTION '制二出现 % 条「喷金油」，请人工核对（事务已回滚）', v_dup;
    END IF;
    IF v_dup = 0 THEN
        RAISE NOTICE '注意：制二中未找到「喷金油」，请确认改名是否成功';
    END IF;
END $$;


-- ------------------------------------------------------------
-- 3. 验证（执行后请手动跑以下查询确认）
-- ------------------------------------------------------------
-- 3a) 制二工序清单（预期 14 条：P12..P25，其中 P17 名称已变为「喷金油」）
--   SELECT p.code, p.name, p.type, p.is_active, d.name AS dept
--   FROM processes p LEFT JOIN departments d ON d.id = p.default_dept_id
--   WHERE d.name = '制二'
--   ORDER BY p.code;
--
-- 3b) P17 应为「喷金油」，P18 喷漆 / P19 消光 保持不变（预期 3 行）
--   SELECT p.code, p.name, d.name AS dept
--   FROM processes p LEFT JOIN departments d ON d.id = p.default_dept_id
--   WHERE p.code IN ('P17', 'P18', 'P19')
--   ORDER BY p.code;
--
-- 3c) P44 已不存在（预期 0 行）
--   SELECT code, name FROM processes WHERE code = 'P44';
--
-- 3d) 「打底」已不存在（预期 0 行）
--   SELECT code, name FROM processes WHERE name = '打底';
--
-- 3e) 全字典同名重复检查（预期 0 行）
--   SELECT name, count(*) FROM processes GROUP BY name HAVING count(*) > 1;

NOTIFY pgrst, 'reload schema';
