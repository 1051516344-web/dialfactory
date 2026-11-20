-- ============================================================
-- DialFactory V1 · Migration 018
-- 新增「喷金油」工序（制二 · 加工）
--
-- 【需求来源】
--   工厂要求：制二「喷漆」之后还有细化工序「喷金油」。
--   为避免工序字典爆炸，具体金油型号/参数一律写进**订单备注**，
--   字典里只保留工序名（前端建单页备注框下方已加提示文案）。
--
-- 【⚠️ 为什么只有 1 道工序（「消光」没有新增）】
--   原需求是新增「P43 喷金油」「P44 消光」两道，但核查后：
--   ① 制二**已存在消光**：P19 消光 · 加工 · 制二（tools/factory_data_reset.py L142），
--      且位置正好在 P18 喷漆 之后 —— 语义与本需求完全一致。
--   ② 再插一条同名「消光」会造成工序字典同名重复，建单第二步选工序时出现歧义
--      （route_signature 由工序名拼接，见 js/data/route-templates.js buildSignature）。
--   故本迁移**只新增喷金油**，消光沿用既有 P19。业务若坚持要独立编码，请另行确认后再插。
--
-- 【编码为什么是 P44（不是 P43）】
--   P43 已被迁移 016 的「切窗」占用（制一 · 加工）；
--   processes.code 是 TEXT NOT NULL UNIQUE（001 L61），重插 P43 会直接违反唯一约束。
--   仓内既定策略：order_nodes.process_code 存历史快照，编码**一律顺延、不重编号**
--   （见 014 头注释 L20-21、016 头注释 L8-11）。因此喷金油顺延为 **P44**。
--
-- 【type = 加工】
--   不选「检验」：type='检验' 会触发「完成节点必须填写产出数量」的强制校验
--   （js/domain/validation.js requiresQtyOut / node-actions.js）。
--
-- 【is_required / is_active】
--   is_required=false（与既有 43 条保持一致，该列当前没有代码校验或展示）；
--   is_active=true（ProcessesAPI.listProcesses 只取 is_active=true，
--   否则建单页选不到该工序）。
--
-- 【幂等】
--   WHERE NOT EXISTS (code='P44') —— 重复执行不报错、不重复插入。
--   另加 name 守卫：若已存在同名「喷金油」（不同编码）则跳过并提示，避免同名重复。
--
-- 在 Supabase Dashboard → SQL Editor 中手动执行。
-- ============================================================


-- ------------------------------------------------------------
-- 0. 前置检查：部门「制二」必须存在
-- ------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM departments WHERE name = '制二') THEN
        RAISE EXCEPTION '未找到部门「制二」，请先核对 departments.name 的实际值';
    END IF;
END $$;


-- ------------------------------------------------------------
-- 1. 同名守卫：若已有「喷金油」但不是 P44，跳过并提示
-- ------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM processes WHERE name = '喷金油' AND code <> 'P44') THEN
        RAISE NOTICE '已存在名为「喷金油」的工序（编码非 P44），本脚本不会重复插入，请人工核对。';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM processes WHERE code = 'P19' AND name = '消光') THEN
        RAISE NOTICE '注意：未找到 P19「消光」（制二）。若字典中确实没有消光，请再确认是否需要单独新增。';
    END IF;
END $$;


-- ------------------------------------------------------------
-- 2. 插入 P44 喷金油（幂等：code 不存在 且 name 不存在才插）
-- ------------------------------------------------------------
INSERT INTO processes (code, name, type, default_dept_id, is_required, is_active)
SELECT 'P44',
       '喷金油',
       '加工',
       (SELECT d.id FROM departments d WHERE d.name = '制二'),
       false,
       true
WHERE NOT EXISTS (SELECT 1 FROM processes p WHERE p.code = 'P44')
  AND NOT EXISTS (SELECT 1 FROM processes p WHERE p.name = '喷金油');


-- ------------------------------------------------------------
-- 3. 验证（执行后请手动跑以下查询确认）
-- ------------------------------------------------------------
-- 3a) 喷金油是否插入成功（预期 1 行：P44 | 喷金油 | 加工 | 制二 | false | true）
--   SELECT p.code, p.name, p.type, d.name AS dept, p.is_required, p.is_active
--   FROM processes p
--   LEFT JOIN departments d ON d.id = p.default_dept_id
--   WHERE p.code = 'P44';

-- 3b) 消光沿用既有 P19（预期 1 行：P19 | 消光 | 加工 | 制二）
--   SELECT p.code, p.name, p.type, d.name AS dept
--   FROM processes p
--   LEFT JOIN departments d ON d.id = p.default_dept_id
--   WHERE p.name = '消光';

-- 3c) 制二工序清单（预期 16 条：P12..P25 + P44）
--   SELECT p.code, p.name, p.type, p.is_active
--   FROM processes p
--   JOIN departments d ON d.id = p.default_dept_id
--   WHERE d.name = '制二'
--   ORDER BY p.code;

-- 3d) 整个字典是否还有同名重复（预期 0 行）
--   SELECT name, count(*) FROM processes GROUP BY name HAVING count(*) > 1;

NOTIFY pgrst, 'reload schema';
