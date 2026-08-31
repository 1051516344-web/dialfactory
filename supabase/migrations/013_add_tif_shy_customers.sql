-- ============================================================
-- DialFactory V1 · Migration 013
-- Add two real customers that were missing from the 16-customer
-- seed but appear on actual drawings:
--   TIF  (图纸生产编号旁英文缩写 TIF)
--   SHY  (图纸生产编号旁英文缩写 SHY)
--
-- 规则：OCR 识别到什么缩写，就精确匹配什么缩写，不做别名映射/猜测。
-- 因此 code / short_name 直接采用图纸上的缩写。
-- 公司全名尚未确认，name 用「缩写(待确认)」占位，
-- 沿用 HKG（"香港钟表(待确认)"）的既有占位约定。
--
-- 幂等：仅当 code 不存在时才插入（customers.code 有部分唯一索引）。
-- ============================================================

INSERT INTO customers (name, code, short_name, is_active)
SELECT 'TIF(待确认)', 'TIF', 'TIF', true
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE code = 'TIF');

INSERT INTO customers (name, code, short_name, is_active)
SELECT 'SHY(待确认)', 'SHY', 'SHY', true
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE code = 'SHY');

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 验证
--   SELECT code, name, short_name, is_active FROM customers
--   WHERE code IN ('TIF', 'SHY') ORDER BY code;
-- 预期：2 行，code/short_name 分别为 TIF、SHY，is_active = true。
-- ============================================================
