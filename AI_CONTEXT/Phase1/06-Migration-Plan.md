# DialFactory Phase 1-B-1 · Migration Plan

> **状态：** Planning — 等待 Phase 1-B-2 执行
> **阶段：** Phase 1-B-1 — Migration Plan
> **输入：** [01-Supabase-Schema-Plan.md](01-Supabase-Schema-Plan.md) §十一 (Frozen) + [05-Supabase-Environment-Checklist.md](05-Supabase-Environment-Checklist.md) (Decisions Confirmed)
> **输出：** 本文件 + Phase 1-B-2 产出 `001_initial_schema.sql`
> **原则：** 只生成计划。禁止执行 SQL。禁止修改 Freeze 内容。

---

## 一、Migration 执行顺序

### 1.1 依赖分析

```
pgcrypto Extension      ← Phase 0: 前置依赖
        │
        ├── departments      ← Phase 1: 无依赖
        ├── customers        ← Phase 1: 无依赖
        ├── process_routes   ← Phase 1: 无依赖
        │
        ├── processes        ← Phase 1: 依赖 departments
        │
        ├── route_steps      ← Phase 2: 依赖 process_routes, processes
        │
        ├── orders           ← Phase 3: 依赖 customers, process_routes
        │
        ├── order_nodes      ← Phase 4: 依赖 orders, processes, departments
        │
        └── exception_events ← Phase 5: 逻辑依赖 order_nodes，无 FK 约束
```

### 1.2 执行序列（5 Phase / 20 Step）

```
Phase 0: Extension
─────────────────────────────────────────────────
Step  0    CREATE EXTENSION IF NOT EXISTS pgcrypto
Step  0v   SELECT gen_random_uuid() — 验证


Phase 1: Tables (无依赖组)
─────────────────────────────────────────────────
Step  1    CREATE TABLE departments
Step  2    CREATE TABLE customers
Step  3    CREATE TABLE processes            (FK → departments)
Step  4    CREATE TABLE process_routes
Step  5    CREATE TABLE route_steps          (FK → process_routes, processes)
Step  6    CREATE TABLE orders               (FK → customers, process_routes)
Step  7    CREATE TABLE order_nodes          (FK → orders, processes, departments)
Step  8    CREATE TABLE exception_events     (无 FK, 逻辑 → order_nodes)


Phase 2: Indexes
─────────────────────────────────────────────────
Step  9    idx_orders_status_created     ON orders (status, created_at DESC)
Step 10    idx_orders_customer           ON orders (customer_id)
Step 11    idx_orders_due_date           ON orders (due_date)
Step 12    idx_nodes_order_seq           ON order_nodes (order_id, seq)        ← 核心
Step 13    idx_nodes_dept_status         ON order_nodes (dept_id, status)
Step 14    idx_nodes_status              ON order_nodes (status)
Step 15    idx_steps_route_seq           ON route_steps (route_id, seq)
Step 16    idx_exceptions_node           ON exception_events (node_id)
Step 17    idx_exceptions_type_time      ON exception_events (type, created_at DESC)


Phase 3: RLS
─────────────────────────────────────────────────
Step 18    ALTER TABLE ... ENABLE ROW LEVEL SECURITY   × 8 tables
Step 19    CREATE POLICY "V1: full access" ... FOR ALL USING (true)  × 8 tables


Phase 4: Seed Data
─────────────────────────────────────────────────
Step 20    INSERT INTO departments (name, seq, type)
               ('制一', 1, 'production')
               ('制二', 2, 'production')
               ('制三', 3, 'production')
               ('制四', 4, 'production')
               ('总QC', 5, 'qc')
```

### 1.3 事务边界

| 策略 | 说明 |
|------|------|
| **整体事务** | Step 1-20 在单个 Migration 事务中执行。任一步失败 → 全部回滚 |
| **原子性保证** | Migration 文件默认包装在 `BEGIN; ... COMMIT;` 中 |
| **幂等性** | 所有语句使用 `IF NOT EXISTS` / `IF EXISTS` 确保可重复执行 |

---

## 二、Migration 风险检查

### 2.1 UUID Dependency

| 风险 | 等级 | 检查 |
|------|:----:|------|
| `gen_random_uuid()` 依赖 `pgcrypto` | 🟡 中 | Step 0 显式启用 |
| Supabase 默认已启用 | 🟢 低 | 但 `IF NOT EXISTS` 确保幂等 |
| UUID v4 碰撞 | 🟢 极低 | V1 数据量可忽略 |

**缓解：**
```sql
-- Migration 文件第一句
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 如果 pgcrypto 不可用（极罕见），Migration 会失败并回滚
-- 不会出现"表建了但 UUID 生成不了"的半完成状态
```

### 2.2 FK Dependency

| 风险 | 等级 | 检查 |
|------|:----:|------|
| 循环依赖导致无法建表 | 🟢 无 | §四已验证：8 表无循环依赖 |
| 建表顺序错误导致 FK 引用失败 | 🟡 中 | 严格按照执行序列 |
| 父表未建时子表先建 | 🔴 高 | 已在序列中消除——父表总是在子表之前 |

**验证矩阵：**

| 子表 | 引用的父表 | 父表 Step | 子表 Step | 顺序正确 |
|------|-----------|:--------:|:--------:|:----:|
| `route_steps` | `process_routes` | 4 | 5 | ✅ 4 < 5 |
| `route_steps` | `processes` | 3 | 5 | ✅ 3 < 5 |
| `orders` | `customers` | 2 | 6 | ✅ 2 < 6 |
| `orders` | `process_routes` | 4 | 6 | ✅ 4 < 6 |
| `order_nodes` | `orders` | 6 | 7 | ✅ 6 < 7 |
| `order_nodes` | `processes` | 3 | 7 | ✅ 3 < 7 |
| `order_nodes` | `departments` | 1 | 7 | ✅ 1 < 7 |
| `processes` | `departments` | 1 | 3 | ✅ 1 < 3 |

**全部 FK 引用的父表在子表之前创建。顺序安全。**

### 2.3 RLS Enable Order

| 风险 | 等级 | 检查 |
|------|:----:|------|
| RLS 在 Policy 之前启用 | 🟡 中 | 必须：先 `ENABLE RLS` → 再 `CREATE POLICY` |
| ENABLE 后无 Policy | 🔴 高 | 会导致所有访问被拒。Step 18 和 Step 19 必须在同一事务中 |
| Policy `USING (true)` 扩大访问 | 🟢 低 | V1 设计意图。V2 替换为角色条件 |

**缓解：**
```sql
-- 每个表：先 ENABLE，立即创建 Policy（同事务）
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "V1: full access" ON departments FOR ALL USING (true);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "V1: full access" ON customers FOR ALL USING (true);
-- ... 剩余 6 张表

-- 整个 Step 18+19 在一个事务中
-- 中间状态（ENABLE 但无 Policy）对外不可见
```

### 2.4 Seed Data Dependency

| 风险 | 等级 | 检查 |
|------|:----:|------|
| Seed Data INSERT 与 CHECK 冲突 | 🟢 低 | 已验证：`type IN ('production', 'qc')` 与预置值一致 |
| 预置数据被 FK 引用前未插入 | 🟢 无 | `departments` 是 Step 1，Seed 是 Step 20 |
| 重复执行 Migration 导致重复 INSERT | 🟡 中 | 使用 `ON CONFLICT DO NOTHING` 或手动检查 |

**缓解：**
```sql
-- 幂等 Seed INSERT
INSERT INTO departments (name, seq, type) VALUES
    ('制一', 1, 'production'),
    ('制二', 2, 'production'),
    ('制三', 3, 'production'),
    ('制四', 4, 'production'),
    ('总QC', 5, 'qc')
ON CONFLICT (id) DO NOTHING;
-- 注意：UUID 主键每次 gen_random_uuid() 不同，ON CONFLICT (id) 实际无效
-- 更安全的幂等方式：检查是否已有数据
-- 或使用 name 唯一约束
```

> **建议：** 在 Migration 文件中使用条件 INSERT：
> ```sql
> INSERT INTO departments (name, seq, type)
> SELECT * FROM (VALUES
>     ('制一', 1, 'production'),
>     ('制二', 2, 'production'),
>     ('制三', 3, 'production'),
>     ('制四', 4, 'production'),
>     ('总QC', 5, 'qc')
> ) AS v(name, seq, type)
> WHERE NOT EXISTS (SELECT 1 FROM departments LIMIT 1);
> ```

### 2.5 Rollback Strategy

| 场景 | 策略 |
|------|------|
| Migration 执行中失败 | 事务自动回滚。数据库回到 Migration 执行前状态 |
| Migration 成功后发现问题 | 创建新的 revert migration 文件（`002_revert_initial_schema.sql`），执行 `DROP TABLE ... CASCADE` |
| 生产环境回滚 | **V1 不推荐回滚。** 如有数据，先备份再操作 |

**Revert Migration（模板，Phase 1-B-2 产出）：**
```sql
-- 002_revert_initial_schema.sql
-- 仅用于开发环境重置。生产环境禁止执行。

DROP TABLE IF EXISTS exception_events CASCADE;
DROP TABLE IF EXISTS order_nodes CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS route_steps CASCADE;
DROP TABLE IF EXISTS process_routes CASCADE;
DROP TABLE IF EXISTS processes CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS departments CASCADE;

-- 清理 RLS Policy（表删除时自动清理）
-- 清理 Index（表删除时自动清理）
```

---

## 三、Migration 文件规划

### 3.1 文件清单

| # | 文件名 | 类型 | 说明 |
|:--|--------|------|------|
| 1 | `001_initial_schema.sql` | Forward | Phase 1-B-2 产出。完整建表脚本 |
| 2 | `002_revert_initial_schema.sql` | Revert | 开发环境重置用。生产禁止 |

### 3.2 001_initial_schema.sql 结构规划

```sql
-- ============================================================
-- DialFactory V1 · Migration 001: Initial Schema
-- Phase: 1-B-2
-- Based on: 01-Supabase-Schema-Plan.md (Frozen V1.0)
-- Date: 2026-08-06
-- ============================================================

-- ============================================================
-- Phase 0: Extension
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Phase 1: Tables (按 FK 依赖顺序)
-- ============================================================

-- Step 1: departments
CREATE TABLE departments (...)

-- Step 2: customers
CREATE TABLE customers (...)

-- Step 3: processes
CREATE TABLE processes (...)

-- Step 4: process_routes
CREATE TABLE process_routes (...)

-- Step 5: route_steps
CREATE TABLE route_steps (...)

-- Step 6: orders
CREATE TABLE orders (...)

-- Step 7: order_nodes
CREATE TABLE order_nodes (...)

-- Step 8: exception_events
CREATE TABLE exception_events (...)

-- ============================================================
-- Phase 2: Indexes
-- ============================================================
CREATE INDEX idx_orders_status_created ...
CREATE INDEX idx_orders_customer ...
CREATE INDEX idx_orders_due_date ...
CREATE INDEX idx_nodes_order_seq ...
CREATE INDEX idx_nodes_dept_status ...
CREATE INDEX idx_nodes_status ...
CREATE INDEX idx_steps_route_seq ...
CREATE INDEX idx_exceptions_node ...
CREATE INDEX idx_exceptions_type_time ...

-- ============================================================
-- Phase 3: RLS
-- ============================================================
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "V1: full access" ON departments FOR ALL USING (true);
-- ... × 8 tables

-- ============================================================
-- Phase 4: Seed Data
-- ============================================================
INSERT INTO departments (name, seq, type) ...
```

### 3.3 DDL 来源

所有 DDL 语句**逐字复制**自 [01-Supabase-Schema-Plan.md](01-Supabase-Schema-Plan.md) §十一「完整 DDL 汇总」。禁止改写、优化、调整。

| 内容 | 来源 SP 行 | 说明 |
|------|:--------:|------|
| 8 张表 CREATE TABLE | 738-839 | 逐字复制，含 CHECK、FK ON DELETE |
| 9 条索引 CREATE INDEX | 846-860 | 逐字复制 |
| 8 条 RLS ENABLE | 866-873 | 逐字复制 |
| 8 条 RLS POLICY | 876-883 | 逐字复制 |
| 1 条 Seed INSERT | 889-894 | 增加幂等条件 |

---

## 四、Migration 后验证计划

### 4.1 验证 SQL（Phase 1-B-3 执行）

```sql
-- V1: 验证所有表已创建
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('departments','customers','processes','process_routes',
                     'route_steps','orders','order_nodes','exception_events');
-- 预期：8 rows

-- V2: 验证所有索引已创建
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%';
-- 预期：9 rows

-- V3: 验证 RLS 已启用
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('departments','customers','processes','process_routes',
                    'route_steps','orders','order_nodes','exception_events');
-- 预期：8 rows, rowsecurity = true

-- V4: 验证 Policy 已创建
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public';
-- 预期：8 rows, policyname = 'V1: full access'

-- V5: 验证 Seed Data
SELECT * FROM departments ORDER BY seq;
-- 预期：5 rows

-- V6: 验证 FK 保护（应报错）
DELETE FROM departments WHERE name = '制一';
-- 预期：ERROR — foreign key constraint violation (processes.default_dept_id)

-- V7: 验证无 CASCADE（应报错）
-- (需要有测试数据才能验证，V6 已间接证明 RESTRICT 生效)

-- V8: 验证 UUID 生成
INSERT INTO customers (name) VALUES ('__test__') RETURNING id;
-- 预期：返回 UUID v4 格式
-- 然后清理：DELETE FROM customers WHERE name = '__test__';
```

### 4.2 验证阶段

| Phase | 内容 | 产出 |
|-------|------|------|
| Phase 1-B-2 | 执行 Migration | `001_initial_schema.sql` |
| Phase 1-B-3 | 验证 Migration | 验证报告 + 验证 SQL 结果 |

---

## 五、Freeze 合规声明

### 5.1 本 Migration Plan 不改变

| 冻结项 | 状态 |
|--------|:----:|
| 表数量 (8) | ✅ 不变 |
| 字段定义 (58) | ✅ 不变 |
| FK 关系 (10) | ✅ 不变 |
| FK ON DELETE 策略 (0 CASCADE) | ✅ 不变 |
| CHECK 约束 | ✅ 不变 |
| UNIQUE 约束 | ✅ 不变 |
| Index 定义 (9) | ✅ 不变 |
| RLS 策略 (USING true) | ✅ 不变 |
| Seed Data (5 departments) | ✅ 不变 |
| ADL-001/002/003 | ✅ 不变 |
| ADP-001~005 | ✅ 不变 |

### 5.2 变更记录

本阶段无 Schema 变更。Migration 文件是 Schema Plan §十一 的逐字转录。

---

## 六、产出物

| # | 文件 | Phase | 状态 |
|:--|------|:-----:|:----:|
| 1 | `05-Supabase-Environment-Checklist.md` | 1-B-0 | ✅ Decisions Confirmed |
| 2 | `06-Migration-Plan.md`（本文件） | 1-B-1 | ✅ Planning Complete |
| 3 | `supabase/migrations/001_initial_schema.sql` | 1-B-2 | ⬜ 等待生成 |
| 4 | `supabase/migrations/002_revert_initial_schema.sql` | 1-B-2 | ⬜ 等待生成 |

---

## 七、Phase 1-B-1 完成条件

- [x] Migration 执行顺序已定义（5 Phase / 20 Step）
- [x] UUID 依赖检查通过
- [x] FK 依赖检查通过（8 对全部父表在前）
- [x] RLS 启用顺序检查通过
- [x] Policy 创建顺序检查通过
- [x] Seed Data 依赖检查通过
- [x] Rollback 策略已定义
- [x] 验证 SQL 已准备
- [x] Freeze 合规声明已确认
- [x] 001_initial_schema.sql 结构规划已定义

### 下一阶段

**Phase 1-B-2: Migration SQL 生成**

- 产出：`supabase/migrations/001_initial_schema.sql`
- 产出：`supabase/migrations/002_revert_initial_schema.sql`
- 原则：逐字复制 Schema Plan §十一 DDL。禁止改写。

---

> **Phase 1-B-1 完成。Migration Plan 已就绪。本文件不包含可执行 SQL——DDL 生成由 Phase 1-B-2 执行。**
