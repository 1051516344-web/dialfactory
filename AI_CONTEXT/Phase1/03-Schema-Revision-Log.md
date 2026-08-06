# DialFactory Phase 1-A · Schema Revision Log

> **状态：** Revision Completed
> **输入：** [02-Schema-Review-Report.md](02-Schema-Review-Report.md) — Final Verdict: Need Revision
> **输出：** [01-Supabase-Schema-Plan.md](01-Supabase-Schema-Plan.md) — 已修订
> **日期：** 2026-08-06
> **原则：** 不修改业务模型、不新增实体、不改变 V1 表结构

---

## 修改清单

### R-001 · CRIT-001 — order_nodes FK 生产数据保护

| 维度 | 内容 |
|------|------|
| **Review ID** | CRIT-001 |
| **严重度** | Critical |
| **修改位置** | §四 FK 清单 + §四 FK 设计原则 + §十一 DDL 行 811 |
| **修改前** | `order_nodes.order_id → orders` `ON DELETE CASCADE` |
| **修改后** | `order_nodes.order_id → orders` `ON DELETE RESTRICT` |
| **修改原因** | order_nodes 是核心生产追踪数据（真实生产轨迹）。CASCADE 导致删订单时静默灭失全部生产数据，违反「事件日志追加式存储，不可逆事实」原则和用户「禁止生产数据级联删除」指令 |
| **影响 DDL** | ✅ 是 — `ON DELETE CASCADE` → `ON DELETE RESTRICT` |
| **配套策略** | V1 推荐软删除（`orders.status = 'cancelled'`）。确需物理删除时，应用层先显式处理 exception_events → order_nodes → orders，三步操作无隐式级联 |

**修订处：**

1. §四 FK 清单表 — 行 `order_nodes` / `order_id` / `orders`：`CASCADE` → `RESTRICT`，理由更新为「生产数据保护」
2. §四 FK 设计原则 — 删除「级联清理」原则，新增「生产数据保护」原则
3. §十一 DDL — `order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE` → `ON DELETE RESTRICT`

---

### R-002 · WARN-004 — route_steps FK 模板数据保护

| 维度 | 内容 |
|------|------|
| **Review ID** | WARN-004 |
| **严重度** | Warning |
| **修改位置** | §四 FK 清单 + §十一 DDL 行 781 |
| **修改前** | `route_steps.route_id → process_routes` `ON DELETE CASCADE` |
| **修改后** | `route_steps.route_id → process_routes` `ON DELETE RESTRICT` |
| **修改原因** | 统一 FK 策略：所有被业务表引用的主数据均使用 RESTRICT。路线被订单引用（FK2）已有 RESTRICT 保护，步骤表作为路线子表应保持一致。避免路线被误删时模板数据静默丢失 |
| **影响 DDL** | ✅ 是 — `ON DELETE CASCADE` → `ON DELETE RESTRICT` |

**修订处：**

1. §四 FK 清单表 — 行 `route_steps` / `route_id` / `process_routes`：`CASCADE` → `RESTRICT`
2. §十一 DDL — `route_id UUID NOT NULL REFERENCES process_routes(id) ON DELETE CASCADE` → `ON DELETE RESTRICT`

---

### R-003 · WARN-003 — processes FK 显式声明

| 维度 | 内容 |
|------|------|
| **Review ID** | WARN-003 |
| **严重度** | Warning |
| **修改位置** | §十一 DDL 行 764 |
| **修改前** | `default_dept_id UUID REFERENCES departments(id)` — 无显式 ON DELETE |
| **修改后** | `default_dept_id UUID REFERENCES departments(id) ON DELETE RESTRICT` |
| **修改原因** | §四 FK 设计表明确指定此 FK 为 RESTRICT，但 DDL 未显式声明。PostgreSQL 默认 NO ACTION 行为接近 RESTRICT 但检查时机不同。显式声明消除歧义，与设计意图一致 |
| **影响 DDL** | ✅ 是 — 增加 `ON DELETE RESTRICT` 显式声明 |

**修订处：**

1. §十一 DDL — `REFERENCES departments(id)` → `REFERENCES departments(id) ON DELETE RESTRICT`

---

### R-004 · WARN-002 — sand_type 成熟度更正

| 维度 | 内容 |
|------|------|
| **Review ID** | WARN-002 |
| **严重度** | Warning |
| **修改位置** | §二.6 orders 字段映射表 — `sand_type` 行 |
| **修改前** | 成熟度标注 `L2`，说明「喷砂类型：重砂/轻砂/中砂/-」 |
| **修改后** | 成熟度标注 `L3`，说明「喷砂类型：重砂/轻砂/中砂/-。工厂语言库零出现，待 Phase 0-B 验证是否必要」 |
| **修改原因** | 与 [03-Field-Maturity-Rating.md](03-Field-Maturity-Rating.md) §3.1 O08 评级不一致。FM 依据：「工厂语言库完全未出现喷砂术语。可能工厂不用喷砂，或用其他术语描述」。L3 策略：DEFAULT NULL，V1 前端隐藏 |
| **影响 DDL** | ❌ 否 — 字段定义未变（`TEXT` 可空），仅文档标注修正 |

**修订处：**

1. §二.6 表格 — `sand_type` 行：成熟度 `L2` → `L3`，说明文本扩展

---

### R-005 · WARN-001 — customers V1 策略说明补充

| 维度 | 内容 |
|------|------|
| **Review ID** | WARN-001 |
| **严重度** | Warning |
| **修改位置** | §二.2 customers DDL 块之后 |
| **修改前** | 无策略说明 |
| **修改后** | 新增策略说明块，明确 V1 前端策略：允许临时客户文本输入；`orders.customer_id` 允许 NULL；不阻塞 V1 核心流转 |
| **修改原因** | `customers.name NOT NULL` 与 FM L3 评级（零工厂数据）存在张力。补充策略说明以避免误解——NOT NULL 约束不变，但通过前端过渡方案解决初期数据缺失问题。对应 Phase 0-A.3 Proposal-002 |
| **影响 DDL** | ❌ 否 — 仅文档补充，DDL 不变 |

**修订处：**

1. §二.2 — DDL 代码块后新增 `> **V1 策略说明**` 引用块

---

## 修订统计

| 类别 | 数量 | DDL 影响 |
|------|:----:|:--------:|
| Critical 修复 | 1 | ✅ 1 行 |
| Warning 修复 | 4 | ✅ 2 行 + ❌ 2 文档 |
| **总计** | **5** | **3 行 DDL 变更** |

## DDL 变更汇总

```sql
-- R-001 (CRIT-001): order_nodes FK 生产数据保护
-- 修改前: REFERENCES orders(id) ON DELETE CASCADE
-- 修改后:
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,

-- R-002 (WARN-004): route_steps FK 模板数据保护
-- 修改前: REFERENCES process_routes(id) ON DELETE CASCADE
-- 修改后:
    route_id UUID NOT NULL REFERENCES process_routes(id) ON DELETE RESTRICT,

-- R-003 (WARN-003): processes FK 显式声明
-- 修改前: REFERENCES departments(id)
-- 修改后:
    default_dept_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
```

## 未修改项

| Review ID | 处理方式 | 原因 |
|-----------|---------|------|
| INFO-001~006 | 无需修改 | SP 正确纠正了 SC 的字段遗漏，非 SP 的问题 |

## 修订后 FK 矩阵

| 子表 | 字段 | 父表 | ON DELETE | 性质 |
|------|------|------|-----------|------|
| `orders` | `customer_id` | `customers` | `RESTRICT` | 主数据保护 |
| `orders` | `route_id` | `process_routes` | `RESTRICT` | 主数据保护 |
| `orders` | `second_route_id` | `process_routes` | `SET NULL` | 预留字段 |
| `processes` | `default_dept_id` | `departments` | `RESTRICT` | 主数据保护 |
| `route_steps` | `route_id` | `process_routes` | `RESTRICT` | 模板数据保护 |
| `route_steps` | `process_id` | `processes` | `RESTRICT` | 主数据保护 |
| `order_nodes` | `order_id` | `orders` | `RESTRICT` | **生产数据保护** |
| `order_nodes` | `process_id` | `processes` | `SET NULL` | 快照容错 |
| `order_nodes` | `dept_id` | `departments` | `SET NULL` | 快照容错 |
| `exception_events` | `node_id` | — | 无 FK | 独立保留 |

**全部 FK 中：** 6 条 `RESTRICT` + 3 条 `SET NULL` + 1 条无 FK。**零 CASCADE。**

---

## 修订验证

| 检查项 | 状态 |
|--------|:----:|
| 未新增实体（表） | ✅ |
| 未修改 V1 表结构（列数/列名/类型） | ✅ |
| 未改变 ADP-001~005 决策 | ✅ |
| 未改变 ADL-001~003 决策 | ✅ |
| 未修改 Business Model | ✅ |
| 未执行 SQL | ✅ |
| CRIT-001 已修复 | ✅ |
| WARN-001~004 已处理 | ✅ |

---

> **下一阶段入口：** [01-Supabase-Schema-Plan.md](01-Supabase-Schema-Plan.md) 状态已更新为「Revision Completed — 等待重新 Review」。重新 Review 通过后可进入 Phase 1-B Supabase 建表。
