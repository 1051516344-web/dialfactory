# DialFactory Phase 1-B-3 · Migration Validation Report

> **状态：** Validation Complete
> **验证对象：** `supabase/migrations/001_initial_schema.sql`
> **验证基准：** [DialFactory-V1-Freeze.md](../../docs/FREEZE/DialFactory-V1-Freeze.md) + [01-Supabase-Schema-Plan.md](01-Supabase-Schema-Plan.md) §十一
> **日期：** 2026-08-06
> **原则：** 只验证，不修改。发现问题 → Issue Report → 等待 Change Proposal。

---

## 最终判定

```
╔══════════════════════════════════════════╗
║                                          ║
║   Migration Validation:   PASS           ║
║   Freeze Compliance:      PASS           ║
║   Deployment Ready:       YES            ║
║                                          ║
╚══════════════════════════════════════════╝
```

---

## 一、Migration 文件完整性

### 1.1 Extension

| 检查项 | 预期 | 实际 | 结果 |
|--------|------|------|:----:|
| pgcrypto 启用 | `CREATE EXTENSION IF NOT EXISTS pgcrypto` | 行 26：完全匹配 | ✅ |
| 执行位置 | Migration 首条语句 | Phase 0，在所有 DDL 之前 | ✅ |
| 幂等性 | `IF NOT EXISTS` | 已包含 | ✅ |

> **PASS**

### 1.2 Table Count

| # | 预期表名 | SQL 中存在 | 行号 | 结果 |
|:--|---------|:--------:|:----:|:----:|
| 1 | `departments` | ✅ | 36 | ✅ |
| 2 | `customers` | ✅ | 48 | ✅ |
| 3 | `processes` | ✅ | 59 | ✅ |
| 4 | `process_routes` | ✅ | 74 | ✅ |
| 5 | `route_steps` | ✅ | 84 | ✅ |
| 6 | `orders` | ✅ | 95 | ✅ |
| 7 | `order_nodes` | ✅ | 118 | ✅ |
| 8 | `exception_events` | ✅ | 144 | ✅ |

**Table Count: 8 / 8** ✅

> **PASS**

### 1.3 建表顺序

| 顺序 | 表名 | 依赖 | 验证 |
|:----:|------|------|:----:|
| 1 | `departments` | 无 | ✅ 最先创建 |
| 2 | `customers` | 无 | ✅ |
| 3 | `processes` | `departments` | ✅ departments 在前 |
| 4 | `process_routes` | 无 | ✅ |
| 5 | `route_steps` | `process_routes`, `processes` | ✅ 父表均在前 |
| 6 | `orders` | `customers`, `process_routes` | ✅ 父表均在前 |
| 7 | `order_nodes` | `orders`, `processes`, `departments` | ✅ 父表均在前 |
| 8 | `exception_events` | 无 FK | ✅ |

**FK 依赖顺序：全部正确。父表均在子表之前创建。** ✅

---

## 二、Schema Freeze Compliance

### 2.1 Field Count

按 Schema Plan 计数方法（不含 `id` PK）：

| 表 | Business | System | Reserved | 合计 (SP) | SQL 实际 | 偏差 |
|----|:-------:|:------:|:--------:|:--------:|:------:|:----:|
| `departments` | 3 | 1 | 0 | 4 | 4 | 0 |
| `customers` | 3 | 1 | 0 | 4 | 4 | 0 |
| `processes` | 6 | 1 | 0 | 7 | 7 | 0 |
| `process_routes` | 2 | 1 | 0 | 3 | 3 | 0 |
| `route_steps` | 3 | 0 | 0 | 3 | 3 | 0 |
| `orders` | 11 | 2 | 2 | 15 | 15 | 0 |
| `order_nodes` | 12 | 2 | 3 | 17 | 17 | 0 |
| `exception_events` | 4 | 1 | 0 | 5 | 5 | 0 |
| **总计** | **44** | **9** | **5** | **58** | **58** | **0** |

**Field Count: 58 / 58 — 零偏差** ✅

> 注：计数方法排除 `id` PRIMARY KEY（每个表 1 个），与 [01-Supabase-Schema-Plan.md](01-Supabase-Schema-Plan.md) §十二一致。

### 2.2 PK Validation

| 表 | PK 声明 | 匹配 `UUID PRIMARY KEY DEFAULT gen_random_uuid()` |
|----|---------|:----:|
| `departments` | 行 37 | ✅ |
| `customers` | 行 49 | ✅ |
| `processes` | 行 60 | ✅ |
| `process_routes` | 行 75 | ✅ |
| `route_steps` | 行 85 | ✅ |
| `orders` | 行 96 | ✅ |
| `order_nodes` | 行 119 | ✅ |
| `exception_events` | 行 145 | ✅ |

**8 / 8 全部使用 UUID + gen_random_uuid()** ✅

> **PASS**

---

## 三、Foreign Key Validation

### 3.1 FK Matrix

| # | Child Table | Column | Parent Table | ON DELETE | SQL 行 | Result |
|:--|------------|--------|-------------|-----------|:-----:|:----:|
| FK1 | `processes` | `default_dept_id` | `departments` | **RESTRICT** | 65 | ✅ |
| FK2 | `route_steps` | `route_id` | `process_routes` | **RESTRICT** | 86 | ✅ |
| FK3 | `route_steps` | `process_id` | `processes` | **RESTRICT** | 87 | ✅ |
| FK4 | `orders` | `customer_id` | `customers` | **RESTRICT** | 98 | ✅ |
| FK5 | `orders` | `route_id` | `process_routes` | **RESTRICT** | 104 | ✅ |
| FK6 | `orders` | `second_route_id` | `process_routes` | **SET NULL** | 106 | ✅ |
| FK7 | `order_nodes` | `order_id` | `orders` | **RESTRICT** | 120 | ✅ |
| FK8 | `order_nodes` | `process_id` | `processes` | **SET NULL** | 121 | ✅ |
| FK9 | `order_nodes` | `dept_id` | `departments` | **SET NULL** | 124 | ✅ |
| — | `exception_events` | `node_id` | — | **NO FK** | 146 | ✅ |

### 3.2 FK 统计

| ON DELETE | 预期 | 实际 | 偏差 |
|-----------|:----:|:----:|:----:|
| `RESTRICT` | 6 | **6** | 0 |
| `SET NULL` | 3 | **3** | 0 |
| `NO FK` | 1 | **1** | 0 |
| `CASCADE` | **0** | **0** | 0 |

### 3.3 CRIT-001 重点验证

| 检查项 | SQL 证据 | 结果 |
|--------|---------|:----:|
| `order_nodes.order_id` ON DELETE | 行 120：`REFERENCES orders(id) ON DELETE RESTRICT` | ✅ |
| 不是 CASCADE | grep 全文：`ON DELETE CASCADE` 出现 **0** 次 | ✅ |

### 3.4 exception_events.node_id

| 检查项 | SQL 证据 | 结果 |
|--------|---------|:----:|
| 无 REFERENCES 子句 | 行 146：`node_id UUID NOT NULL` — 无 FK 声明 | ✅ |
| 注释说明原因 | 行 142：`NO FOREIGN KEY by design — 节点删除后异常记录保留` | ✅ |

> **PASS — FK Matrix 与 Freeze 完全一致。6 RESTRICT · 3 SET NULL · 1 NO FK · 0 CASCADE。**

---

## 四、Index Validation

### 4.1 Index Matrix

| # | Index Name | Table | Columns | SQL 行 | 核心？ | Result |
|:--|-----------|------|---------|:-----:|:-----:|:----:|
| 1 | `idx_orders_status_created` | `orders` | `(status, created_at DESC)` | 159 | | ✅ |
| 2 | `idx_orders_customer` | `orders` | `(customer_id)` | 160 | | ✅ |
| 3 | `idx_orders_due_date` | `orders` | `(due_date)` | 161 | | ✅ |
| 4 | `idx_nodes_order_seq` | `order_nodes` | `(order_id, seq)` | 164 | ⭐ | ✅ |
| 5 | `idx_nodes_dept_status` | `order_nodes` | `(dept_id, status)` | 165 | | ✅ |
| 6 | `idx_nodes_status` | `order_nodes` | `(status)` | 166 | | ✅ |
| 7 | `idx_steps_route_seq` | `route_steps` | `(route_id, seq)` | 169 | | ✅ |
| 8 | `idx_exceptions_node` | `exception_events` | `(node_id)` | 172 | | ✅ |
| 9 | `idx_exceptions_type_time` | `exception_events` | `(type, created_at DESC)` | 173 | | ✅ |

**Index Count: 9 / 9** ✅

### 4.2 核心索引验证

| 检查项 | SQL 证据 | 结果 |
|--------|---------|:----:|
| `idx_nodes_order_seq` 存在 | 行 164：`ON order_nodes (order_id, seq)` | ✅ |
| 覆盖流程图渲染 | `(order_id, seq)` 同时覆盖 WHERE order_id + ORDER BY seq | ✅ |

> **PASS**

---

## 五、RLS Validation

### 5.1 ENABLE ROW LEVEL SECURITY

| # | 表 | SQL 行 | Result |
|:--|-----|:-----:|:----:|
| 1 | `departments` | 181 | ✅ |
| 2 | `customers` | 182 | ✅ |
| 3 | `processes` | 183 | ✅ |
| 4 | `process_routes` | 184 | ✅ |
| 5 | `route_steps` | 185 | ✅ |
| 6 | `orders` | 186 | ✅ |
| 7 | `order_nodes` | 187 | ✅ |
| 8 | `exception_events` | 188 | ✅ |

**ENABLE Count: 8 / 8** ✅

### 5.2 CREATE POLICY

| # | 表 | Policy Name | Using | SQL 行 | Result |
|:--|-----|-------------|-------|:-----:|:----:|
| 1 | `departments` | `V1: full access` | `USING (true)` | 192 | ✅ |
| 2 | `customers` | `V1: full access` | `USING (true)` | 193 | ✅ |
| 3 | `processes` | `V1: full access` | `USING (true)` | 194 | ✅ |
| 4 | `process_routes` | `V1: full access` | `USING (true)` | 195 | ✅ |
| 5 | `route_steps` | `V1: full access` | `USING (true)` | 196 | ✅ |
| 6 | `orders` | `V1: full access` | `USING (true)` | 197 | ✅ |
| 7 | `order_nodes` | `V1: full access` | `USING (true)` | 198 | ✅ |
| 8 | `exception_events` | `V1: full access` | `USING (true)` | 199 | ✅ |

**POLICY Count: 8 / 8** ✅

### 5.3 RLS 顺序验证

| 检查项 | 结果 |
|--------|:----:|
| ENABLE 在 POLICY 之前 | ✅ 行 181-188 (ENABLE) → 行 192-199 (POLICY) |
| 同一事务中 | ✅ 整个 Migration 为单个事务 |
| ENABLE 和 POLICY 数量一致 | ✅ 8 = 8 |

> **PASS — RLS: 8 ENABLE + 8 POLICY。全部 USING (true)。**

---

## 六、Seed Data Validation

### 6.1 预置数据内容

| # | name | seq | type | SQL 行 | Result |
|:--|------|:---:|------|:-----:|:----:|
| 1 | `制一` | 1 | `production` | 209 | ✅ |
| 2 | `制二` | 2 | `production` | 210 | ✅ |
| 3 | `制三` | 3 | `production` | 211 | ✅ |
| 4 | `制四` | 4 | `production` | 212 | ✅ |
| 5 | `总QC` | 5 | `qc` | 213 | ✅ |

**Seed Count: 5 / 5** ✅

### 6.2 幂等性验证

| 检查项 | SQL 证据 | 结果 |
|--------|---------|:----:|
| 条件插入 | 行 215：`WHERE NOT EXISTS (SELECT 1 FROM departments LIMIT 1)` | ✅ |
| 重复执行行为 | 表有数据 → 不插入新行 | ✅ |
| 不会因重复执行报错 | 无 UNIQUE 冲突（name 无 UNIQUE 约束） | ✅ |
| 不会产生重复数据 | LIMIT 1 子查询确保只有空表时才插入 | ✅ |

**Seed 幂等：确认。重复执行 Migration 不会产生重复数据。** ✅

> **PASS**

---

## 七、ADL Compliance Verification

### 7.1 ADL-001 · 路线模板 ≠ 生产路线

| 检查项 | SQL 证据 | 结果 |
|--------|---------|:----:|
| `orders.route_snapshot` JSONB 存在 | 行 105：`route_snapshot JSONB DEFAULT '{}'` | ✅ |
| `processes.is_required` 存在 | 行 66：`is_required BOOLEAN DEFAULT false` | ✅ |
| 无强制展开逻辑 | DDL 层面无触发器/存储过程强制生成节点 | ✅ |

### 7.2 ADL-002 · 返工由人工决策

| 检查项 | SQL 证据 | 结果 |
|--------|---------|:----:|
| `processes` 表无 `rework_strategy` | 行 59-69：6 个业务字段，无 rework_strategy | ✅ |
| `order_nodes.rework_pass` 存在 | 行 129：`rework_pass INTEGER DEFAULT 0` | ✅ |
| 语义正确 | DEFAULT 0 = 正常，递增 = 返工 | ✅ |

### 7.3 ADL-003 · 节点四态模型

| 检查项 | SQL 证据 | 结果 |
|--------|---------|:----:|
| `order_nodes.status` CHECK 四态 | 行 127：`CHECK (status IN ('waiting', 'active', 'done', 'paused'))` | ✅ |
| 无 `handing_off` | grep 全文：`handing_off` 出现 **0** 次 | ✅ |
| `orders.status` CHECK 三态 | 行 109：`CHECK (status IN ('in_production', 'paused', 'completed'))` | ✅ |

**ADL-001/002/003：全部合规，零违反。** ✅

---

## 八、禁止事项检查

| # | 禁止项 | SQL 检查 | 结果 |
|:--|--------|---------|:----:|
| 1 | 新增表 | 8 张表，与 Freeze 一致 | ✅ 无新增 |
| 2 | 新增字段 | 58 字段（不含 id PK），与 SP §十二一致 | ✅ 无新增 |
| 3 | 修改 FK Policy | 6 RESTRICT + 3 SET NULL + 1 NO FK + 0 CASCADE | ✅ 无修改 |
| 4 | 修改 ADL-001 | route_snapshot + is_required | ✅ 无修改 |
| 5 | 修改 ADL-002 | 无 rework_strategy | ✅ 无修改 |
| 6 | 修改 ADL-003 | 四态，无 handing_off | ✅ 无修改 |
| 7 | 修改 ADP-001~005 | 无 order_variants / materials / DAG / inventory | ✅ 无修改 |
| 8 | 新增业务逻辑字段 | 所有字段与 SP §十一完全一致 | ✅ 无新增 |

> **PASS — 零禁止项违反。**

---

## 九、SQL 与 Schema Plan 逐项比对

| SP §十一 内容 | SQL 中是否存在 | 偏差 |
|---------------|:------------:|:----:|
| Phase 0: pgcrypto Extension | ✅ 行 26 | 无 |
| Phase 1: 8 CREATE TABLE | ✅ 行 36-151 | 无 |
| Phase 2: 9 CREATE INDEX | ✅ 行 159-173 | 无 |
| Phase 3: 8 ALTER TABLE ENABLE RLS | ✅ 行 181-188 | 无 |
| Phase 3: 8 CREATE POLICY | ✅ 行 192-199 | 无 |
| Phase 4: Seed INSERT | ✅ 行 207-215 | 仅增加幂等条件 |
| FK ON DELETE 声明 | ✅ 全部 9 条显式声明 | 无 |
| CHECK 约束 | ✅ 全部保留 | 无 |
| UNIQUE 约束 | ✅ 全部保留 | 无 |

**唯一差异：** Seed INSERT 从纯 `INSERT ... VALUES` 改为 `INSERT ... SELECT WHERE NOT EXISTS`。这是**幂等性增强**，不改变插入的数据内容。符合「Seed 必须幂等」的 Phase 1-B-2 要求。

---

## 十、最终判定

```
╔══════════════════════════════════════════╗
║                                          ║
║   Migration Validation:   ✅ PASS        ║
║   Freeze Compliance:      ✅ PASS        ║
║   Deployment Ready:       ✅ YES         ║
║                                          ║
╠══════════════════════════════════════════╣
║                                          ║
║   Tables:     8 / 8    ✅               ║
║   Fields:    58 / 58   ✅               ║
║   PK UUID:    8 / 8    ✅               ║
║   FK Matrix:  10 / 10  ✅               ║
║   Indexes:     9 / 9   ✅               ║
║   RLS ENABLE:  8 / 8   ✅               ║
║   RLS POLICY:  8 / 8   ✅               ║
║   Seed Data:   5 / 5   ✅               ║
║   CASCADE:     0       ✅               ║
║   ADL 违反:    0       ✅               ║
║   禁止项违反:   0       ✅               ║
║                                          ║
╚══════════════════════════════════════════╝
```

### 核心风险点确认（上一轮 Review 关注的 5 项）

| # | 风险点 | 状态 |
|:--|--------|:----:|
| 1 | FK 0 CASCADE | ✅ 6 RESTRICT · 3 SET NULL · 1 NO FK |
| 2 | `order_nodes.order_id` ON DELETE RESTRICT | ✅ 行 120 |
| 3 | RLS 8 Policies | ✅ 行 192-199 |
| 4 | Seed 幂等 | ✅ 条件 INSERT |
| 5 | `exception_events.node_id` 无 FK | ✅ 行 146，注释说明 |

---

## 十一、Phase 1-B-3 完成条件

- [x] Extension 验证通过
- [x] 8 Tables 全部存在，顺序正确
- [x] 58 Fields 无偏差
- [x] 8 UUID PK 全部正确
- [x] FK Matrix 0 CASCADE
- [x] CRIT-001 修复已确认
- [x] 9 Indexes 全部存在
- [x] 8 RLS ENABLE + 8 RLS POLICY
- [x] 5 Seed Data 幂等
- [x] ADL-001/002/003 零违反
- [x] ADP-001~005 零违反
- [x] 禁止事项零违反

### 下一阶段

**Phase 1-B-4: Deployment Approval**

- 人工确认本 Validation Report
- 确认 Supabase Project 已创建（`ap-southeast-1`）
- 批准 `001_initial_schema.sql` 执行

---

> **Migration 001_initial_schema.sql 已通过全部 44 项验证。Ready for Deployment Approval。**
