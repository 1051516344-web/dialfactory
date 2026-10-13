-- ============================================================
-- DialFactory V1 · Migration 014
-- 新增 7 道「采购 / 外发」工序（制一 ~ 制四）
--
-- 【需求来源】
--   工厂要求：新建订单第二步「建立生产路线」能勾选采购与外发工序。
--   采用「方案 A」——往 processes 字典表新增记录。
--   前端零改动即可生效：第二步按 default_dept_id 自动分组显示
--   （js/pages/order-create.js renderStep2，L194-226）。
--
-- 【命名规则】
--   沿用工厂口径「采购XXX / 外发XXX」。7 条名称**彼此唯一**，避免
--   route_signature（工序名以 - 连接，见 js/data/route-templates.js
--   buildSignature L16-21）出现跨部门同名冲突。
--
-- 【编码为什么从 P36 起】
--   现有工序目录已占用 P01–P35，且按部门连续分段
--   （制一 P01-11 / 制二 P12-25 / 制三 P26-27 / 制四 P28-34 / 总QC P35，
--    来源 tools/factory_data_reset.py L121-162）。
--   order_nodes.process_code 存有**历史快照**，重编号会让历史数据与字典
--   对不上，因此一律**顺延分配 P36–P42**，不打乱既有编码。
--
-- 【type 统一为「辅助」】
--   processes.type 仅允许 加工/检验/辅助（001_initial_schema.sql L63-64）。
--   不选「检验」的原因：type='检验' 会触发「完成节点时必须填写产出数量」的
--   强制校验（js/domain/validation.js validateQtyOut L8-22 +
--   js/domain/node-actions.js L19-22），采购/外发通常无需逐件报产出。
--
-- 【is_required / is_active】
--   统一 is_required=false（该列当前**没有任何代码校验或展示**，与既有 35 条
--   保持一致），is_active=true（ProcessesAPI.listProcesses 只取 is_active=true）。
--
-- 【幂等】
--   逐行 WHERE NOT EXISTS (code)——重复执行不报错、不重复插入。
-- ============================================================

-- 前置检查：4 个部门必须存在。否则下面的子查询会取到 NULL，
-- 工序会被归入前端「其他」分组（order-create.js L198），属静默错误。
-- 如需极简脚本，可删除本 DO 块。
DO $$
DECLARE missing TEXT;
BEGIN
  SELECT string_agg(t.n, ', ') INTO missing
  FROM (VALUES ('制一'), ('制二'), ('制三'), ('制四')) AS t(n)
  WHERE NOT EXISTS (SELECT 1 FROM departments d WHERE d.name = t.n);

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 014 中止：departments 表缺少部门 [%]', missing;
  END IF;
END $$;

-- 7 条一起插入（default_dept_id 由子查询按部门名取得）
INSERT INTO processes (code, name, type, default_dept_id, is_required, is_active)
SELECT v.code,
       v.name,
       v.type,
       (SELECT d.id FROM departments d WHERE d.name = v.dept_name),
       false,
       true
FROM (VALUES
    ('P36', '采购粗胚',   '辅助', '制一'),
    ('P37', '外发焊脚',   '辅助', '制一'),
    ('P38', '外发车床',   '辅助', '制一'),
    ('P39', '外发批面',   '辅助', '制一'),
    ('P40', '电镀外发',   '辅助', '制二'),
    ('P41', '印刷外发',   '辅助', '制三'),
    ('P42', '点夜光外发', '辅助', '制四')
) AS v(code, name, type, dept_name)
WHERE NOT EXISTS (SELECT 1 FROM processes p WHERE p.code = v.code);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 验证
--   SELECT p.code, p.name, p.type, d.name AS dept, p.is_required, p.is_active
--   FROM processes p
--   LEFT JOIN departments d ON d.id = p.default_dept_id
--   WHERE p.code BETWEEN 'P36' AND 'P42'
--   ORDER BY p.code;
-- 预期：7 行
--   P36 采购粗胚   辅助 制一 false true
--   P37 外发焊脚   辅助 制一 false true
--   P38 外发车床   辅助 制一 false true
--   P39 外发批面   辅助 制一 false true
--   P40 电镀外发   辅助 制二 false true
--   P41 印刷外发   辅助 制三 false true
--   P42 点夜光外发 辅助 制四 false true
-- 若 dept 列出现 NULL → 部门名不匹配，请核对 departments.name。
-- ============================================================
