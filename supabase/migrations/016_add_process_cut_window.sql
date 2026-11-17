-- ============================================================
-- DialFactory V1 · Migration 016
-- 新增 1 道「切窗」工序（制一 · 加工）
--
-- 【需求来源】
--   工厂要求工序字典补充「切窗」（制一）。
--
-- 【编码为什么是 P43】
--   迁移 014 已把编码用至 P42；order_nodes.process_code 存有**历史快照**
--   （见 014 头注释 L20-21），重编号会让历史数据与字典对不上，
--   因此一律**顺延分配** P43，不打乱既有编码。
--
-- 【⚠️ 与 P04「允窗」的关系，请业务确认】
--   工序字典里已存在 P04 允窗（制一 · 加工，语义：修整日历窗口）。
--   · 若「切窗」与「允窗」是同一道工序的两种叫法 → 应**改名**（UPDATE name），
--     而不是新增，否则路线里会出现两道语义重复的工序。
--   · 若二者确实是前后两道不同工序（如先切窗 后允窗）→ 本脚本按新增执行即可。
--
-- 【type = 加工】
--   不选「检验」——type='检验' 会触发「完成节点必须填写产出数量」的强制校验
--   （js/domain/validation.js requiresQtyOut / js/domain/node-actions.js），
--   切窗属于加工动作，无需逐件报产出。
--
-- 【is_required / is_active】
--   与既有工序保持一致：is_required=false、is_active=true。
--   前端 ProcessesAPI.listProcesses 只取 is_active=true，
--   新增后「新建订单 → 第 2 步选工序」会按 default_dept_id 自动归入「制一」分组，
--   **前端零改动**。
--
-- 【幂等】
--   WHERE NOT EXISTS (code) —— 重复执行不报错、不重复插入。
-- ============================================================

-- 前置检查：制一部门必须存在，否则 default_dept_id 取到 NULL，
-- 工序会被归入前端「其他」分组（order-create.js renderStep2），属静默错误。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM departments d WHERE d.name = '制一') THEN
    RAISE EXCEPTION 'Migration 016 中止：departments 表缺少部门 [制一]';
  END IF;
END $$;

INSERT INTO processes (code, name, type, default_dept_id, is_required, is_active)
SELECT 'P43',
       '切窗',
       '加工',
       (SELECT d.id FROM departments d WHERE d.name = '制一'),
       false,
       true
WHERE NOT EXISTS (SELECT 1 FROM processes p WHERE p.code = 'P43');

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 验证
--
-- ① 新增的这一条是否正确
--   SELECT p.code, p.name, p.type, d.name AS dept, p.is_required, p.is_active
--   FROM processes p
--   LEFT JOIN departments d ON d.id = p.default_dept_id
--   WHERE p.code = 'P43';
--   预期：P43 | 切窗 | 加工 | 制一 | false | true
--
-- ② 启用工序总数
--   SELECT count(*) FROM processes WHERE is_active = true;   -- 预期 43（原 42 + 1）
--
-- ③ 与 P04 对照（确认是否语义重复）
--   SELECT code, name, type FROM processes WHERE code IN ('P04', 'P43') ORDER BY code;
--
-- 若 ① 的 dept 列为 NULL → 部门名不匹配，请核对 departments.name。
-- ============================================================
