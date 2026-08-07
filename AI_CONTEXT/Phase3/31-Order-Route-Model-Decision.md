# DialFactory Phase 3-A · Order-Route Model Decision

> **状态：** Decision Document — Awaiting Approval
> **基于：** [30-Phase3A-Business-Model-Revision.md](30-Phase3A-Business-Model-Revision.md)
> **原则：** 不写代码。Freeze 优先。Schema 变更需 Migration 方案。
> **目标：** 为 Phase 3-B 提供明确的实施基线。

---

## Decision 1 · Order State Machine — Final States

### 1.1 Current (V1.0)

```
in_production ──────→ paused ──────→ in_production
      │                                    │
      └──────────→ completed ←─────────────┘
```

3 states. `paused` 语义过载（暂停/待客户/等物料/取消 全部用 paused + note 表示）。

### 1.2 Proposed (V1.1)

```
                    ┌──────────────────────────────┐
                    │        in_production          │
                    └──────────────┬───────────────┘
                                   │
              ┌────────────────────┼──────────────────┐
              ▼                    ▼                  ▼
         ┌─────────┐         ┌─────────┐       ┌──────────┐
         │ paused  │         │completed│       │cancelled │
         └────┬────┘         └─────────┘       └──────────┘
              │                    ▲                  ▲
              └──── resume ────────┘                  │
                                                      │
              in_production ──── cancel ──────────────┘
```

4 states. `cancelled` 明确语义。

### 1.3 State Transitions

| From | To | Trigger | Condition |
|------|-----|--------|-----------|
| `in_production` | `completed` | All nodes done | Auto-derived |
| `in_production` | `paused` | All non-done nodes paused | Auto-derived |
| `paused` | `in_production` | Any paused node resumed | Auto-derived |
| `in_production` | `cancelled` | **User action** | Manual. Irreversible |
| `paused` | `cancelled` | **User action** | Manual. Irreversible |

**cancelled 规则：**
- 跟单员手动触发（需要二次确认）
- 所有 `active`/`waiting` 节点 → `paused`（保留历史）
- 不可逆：`cancelled` → 任何其他状态 ❌
- Dashboard 单独统计"已取消"

### 1.4 Schema Change Required

```sql
-- Migration: 002_add_cancelled_status.sql
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('in_production', 'paused', 'completed', 'cancelled'));
```

**影响：**
- DDL: 1 行 ALTER TABLE
- 前端: Dashboard stats card 增加"已取消"
- 前端: P2 Order List filter 增加"已取消"
- 前端: P4 Order Detail — cancelled 订单隐藏操作按钮
- 后端: `OrderState.derive()` — cancelled 保留原推导值，不覆盖
- 数据: 现有订单不受影响（默认 'in_production'）

---

## Decision 2 · Undo vs Rework — 明确区分

### 2.1 概念对比

| 维度 | Undo (撤销) | Rework (返工) |
|------|-----------|-------------|
| **触发原因** | 操作错误（点错了） | 质量问题（真的需要重做） |
| **时间窗口** | 5 分钟内 | 任意时间 |
| **数据操作** | UPDATE 节点状态回退 | INSERT 新节点 |
| **rework_pass** | 不变 | +1 |
| **语义** | "刚才点错了，撤销" | "电镀色差，重镀一次" |
| **审计** | 无痕迹（状态回退） | 有痕迹（新节点可见） |
| **适用状态** | done → active, paused → active | done → 创建新 active |

### 2.2 Undo 实现规范

```
NodeActions.undo(node):
  Pre-condition: node.updated_at 在 UNDO_WINDOW 内（默认5分钟）
  
  Case 1: node.status = 'done', 上一个状态是 'active'
    → UPDATE status = 'active'
    → 如果下游节点被自动激活，同步回退为 'waiting'
  
  Case 2: node.status = 'paused', 上一个状态是 'active'
    → UPDATE status = 'active', pause_reason = null
  
  Case 3: node.status = 'active', 是被自动激活的
    → UPDATE status = 'waiting'
  
  超时: 超过 UNDO_WINDOW → 按钮隐藏，不可撤销
```

**UI 表现：**
- 按钮：节点卡片增加"撤销"链接（灰色小字，仅在时间窗口内显示）
- 不弹确认对话框（撤销自己点错的按钮不需要确认）
- Toast 通知撤销成功

### 2.3 Rework 保持不变

现有 `NodeActions.rework()` 逻辑不变。Undo 是独立的新方法。

### 2.4 Schema 影响

**无。** 纯应用层逻辑。不记录操作历史（V2 的 audit_logs）。

---

## Decision 3 · Template Route vs Order Snapshot

### 3.1 定位

```
Template Route (process_routes + route_steps)
  角色: 建议起点
  维护: 管理员通过 Route Editor
  用途: 创建订单时作为初始工序列表
  状态: 可能不完整、可能过时、可能是近似模板

Order Snapshot (orders.route_snapshot JSONB)
  角色: 真实记录
  维护: 系统自动生成（创建时）
  用途: 记录跟单员的实际决策
  状态: 永久不可变
```

### 3.2 关系声明

```
Template ≠ Truth. Snapshot = Truth.

Template 是跟单员的"快捷方式"，不是"约束"。
Snapshot 记录的是"这张订单实际确认了什么"，不可修改。
```

这与 ADL-001 完全一致。不需要修改模型。

### 3.3 无模板场景

当工厂没有合适的路线模板时，跟单员可以：

1. **从工序字典直接构建：** 跳过模板选择，从 35 道工序中逐道勾选
2. **从历史订单复制：** 选择一张历史订单 → 复用其 route_snapshot 作为初始工序列表
3. **从规格推荐：** 选择 base_texture + plate_color → 系统推荐工序列表

三者都用 `route_snapshot` 记录最终决策。`route_id` 可为 NULL（表示没有使用预定义模板）。

---

## Decision 4 · Order Route Builder — 设计

### 4.1 当前 P3 流程的问题

```
Step 1: 选模板 (必须)
Step 2: 确认/取消工序
```

当 `process_routes` 表为空（工厂没有标准模板）时，Step 1 的模板下拉框为空 → 阻塞整个订单创建流程。

### 4.2 修订后的 P3 流程

```
Step 1: Basic Info (不变)
  - 订单编号、客户、数量、交期、规格参数
  - 路线来源选择: [使用模板 ▾] [从工序构建] [复制历史订单]

Step 2: Route Builder (修订)
  ┌─────────────────────────────────────────────┐
  │ 路线来源: ○ 模板  ○ 工序构建  ○ 历史订单    │
  │                                             │
  │ [来源选择后动态展示]                          │
  │                                             │
  │ 模板模式: 选模板 → 展示步骤 → 确认/取消      │
  │ 工序构建: 全35道工序 → 逐道勾选 → 排顺序     │
  │ 历史订单: 选历史订单 → 复用snapshot → 微调   │
  │                                             │
  │ 最终: 确认工序列表 (≥1道) → 创建订单         │
  └─────────────────────────────────────────────┘
```

### 4.3 三种模式

| 模式 | 数据来源 | 何时使用 |
|------|---------|---------|
| **模板模式** | `process_routes` + `route_steps` | 有标准路线时（当前功能，不变） |
| **工序构建** | `processes` 全量列表（按部门分组） | 无模板时。跟单员逐道勾选 |
| **历史订单** | 历史 `orders.route_snapshot` | 跟单员记得"上次那单差不多" |

### 4.4 工序构建 UI

```
┌──────────────────────────────────────────────┐
│ 选择工序                                      │
│                                              │
│ 制一 (11道)                                  │
│ ☑ P01 冲板 [必修]    ☐ P04 允窗              │
│ ☑ P02 冲孔           ☐ P05 平压              │
│ ☑ P03 焊脚 [必修]    ☐ P07 车圈              │
│ ☑ P06 撕胶纸 [必修]  ☐ P08 车窗              │
│ ☐ P09 车唱片纹       ☐ P10 倒喇叭孔           │
│ ☐ P11 磨毛刺                                  │
│                                              │
│ 制二 (14道)                                  │
│ ☑ P16 电镀 [必修]    ☐ P12 磨板              │
│ ☑ P17 打底 [必修]    ☐ P13 喷砂              │
│ ...                                          │
│                                              │
│ 已选择: 12 道工序                             │
│ 排序: [拖拽调整] [按部门自动排序]              │
│                                              │
│              [确认工序列表 → 创建订单]         │
└──────────────────────────────────────────────┘
```

- `is_required` 工序默认勾选且不可取消
- 工序按部门分组展示
- 选择后显示已选数量
- seq 自动按部门+工序编号排序（可手动调整）

### 4.5 Schema 影响

**无。** `route_id` 允许 NULL（已支持）。`route_snapshot` 结构不变。

`route_snapshot` 中增加 `source` 字段：
```json
{
  "source": "template" | "manual" | "historical",
  "source_order_id": null | "<UUID>",
  "route_id": null | "<UUID>",
  ...
}
```

---

## Decision 5 · 订单创建时路线选择流程

### 5.1 修订后的完整流程

```
Step 1: Basic Info
  ├── 订单编号 *
  ├── 客户 *
  ├── 订单数量 *
  ├── 交期 *
  ├── 规格参数 (base_texture, plate_color, sand_type)
  └── [下一步 →]

Step 2: Route Builder
  ├── 选择来源:
  │     ○ 使用模板 (默认，如果模板存在)
  │     ○ 从工序构建 (如果模板不存在，自动选中)
  │     ○ 复制历史订单
  │
  ├── [根据选择动态展示]:
  │     模板模式: 下拉选模板 → 加载步骤 → 确认/取消
  │     工序构建: 按部门分组工序列表 → 逐道勾选
  │     历史订单: 下拉选订单 → 加载其snapshot → 确认/取消
  │
  └── 确认工序列表 (≥1) → [创建订单 ✓]

Step 3: 创建结果
  ├── INSERT orders (route_id 可为 NULL)
  ├── INSERT order_nodes (gap seq 10,20,...)
  ├── Route Snapshot 自动生成
  └── 导航到 #/orders/:newId
```

### 5.2 V1 默认行为

| 场景 | 默认模式 |
|------|---------|
| `process_routes` 有数据 | 模板模式 |
| `process_routes` 为空 | 工序构建模式（自动切换） |

这样即使工厂没有提供模板，跟单员也能创建订单。

---

## Decision 6 · 历史 Excel 未来导入策略

### 6.1 当前现实

`DialFactory_数据采集模板.xlsx` 的 Sheet 5-6（订单+执行记录）几乎为空：
- 1 行虚构订单 (SN-2026-0088)
- 1 行示例节点 (冲压成型)

**导入价值：几乎为零。** 没有足够的历史数据值得导入。

### 6.2 策略

```
Phase 3: 不开发导入工具
  理由: 历史数据量不足。投入产出比低。

Phase 4 (运营3个月后):
  如果工厂积累了纸质跟单本 → 批量补录
  工具: Python 脚本 (tools/import_orders.py)
  格式: CSV (工厂用Excel导出)

Phase 5 (AI分析):
  线上订单数据积累 → 路线规律分析
  不在Excel层面做分析
```

### 6.3 工厂数据补充建议

与其导入历史，不如让工厂提供：

| 优先级 | 数据 | 用途 |
|:------:|------|------|
| **P0** | 2-3 条常用路线（完整步骤） | 填充 `process_routes` + `route_steps` |
| **P0** | 16 家客户确认 | 填充 `customers` |
| **P1** | 35道工序的部门归属确认 | 验证 `processes.default_dept_id` |
| **P2** | 历史订单（纸质→手工录入系统） | 积累分析数据 |

---

## Decision 7 · Schema 修改汇总

### 7.1 V1.0 → V1.1 Schema Changes

| # | Change | Type | Migration | Rollback |
|:--|--------|:----:|-----------|----------|
| 1 | `orders.status` 增加 `cancelled` | ALTER CHECK | `002_add_cancelled_status.sql` | 替换回旧 CHECK |

### 7.2 Migration: 002_add_cancelled_status.sql

```sql
-- ============================================================
-- DialFactory V1.1 · Migration 002
-- Add 'cancelled' to orders.status
-- ============================================================

-- 1. Drop existing CHECK
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- 2. Add new CHECK with 'cancelled'
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('in_production', 'paused', 'completed', 'cancelled'));

-- 3. Verify
-- SELECT constraint_name, check_clause
-- FROM information_schema.check_constraints
-- WHERE constraint_name = 'orders_status_check';
```

### 7.3 Rollback: 002_revert_cancelled_status.sql

```sql
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('in_production', 'paused', 'completed'));
```

### 7.4 不做 Schema 变更的部分

| 需求 | Schema 变更 | 原因 |
|------|:----------:|------|
| 撤销机制 | ❌ | 纯应用层 |
| Route Builder | ❌ | route_id 已允许 NULL |
| 工序构建 | ❌ | 不新增表 |
| 历史订单复制 | ❌ | route_snapshot 已存在 |
| Excel 导入 | ❌ | 不开发 |
| AI 路线分析 | ❌ | 延后 V2 |

---

## Final Summary

```
Phase 3-B Scope (after approval):

1. Schema Change:
   ✅ orders.status + 'cancelled' (Migration 002)

2. Application Changes:
   ✅ NodeActions.undo() — 5分钟时间窗口撤销
   ✅ P3 Order Create — Route Builder (3 modes)
   ✅ P4 Order Detail — cancelled订单隐藏操作按钮
   ✅ P1 Dashboard — 增加"已取消"统计卡片
   ✅ order-state.js — derive() 处理 cancelled

3. NO Schema Changes for:
   ❌ Undo (application-layer)
   ❌ Route Builder (existing schema supports)
   ❌ Historical import (not developed)

4. Deferred:
   ⏸️ Excel import tool (Phase 4)
   ⏸️ AI route analysis (Phase 5)
   ⏸️ Audit logs (V2)
```

---

> **7 Decisions documented. 1 Schema change proposed (cancelled status). Awaiting approval to proceed to Phase 3-B.**
