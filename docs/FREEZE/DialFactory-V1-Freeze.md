# DialFactory V1 Freeze Manifest

> **性质：** 项目冻结声明。最高优先级。任何 AI 进入项目必须首先读取本文件。
> **版本：** V1.0
> **冻结日期：** 2026-08-06

---

## Freeze Status

| 属性 | 值 |
|------|-----|
| **Project** | DialFactory |
| **Version** | V1.0 |
| **Phase** | Phase 4 · Production Tracking (Trial) |
| **Status** | **FROZEN** |
| **Approval** | [04-Schema-Final-Review.md](../../AI_CONTEXT/Phase1/04-Schema-Final-Review.md) |

---

## Frozen Documents

以下文件正式冻结。不可修改。

### Business Layer

| 文件 | 状态 |
|------|:----:|
| `AI_CONTEXT/10-Business-Model-V1.md` | **FROZEN** |

### Scope Layer

| 文件 | 状态 |
|------|:----:|
| `AI_CONTEXT/9-V1-Scope-Definition.md` | **FROZEN** |

### Architecture Layer

| 文件 | 状态 |
|------|:----:|
| `AI_CONTEXT/Phase0/ADL-Architecture-Decision-Log.md` | **FROZEN** |

### Database Layer

| 文件 | 状态 |
|------|:----:|
| `AI_CONTEXT/Phase1/01-Supabase-Schema-Plan.md` | **FROZEN** |

### Review Layer

| 文件 | 状态 |
|------|:----:|
| `AI_CONTEXT/Phase1/02-Schema-Review-Report.md` | ARCHIVED |
| `AI_CONTEXT/Phase1/03-Schema-Revision-Log.md` | ARCHIVED |
| `AI_CONTEXT/Phase1/04-Schema-Final-Review.md` | **APPROVED** |

---

## Current Schema Baseline

### Tables: 10

| # | 表名 | 说明 |
|:--|------|------|
| 1 | `departments` | 部门（制一/二/三/四/总QC） |
| 2 | `customers` | 客户 |
| 3 | `processes` | 工序目录（P01-P99） |
| 4 | `process_routes` | 工艺路线模板 |
| 5 | `route_steps` | 路线-工序关联 |
| 6 | `orders` | 订单 |
| 7 | `order_nodes` | 工序执行记录（核心追踪单元） |
| 8 | `exception_events` | 异常/质量事件 |
| 9 | `production_records` | 生产记录（工序级时间追踪，Phase 4） |
| 10 | `process_route_templates` | 路线模板（自动沉淀 + 签名去重，Phase 4） |

### Fields: 58

| 类别 | 数量 | 说明 |
|------|:----:|------|
| Business | 44 | 业务字段 |
| System | 9 | `id`, `created_at`, `updated_at` |
| Reserved | 5 | `second_route_id`, `specs`, `layer`, `is_outsourced`, `supplier_id` |
| **Total** | **58** | |

### Primary Key

| 策略 | 说明 |
|------|------|
| 类型 | `UUID` |
| 生成 | `gen_random_uuid()` |
| 命名 | `id` |

### Foreign Key Policy

| ON DELETE | 数量 | 适用范围 |
|-----------|:----:|---------|
| `RESTRICT` | 6 | 主数据 + 生产数据 + 模板数据保护 |
| `SET NULL` | 3 | 快照容错 + 预留字段 |
| `NO FK` | 1 | `exception_events.node_id` |
| `CASCADE` | **0** | — |

### Enum Strategy

| 策略 | 说明 |
|------|------|
| 方式 | `TEXT` + `CHECK` 约束 |
| 不使用 | PostgreSQL 原生 ENUM 类型 |
| 原因 | Supabase JS SDK 兼容性 |

### JSONB Fields

| 字段 | 表 | 用途 |
|------|-----|------|
| `route_snapshot` | `orders` | ADL-001：路线模板确认快照，含 `confirmed` 标记 |
| `specs` | `orders` | 柔性规格参数。键：`customer_order_no`（客户订单编号） / `order_quantity_raw`（AI 识别原始数量字符串） / `drawing_name`（订单资料文件名） / `drawing_path`（订单资料存储路径） |

### RLS Strategy

| Phase | 策略 |
|-------|------|
| V1 | `USING (true)` — 受信内网用户全权限 |
| V2 | 三角色分化（admin / worker / viewer）— 预设计，不在 V1 实施 |

### Field Semantics & Business Boundary

- **`orders.order_no`**：工厂订单编号（同时作为生产编号使用，如 `R45981`）。系统内无独立的「生产编号」字段。
- **颜色类信息（电镀颜色、板底颜色等）不属于订单创建字段**：一个订单可能包含多个颜色组合，订单基础信息无法准确表达；颜色、纹理、窗口、工艺特征等生产属性，后续由客户订单资料/图纸解析模块维护。

---

## ADL Freeze

以下架构决策已冻结，不可推翻。

| ID | 决策 | 批准日期 |
|----|------|:--------:|
| **ADL-001** | 路线模板 ≠ 生产路线。跟单员确认/调整工序，`route_snapshot` 记录 `confirmed` 标记 | 2026-08-06 |
| **ADL-002** | 返工由人工决策。系统不做自动返工路由。`processes` 表无 `rework_strategy` 字段 | 2026-08-06 |
| **ADL-003** | 节点四态模型：waiting / active / done / paused。移除 handing_off | 2026-08-06 |

### ADP Freeze

| ID | 决策 | 批准日期 |
|----|------|:--------:|
| **ADP-001** | 多规格订单：A/B 编号拆分 + `specs` JSONB。不引入 `order_variants` | 2026-08-06 |
| **ADP-002** | 上下层流程：不使用 DAG。独立订单 + `layer` 标记 | 2026-08-06 |
| **ADP-003** | 挪用业务：V1 使用 `note` 记录。不建模库存关系 | 2026-08-06 |
| **ADP-004** | 物料：复用 `orders` 模型。不新增 `materials` 实体 | 2026-08-06 |
| **ADP-005** | 总QC：显式节点纳入路线。部门QC 动态追加 | 2026-08-06 |

---

## Change Management Rule

任何对冻结内容的修改必须经过以下流程：

```
1. 提交 Change Proposal
   ├── 为什么修改
   ├── 影响哪些表
   ├── 是否影响业务模型
   └── 是否影响 ADL / ADP

2. 重新 Review

3. 人工审批

4. 更新 Freeze Manifest + 版本号
```

### 禁止事项

| # | 禁止行为 |
|:--|---------|
| 1 | AI 自动优化 Schema |
| 2 | AI 新增字段 |
| 3 | AI 新增实体（表） |
| 4 | AI 修改 FK 关系 |
| 5 | AI 修改状态机（ADL-003） |
| 6 | AI 修改 ON DELETE 行为 |
| 7 | 未经 Change Proposal 的任何 DDL 变更 |

---

> **V1.0 Freeze · 2026-08-06 · Phase 1-A Closed**

---

## V1.1 Amendments (post-freeze, 2026-08-21)

| 变更 | 说明 |
|------|------|
| 新增表 `production_records` | 工序级生产时间追踪（migration 003） |
| 新增表 `process_route_templates` | 自动沉淀路线模板，签名去重（migration 004/006） |
| 新增订单状态 `cancelled` | 订单取消（migration 007） |
| RLS 收紧 | 由 `USING (true)` 改为 `authenticated` 角色可读写（migration 009，需登录） |
| 约束/触发器 | 数量与时长 CHECK、`set_duration_minutes`、`set_updated_at`（migration 010） |
| `drawings` 桶/策略 | storage bucket + 最小权限策略入迁移（migration 008） |
| `production_records.node_id` | 关联 `order_nodes`，区分同名返工/追加节点（migration 011） |
