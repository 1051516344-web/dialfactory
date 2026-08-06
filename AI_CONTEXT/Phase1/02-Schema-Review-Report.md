# DialFactory Phase 1-A · Schema Review Report

> **状态：** Need Revision（1 Critical）
> **审查对象：** [01-Supabase-Schema-Plan.md](01-Supabase-Schema-Plan.md)
> **审查基准：** [10-Business-Model-V1.md](../10-Business-Model-V1.md) · [9-V1-Scope-Definition.md](../9-V1-Scope-Definition.md) §5.3 · [03-Field-Maturity-Rating.md](03-Field-Maturity-Rating.md) · [00_PROJECT_STATUS_FREEZE.md](../../00_PROJECT_STATUS_FREEZE.md) ADP-001~005
> **审查日期：** 2026-08-06
> **原则：** 不修改原文档，仅输出审查意见

---

## 执行摘要

| 维度 | 结果 | Critical | Warning | Info |
|------|------|:--------:|:-------:|:----:|
| 字段变化审计 | ⚠️ 通过 | 0 | 2 | 7 |
| 外键风险审核 | 🔴 不通过 | **1** | 2 | 0 |
| L3 字段审核 | ⚠️ 通过 | 0 | 2 | 0 |
| ADP 一致性检查 | ✅ 通过 | 0 | 0 | 0 |

**最终状态：Need Revision**

> **阻塞项：** CRIT-001（order_nodes ON DELETE CASCADE）必须在 Phase 1-B DDL 执行前修复。其余 Warning 建议修复但不阻塞推进。

---

## 一、字段变化审计

### 1.1 审计方法

以 [10-Business-Model-V1.md](../10-Business-Model-V1.md) §第四部分「V1 数据模型边界」为字段基准，逐表对比四个来源：

| 缩写 | 文档 | 角色 |
|------|------|------|
| **BM** | 10-Business-Model-V1.md §第四部分 | 冻结业务模型（权威字段清单） |
| **SC** | 9-V1-Scope-Definition.md §5.3 DDL | V1 Scope DDL（中间产物） |
| **FM** | 03-Field-Maturity-Rating.md | 字段成熟度 L1/L2/L3 评级 |
| **SP** | 01-Supabase-Schema-Plan.md §十一 DDL | 当前审查对象 |

### 1.2 逐表 Field Change Log

#### 1.2.1 departments

| 字段 | BM | SC | SP | FM | 判定 |
|------|:--:|:--:|:--:|:--:|------|
| `name` | ✅ | ✅ | ✅ NOT NULL | L1 | ✅ 一致 |
| `seq` | ✅ | ✅ | ✅ NOT NULL | L1 | ✅ 一致 |
| `type` | ✅ | ❌ 缺失 | ✅ NOT NULL DEFAULT 'production' | L2 | **INFO-001** |
| `created_at` | — | — | ✅ | — | ✅ 系统字段 |

> **INFO-001：** SC 的 DDL 遗漏了 `type` 字段（仅含 name + seq），但 BM 明确要求 `type`（生产/检验）。SP 正确恢复了此字段。FM 对 `type` 评 L2（总QC 是否独立部门存疑），SP 的 CHECK `('production', 'qc')` 设计合理。

#### 1.2.2 customers

| 字段 | BM | SC | SP | FM | 判定 |
|------|:--:|:--:|:--:|:--:|------|
| `name` | ✅ | ✅ | ✅ NOT NULL | **L3** | **WARN-001** |
| `code` | ✅ | ✅ | ✅ 可空 | L3 | ✅ 一致 |
| `is_active` | ✅ | ❌ 缺失 | ✅ DEFAULT true | L2 | **INFO-002** |
| `created_at` | — | — | ✅ | — | ✅ 系统字段 |

> **INFO-002：** SC 的 DDL 遗漏了 `is_active`，SP 正确恢复。
>
> **WARN-001：** `name` 约束为 `NOT NULL` 但 FM 评级 L3（工厂语言库 30 条术语零客户名称，17 家客户无一被实际数据证实）。矛盾在于：BM 要求 `name` 必填（业务上合理——订单必须有客户），但 V1 初期无客户数据可填。不影响 DDL 建表，但影响 V1 前端策略：订单创建时应允许自由文本输入客户名，不强制外键下拉选择。

#### 1.2.3 processes

| 字段 | BM | SC | SP | FM | 判定 |
|------|:--:|:--:|:--:|:--:|------|
| `code` | ✅ | ✅ | ✅ NOT NULL UNIQUE | L2 | ✅ 一致 |
| `name` | ✅ | ✅ | ✅ NOT NULL | L2 | ✅ 一致 |
| `type` | ✅ | ✅ | ✅ NOT NULL DEFAULT '加工' | L1 | ✅ 一致 |
| `default_dept_id` | ✅ | ✅ | ✅ FK | L2 | ✅ 一致 |
| `is_required` | ❌* | ✅ | ✅ DEFAULT false | L2 | **INFO-003** |
| `is_active` | ✅ | ✅ | ✅ DEFAULT true | L1 | ✅ 一致 |
| `created_at` | — | — | ✅ | — | ✅ 系统字段 |

> \* BM §第四部分字段清单仅列 5 字段（code/name/type/default_dept_id/is_active），但 BM §第二部分「工序」数据字典明确包含 `is_required`（"是否必经"）。SP 的 6 字段版本与完整业务语义一致。
>
> **INFO-003：** SP 的 `type` CHECK 约束包含 `('加工', '检验', '辅助')`，比 SC 的 CHECK（仅 `'加工'`, `'检验'`）多出 `'辅助'`。BM E3 实体定义了三种类型（加工/检验/辅助），SP 的扩展与 BM 一致。`'辅助'` 在 V1 可能不启用，但预置不造成问题。

#### 1.2.4 process_routes

| 字段 | BM | SC | SP | FM | 判定 |
|------|:--:|:--:|:--:|:--:|------|
| `name` | ✅ | ✅ | ✅ NOT NULL | L3 | ✅ 一致 |
| `is_active` | ✅ | ✅ | ✅ DEFAULT true | L1 | ✅ 一致 |
| `created_at` | — | — | ✅ | — | ✅ 系统字段 |

> 无差异。

#### 1.2.5 route_steps

| 字段 | BM | SC | SP | FM | 判定 |
|------|:--:|:--:|:--:|:--:|------|
| `route_id` | ✅ | ✅ | ✅ NOT NULL FK | L1 | ✅ 一致 |
| `process_id` | ✅ | ✅ | ✅ NOT NULL FK | L1 | ✅ 一致 |
| `seq` | ✅ | ✅ | ✅ NOT NULL | L1 | ✅ 一致 |

> 无差异。SP 额外增加了 `UNIQUE(route_id, process_id, seq)` 约束，合理——同路线同工序同顺序号不应重复。

#### 1.2.6 orders

| 字段 | BM | SC | SP | FM | 判定 |
|------|:--:|:--:|:--:|:--:|------|
| `order_no` | ✅ | ✅ | ✅ NOT NULL UNIQUE | L2 | ✅ 一致 |
| `customer_id` | ✅ | ✅ | ✅ FK | L2 | ✅ 一致 |
| `order_qty` | ✅ | ✅ | ✅ NOT NULL | L1 | ✅ 一致 |
| `due_date` | ✅ | ✅ | ✅ NOT NULL | L1 | ✅ 一致 |
| `base_texture` | ✅ | ❌ 缺失 | ✅ 可空 | L2 | **INFO-004** |
| `plate_color` | ✅ | ❌ 缺失 | ✅ 可空 | L2 | **INFO-004** |
| `sand_type` | ✅ | ❌ 缺失 | ✅ 可空 | L2 / **L3** | **WARN-002** |
| `route_id` | ✅ | ✅ | ✅ FK | L1 | ✅ 一致 |
| `route_snapshot` | ❌† | ❌ | ✅ JSONB DEFAULT '{}' | L1 | **INFO-005** |
| `second_route_id` | — | — | ✅ FK 可空 | L3 | ✅ Phase 0-A.2 C3 |
| `specs` | — | — | ✅ JSONB DEFAULT '{}' | L3 | ✅ Phase 0-A.2 C4 |
| `status` | ✅ | ✅ | ✅ DEFAULT 'in_production' | L1 | ✅ 一致 |
| `note` | ✅ | ✅ | ✅ 可空 | L2 | ✅ 一致 |
| `created_at` | — | ✅ | ✅ | L1 | ✅ 一致 |
| `updated_at` | — | ✅ | ✅ | L1 | ✅ 一致 |

> † BM §第四部分字段清单未列出 `route_snapshot`，但 ADL-001 强制要求此字段。BM §第三部分「业务规则 1」明确描述了快照机制。
>
> **INFO-004：** SC 的 DDL 遗漏了 `base_texture`、`plate_color`、`sand_type` 三个规格字段。BM §第四部分订单字段清单包含全部三个。SP 正确恢复。这三个字段是 BM 明确要求的业务字段，SC 的简化版本不完整。
>
> **INFO-005：** `route_snapshot` 由 ADL-001 强制要求，BM 业务规则 1 明确定义。SP 正确新增。不标记为字段偏差——这是 SP 对 ADL 的正确执行。
>
> **WARN-002：** SP §2.6 将 `sand_type` 标记为 L2，但 FM §3.1 O08 明确评级 L3，依据是"工厂语言库完全未出现喷砂术语。可能工厂不用喷砂"。两者不一致。FM 是更权威的评级来源——`sand_type` 应为 L3。这不影响 DDL（可空字段无行为差异），但影响文档准确性。

#### 1.2.7 order_nodes

| 字段 | BM | SC | SP | FM | 判定 |
|------|:--:|:--:|:--:|:--:|------|
| `order_id` | ✅ | ✅ | ✅ NOT NULL FK | L1 | ✅ 一致 |
| `process_id` | ✅ | ✅ | ✅ FK | L1 | ✅ 一致 |
| `process_name` | ✅ | ✅ | ✅ 可空 | L1 | ✅ 一致 |
| `process_code` | ❌ | ❌ | ✅ 可空 | L1 | **INFO-006** |
| `dept_id` | ✅ | ✅ | ✅ FK | L1 | ✅ 一致 |
| `dept_name` | ✅ | ✅ | ✅ 可空 | L1 | ✅ 一致 |
| `status` | ✅ | ✅ | ✅ DEFAULT 'waiting' | L1 | ✅ 一致 |
| `seq` | ✅ | ✅ | ✅ NOT NULL | L1 | ✅ 一致 |
| `rework_pass` | ✅ | ✅ | ✅ DEFAULT 0 | L1 | ✅ 一致 |
| `pause_reason` | ❌ | ❌ | ✅ DEFAULT NULL | L2 | ✅ Phase 0-A.2 C1 |
| `layer` | — | — | ✅ DEFAULT NULL | L3 | ✅ Phase 0-A.2 C2 |
| `qty_out` | ✅ | ✅ | ✅ 可空 | L2 | ✅ 一致 |
| `is_outsourced` | ❌ | ✅ | ✅ DEFAULT false | L3 | ✅ V1.5 预留 |
| `supplier_id` | ❌ | ✅ | ✅ 可空 | L3 | ✅ V1.5 预留 |
| `note` | ✅ | ✅ | ✅ 可空 | L2 | ✅ 一致 |
| `created_at` | — | ✅ | ✅ | L1 | ✅ 一致 |
| `updated_at` | — | ✅ | ✅ | L1 | ✅ 一致 |

> **INFO-006：** `process_code` 不在 BM 的 order_nodes 字段清单中（BM 仅列出 `process_name` 作为快照字段）。但架构设计 [7-架构设计-v1.md](../7-架构设计-v1.md) §4.1 的 DDL 中包含 `process_code` 快照字段，Phase 0-A.2 的最终 DDL 也包含。SP 继承了此字段。判定：合理扩展——`process_code`（P01）比 `process_name`（冲压成型）更短更适合在流程图上显示。

#### 1.2.8 exception_events

| 字段 | BM | SC | SP | FM | 判定 |
|------|:--:|:--:|:--:|:--:|------|
| `node_id` | ✅ | ✅ | ✅ NOT NULL（无 FK） | L1 | ✅ 一致 |
| `type` | ✅ | ✅ | ✅ NOT NULL | L2 | ✅ 一致 |
| `qty` | ✅ | ✅ | ✅ NOT NULL | L1 | ✅ 一致 |
| `resolution` | ✅ | ✅ | ✅ 可空 | L2 | ✅ 一致 |
| `created_at` | — | ✅ | ✅ | L1 | ✅ 一致 |

> 无差异。

### 1.3 字段审计总结

| 类别 | 数量 | 详情 |
|------|:----:|------|
| 与 BM 完全一致 | 38 | 核心字段无偏差 |
| SC 遗漏、SP 正确恢复 | 5 | `departments.type`, `customers.is_active`, `base_texture`, `plate_color`, `sand_type` |
| ADL 强制、SP 正确新增 | 1 | `route_snapshot` (ADL-001) |
| Phase 0-A.2 变更、SP 正确新增 | 4 | `pause_reason` (C1), `layer` (C2), `second_route_id` (C3), `specs` (C4) |
| 合理扩展（架构文档支撑） | 1 | `order_nodes.process_code` |
| V1.5 预留（来自 SC） | 2 | `is_outsourced`, `supplier_id` |
| **错误新增** | **0** | — |
| **错误删除** | **0** | — |

**结论：Schema Plan 的字段定义无实质性错误。SP 是唯一一份同时正确反映 BM（业务基准）+ ADL（架构决策）+ Phase 0-A.2（缺口修复）三源的文档。SC 存在多处遗漏，SP 未继承其错误。**

---

## 二、外键风险审核

### 2.1 FK 声明审计

逐条检查 §十一 DDL 中每条 FK 的 `ON DELETE` 显式声明：

| # | DDL 行 | 子表.字段 → 父表 | SP 声明 | §四设计 | 匹配 | 数据类型 |
|----|:------:|-------------------|---------|:------:|:----:|---------|
| FK1 | 791 | `orders.customer_id → customers` | `RESTRICT` | RESTRICT | ✅ | 主数据 |
| FK2 | 797 | `orders.route_id → process_routes` | `RESTRICT` | RESTRICT | ✅ | 主数据 |
| FK3 | 799 | `orders.second_route_id → process_routes` | `SET NULL` | SET NULL | ✅ | 预留字段 |
| FK4 | 764 | `processes.default_dept_id → departments` | **未声明** | RESTRICT | ⚠️ | 主数据 |
| FK5 | 781 | `route_steps.route_id → process_routes` | `CASCADE` | CASCADE | ✅ | 模板数据 |
| FK6 | 782 | `route_steps.process_id → processes` | `RESTRICT` | RESTRICT | ✅ | 主数据 |
| FK7 | 811 | `order_nodes.order_id → orders` | `CASCADE` | CASCADE | 🔴 | **生产数据** |
| FK8 | 812 | `order_nodes.process_id → processes` | `SET NULL` | SET NULL | ✅ | 快照容错 |
| FK9 | 815 | `order_nodes.dept_id → departments` | `SET NULL` | SET NULL | ✅ | 快照容错 |
| — | 833 | `exception_events.node_id → —` | 无 FK | 无 FK | ✅ | 独立保留 |

### 2.2 CRIT-001 · 生产数据级联删除（阻塞）

**位置：** 行 811
```sql
order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE
```

**问题描述：**
`order_nodes` 是 DialFactory 的**核心生产追踪数据**——每一行代表订单在某道工序上的真实执行轨迹。当父表 `orders` 的一行被删除时，`ON DELETE CASCADE` 会将属于该订单的**全部 `order_nodes` 静默删除**。与此同时，`exception_events` 因无 FK 约束，其中的 `node_id` 将变为悬空引用，指向不存在的节点。

**违反的设计原则：**

| 原则 | 来源 | 违反方式 |
|------|------|---------|
| 事件日志追加式存储。生产现场状态变更是不可逆事实。 | [4-数据库设计原则.md](../4-数据库设计原则.md) §1 | CASCADE 删除 = 不可逆销毁 |
| 订单完成（status='completed'）后，所有关联节点锁定。 | [7-架构设计-v1.md](../7-架构设计-v1.md) §4.3 规则 5 | CASCADE 绕过锁定 |
| 禁止生产数据级联删除 | 用户明确要求 | 直接违反 |

**影响场景：**

| 场景 | 后果 | 可恢复？ |
|------|------|:----:|
| 跟单员误点"删除订单" | 全部节点 + 全部生产轨迹消失 | ❌ 无 audit_logs |
| 应用层 Bug 触发 DELETE FROM orders | 静默丢失生产数据 | ❌ |
| Supabase Dashboard 手动删行 | 级联灭失所有节点 | ❌ |
| exception_events 悬空 | node_id 全部指向不存在的节点 | ❌ 数据污染 |

**修复方案：**

```sql
-- 修复前（SP 当前）
order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE

-- 修复后
order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT
```

**配套策略（应用层）：**
1. V1 不应提供"物理删除订单"功能。替代方案：`orders.status = 'cancelled'`（软删除）
2. 如确需物理删除（admin 操作），先显式处理 `exception_events` → 再删 `order_nodes` → 最后删 `orders`（三步显式操作，无隐式级联）
3. 如果后续评估认为 `CASCADE` 是正确行为（订单作废 = 节点作废），则必须同时：
   - 在 `exception_events` 上增加 `ON DELETE CASCADE`（或应用层先清理）
   - 写入 audit_log（V2）
   - 增加二次确认 UI

> **严重度：Critical。必须在 Phase 1-B DDL 执行前修复。当前设计直接违反用户「禁止生产数据级联删除」的指令。**

### 2.3 WARN-003 · FK4 未显式声明 ON DELETE

**位置：** 行 764
```sql
default_dept_id UUID REFERENCES departments(id)
```

**问题：** `ON DELETE` 行为未显式声明。PostgreSQL 默认行为是 `NO ACTION`（在事务末尾检查，效果类似 RESTRICT 但时机不同）。§四 FK 设计表明确指定此 FK 为 `RESTRICT`。

**修复：**
```sql
default_dept_id UUID REFERENCES departments(id) ON DELETE RESTRICT
```

> **严重度：Warning。默认行为与设计意图基本一致，但建议显式声明以消除歧义。**

### 2.4 WARN-004 · route_steps.route_id CASCADE 评估

**位置：** 行 781
```sql
route_id UUID NOT NULL REFERENCES process_routes(id) ON DELETE CASCADE
```

**问题：** 删路线时联动删除所有步骤。`route_steps` 是模板数据（非生产数据），风险低于 CRIT-001。但存在以下场景：
1. 路线被历史订单的 `route_snapshot` JSONB 引用 → 快照中的 `route_id` UUID 失去模板参照
2. `orders.route_id` 已有 `RESTRICT` 保护（FK2），因此"被订单引用的路线"无法删除 → 只有未被任何订单引用的路线才能触发 CASCADE → 实际风险较低

**判定：** 风险可控。不阻塞 V1。但如果统一为 `RESTRICT`（与 FK2/FK6 一致），整体 FK 策略更简洁。

> **严重度：Warning。不阻塞，但建议考虑统一为 RESTRICT。**

### 2.5 FK 审计总结

| 状态 | 数量 | FK |
|------|:----:|-----|
| ✅ 正确 | 7 | FK1, FK2, FK3, FK6, FK8, FK9 + exception_events 无 FK |
| ⚠️ Warning | 2 | FK4（未显式声明）, FK5（CASCADE 可讨论） |
| 🔴 Critical | 1 | **FK7（生产数据 CASCADE）** |

---

## 三、L3 字段审核

### 3.1 审核标准

L3 = 待收集。FM 评级框架要求：`DEFAULT NULL`，前端隐藏，不收数据。

### 3.2 L3 字段逐项审计

| # | 字段 | SP 约束 | SP 成熟度标注 | FM 评级 | 一致？ | 问题 |
|----|------|---------|:------------:|:------:|:----:|------|
| 1 | `customers.name` | `NOT NULL` | L3 | L3 | ⚠️ | **WARN-001** |
| 2 | `customers.code` | 可空 | L3 | L3 | ✅ | — |
| 3 | `orders.sand_type` | 可空 | **L2** | **L3** | 🔴 | **WARN-002** |
| 4 | `orders.specs` | `JSONB DEFAULT '{}'` | L3 | L3 | ✅ | — |
| 5 | `orders.second_route_id` | FK 可空 | L3 | L3 | ✅ | — |
| 6 | `order_nodes.layer` | `DEFAULT NULL` | L3 | L3 | ✅ | — |

### 3.3 WARN-001 · customers.name NOT NULL vs L3

SP 设置 `customers.name TEXT NOT NULL`，但 FM 对 `customers.name` 评级 L3（工厂语言库零客户名称，无一被证实）。

**矛盾：** L3 策略要求"前端隐藏，不收数据"，但 NOT NULL 约束在数据库层强制必填。V1 启动时 customers 表为空，无法插入第一行客户数据，进而无法创建带有 `customer_id` 外键的订单。

**FM 的建议（§五）：**
> V1 建表时预置空 customers 表。订单创建页面允许直接输入客户名（文本），建表后再逐步建立客户主数据。不阻塞 V1 核心流转。

**判定：** NOT NULL 约束本身是合理的（BM 要求客户名必填），但需要配套前端策略。SP 本身无错误——这是 FM 已知的 L3 数据风险。建议 SP 在 §二.2 补充说明：V1 前端允许自由文本输入客户名，不强制外键下拉。DDL 不需要修改。

### 3.4 WARN-002 · sand_type 成熟度不一致

SP §2.6 将 `sand_type` 标注为 L2，但 FM §3.1 O08 明确评级 **L3**。

**FM 依据（O08）：**
> 工厂语言库完全未出现喷砂术语。可能工厂不用喷砂，或用其他术语描述。需确认此字段是否必要。

**SP 的处理：** 字段设为可空（`TEXT` 无 NOT NULL），实际存储行为与 L3 一致。问题仅在文档标注层面——成熟度标记应更正为 L3。

**FM 的后续建议（Proposal-001）：**
> 如果 Phase 0-B 真实订单数据中确实没有喷砂信息 → 建议将 sand_type 合并到 specs JSONB。

**修复：** SP §2.6 表格中 `sand_type` 的成熟度从 "L2" 更正为 "L3"。

### 3.5 L3 审核总结

| L3 字段 | DDL 行为 | FM 策略 | Phase 0 策略一致性 |
|---------|---------|--------|-------------------|
| `customers.name` | NOT NULL | 前端自由文本过渡 | ✅ 一致（策略已知） |
| `customers.code` | 可空 | DEFAULT NULL | ✅ 一致 |
| `sand_type` | 可空 | DEFAULT NULL，待评估删除 | ⚠️ 标注不一致 |
| `specs` | JSONB '{}' | 前端隐藏 | ✅ 一致 |
| `second_route_id` | FK 可空 | 等待 GAP-2 确认 | ✅ 一致 |
| `layer` | DEFAULT NULL | 等待 GAP-2 确认 | ✅ 一致 |

**结论：L3 字段的 DDL 设计均符合 Phase 0 策略。无违反 Phase 0 决策的情况。仅 2 处文档标注不一致需修正。**

---

## 四、ADP 一致性检查

审查 SP 是否与 [00_PROJECT_STATUS_FREEZE.md](../../00_PROJECT_STATUS_FREEZE.md) §6 的 5 条 ADP 决策一致。

### ADP-001 · 多规格订单不引入 order_variants

| 检查项 | 预期 | SP 实际 | 判定 |
|--------|------|---------|:----:|
| 存在 `order_variants` 表？ | ❌ 不应存在 | ❌ 不存在 | ✅ |
| 存在 `orders.specs JSONB`？ | ✅ 应存在 | ✅ 存在 | ✅ |
| 存在 A/B 拆分机制？ | 应用层逻辑 | 不在 DDL 范围 | ✅ |

### ADP-002 · 上下层不使用 DAG 模型

| 检查项 | 预期 | SP 实际 | 判定 |
|--------|------|---------|:----:|
| 存在图/树结构表？ | ❌ 不应存在 | ❌ 不存在 | ✅ |
| 存在 `order_nodes.layer`？ | ✅ 预留字段 | ✅ DEFAULT NULL | ✅ |
| 存在 `orders.second_route_id`？ | ✅ 预留字段 | ✅ FK 可空 | ✅ |

### ADP-003 · 挪用业务 V1 使用 note 文本记录

| 检查项 | 预期 | SP 实际 | 判定 |
|--------|------|---------|:----:|
| 存在 `qty_reused` 字段？ | ❌ 不应存在 | ❌ 不存在 | ✅ |
| 存在 `reuse_source` 字段？ | ❌ 不应存在 | ❌ 不存在 | ✅ |
| 存在 `inventory` 表？ | ❌ 不应存在 | ❌ 不存在 | ✅ |
| 存在 `order_nodes.note`？ | ✅ 应存在 | ✅ 存在 | ✅ |

### ADP-004 · 物料复用 orders 模型，不新增 materials

| 检查项 | 预期 | SP 实际 | 判定 |
|--------|------|---------|:----:|
| 存在 `materials` 表？ | ❌ 不应存在 | ❌ 不存在 | ✅ |
| 存在 `orders.specs JSONB`？ | ✅ 可容纳物料规格 | ✅ 存在 | ✅ |

### ADP-005 · 总QC作为显式节点，部门QC动态追加

| 检查项 | 预期 | SP 实际 | 判定 |
|--------|------|---------|:----:|
| departments 含 '总QC'？ | ✅ 应包含 | ✅ seq=5, type='qc' | ✅ |
| processes 硬编码部门QC？ | ❌ 不硬编码 | ❌ 未硬编码（由路线模板定义） | ✅ |
| 支持动态追加节点？ | ✅ 应有 | ✅ order_nodes 结构支持任意插入 | ✅ |

### ADP 检查总结

| ADP | 状态 |
|-----|:----:|
| ADP-001 | ✅ 一致 |
| ADP-002 | ✅ 一致 |
| ADP-003 | ✅ 一致 |
| ADP-004 | ✅ 一致 |
| ADP-005 | ✅ 一致 |

**结论：5 条 ADP 决策全部在 SP 中得到正确体现。无违反、无遗漏、无过度实现。**

---

## 五、Enum CHECK 约束补充审查

### 5.1 枚举值完整性

| 字段 | SP CHECK 值 | 来源 | 判定 |
|------|------------|------|:----:|
| `departments.type` | `'production', 'qc'` | BM E5 + ADL-003 | ✅ |
| `processes.type` | `'加工', '检验', '辅助'` | BM E3 | ✅ |
| `order_nodes.status` | `'waiting', 'active', 'done', 'paused'` | ADL-003 四态 | ✅ |
| `orders.status` | `'in_production', 'paused', 'completed'` | 9-V1-Scope §6.2 | ✅ |

**已验证：**
- `order_nodes.status` CHECK 正确移除了 `handing_off`（ADL-003）
- `orders.status` CHECK 正确使用三态自动计算（非五态）
- 无 `processes.rework_strategy` 字段（ADL-002）
- 无 `processes.rework_target_id` 字段（ADL-002）

---

## 六、审查结论与修复清单

### 6.1 最终判定

| 维度 | 判定 |
|------|------|
| 字段审计 | **通过** — 无字段缺失或错误新增。SP 是唯一正确集成 BM + ADL + Phase 0-A.2 的文档 |
| FK 审计 | **不通过** — 1 Critical（生产数据级联删除）必须修复 |
| L3 审计 | **通过** — DDL 行为与 Phase 0 策略一致，2 处文档标注需修正 |
| ADP 一致性 | **通过** — 5 条 ADP 无违反 |

**最终状态：Need Revision**

### 6.2 修复清单

#### 必须在 Phase 1-B 前修复（Critical）

| ID | 位置 | 修复内容 | 影响 |
|----|------|---------|------|
| **CRIT-001** | §十一 行 811 | `ON DELETE CASCADE` → `ON DELETE RESTRICT` | DDL 改动 1 行 |

#### 建议修复（Warning）

| ID | 位置 | 修复内容 | 影响 |
|----|------|---------|------|
| **WARN-003** | §十一 行 764 | 增加 `ON DELETE RESTRICT` 显式声明 | DDL 改动 1 行 |
| **WARN-004** | §十一 行 781 | 评估 `CASCADE` → `RESTRICT` | 可选，不强制 |
| **WARN-001** | §二.2 表格 | `customers.name` 补充 L3 数据策略说明 | 文档改动 |
| **WARN-002** | §二.6 表格 | `sand_type` 成熟度 L2 → L3 | 文档改动 |

#### 无需操作（Info）

| ID | 说明 |
|----|------|
| INFO-001~006 | 字段审计发现，均为 SP 正确纠正 SC 的遗漏或正确执行 Phase 0-A.2 变更。无需修改 |

### 6.3 修复后的 CRIT-001 DDL

```sql
-- 修复前
order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE

-- 修复后
order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT
```

### 6.4 修复后的 WARN-003 DDL

```sql
-- 修复前
default_dept_id UUID REFERENCES departments(id)

-- 修复后
default_dept_id UUID REFERENCES departments(id) ON DELETE RESTRICT
```

---

## 七、SP 设计亮点（正面发现）

在审查过程中识别出以下 SP 做得正确的设计决策，值得明确记录：

| # | 亮点 | 说明 |
|----|------|------|
| 1 | **三源正确集成** | SP 是唯一同时正确反映 BM（业务字段）、ADL（架构决策）、Phase 0-A.2（缺口修复）的文档。SC 存在 5 处字段遗漏，SP 全部修正 |
| 2 | **FK 设计分层清晰** | 主数据 → RESTRICT、快照 → SET NULL、无 FK（exception_events）三层策略设计合理 |
| 3 | **ENUM 选型正确** | TEXT + CHECK 优于原生 ENUM（Supabase SDK 兼容性）。论述充分 |
| 4 | **预留字段零成本** | 5 个预留字段全部 DEFAULT NULL / DEFAULT false / DEFAULT '{}'，不启用则零开销 |
| 5 | **索引克制** | 9 条索引精准覆盖核心查询，不在预留字段和自由文本字段上建索引 |
| 6 | **ADP 零违反** | 5 条 ADP 决策全部正确体现，无过度实现 |

---

> **审查结论：SP 的设计质量很高。唯一阻塞项是 CRIT-001（生产数据级联删除），修复后即可进入 Phase 1-B。Warning 项建议修复但不阻塞推进。**
>
> **下一阶段入口条件：** CRIT-001 修复 → SP 更新 → 重新标记为 Approved → Phase 1-B Supabase 建表。
