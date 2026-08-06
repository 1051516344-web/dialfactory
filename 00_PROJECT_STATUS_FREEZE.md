# DialFactory Project Status Freeze

> 本文件是 DialFactory 项目的**唯一状态入口**。所有阶段性结论在此声明。不包含分析过程，不重复业务细节。

---

## 1. 项目当前阶段

| 阶段 | 状态 |
|------|------|
| **Current Phase** | Phase 1-A — Schema Review |
| **Previous Phase** | Phase 0 — Reverse Engineering (Completed) |
| **Previous Phase** | Phase 1-A — Schema Design (Completed) |

### 当前任务

**Schema Review — Supabase 实施前最终审查。**

当前禁止：
- ❌ 进入 Supabase 建表
- ❌ 生成 SQL 执行文件
- ❌ 写代码
- ❌ 修改 V1 Scope
- ❌ 修改 Business Model

---

## 2. 项目定位

DialFactory 是**钟表表盘工厂轻量级生产数据追踪系统**。

**目标：** 记录订单从生产开始到总QC完成的完整生产轨迹，以及质量事件。

**不是：**
- ERP
- MES
- 自动排产系统

---

## 3. 已冻结成果

Phase 0 已完成，以下产出物视为**冻结成果**，只能作为参考，不允许直接修改。

| # | 文件 | 内容 |
|---|------|------|
| 1 | `AI_CONTEXT/Phase0/01-Business-Language-Mapping.md` | 30条工厂术语 → V1 字段五维映射 |
| 2 | `AI_CONTEXT/Phase0/Phase0-A.2-Model-Gap-Analysis.md` | 5个模型缺口 → 最小调整方案 |
| 3 | `AI_CONTEXT/Phase0-A.2-Route-Architecture-Review.md` | 路线架构审查：模板≠生产路线 |
| 4 | `AI_CONTEXT/Phase0/ADL-Architecture-Decision-Log.md` | 架构决策日志（ADL-001 ~ ADL-003） |
| 5 | `AI_CONTEXT/Phase0/03-Field-Maturity-Rating.md` | 52个字段 L1/L2/L3 评级 |
| 6 | `AI_CONTEXT/Phase0/04-Historical-Data-Validation.md` | 数据采集模板验证 + 26项现场确认回答 |
| 7 | `AI_CONTEXT/Phase0/05-Real-Data-Deep-Dive.md` | 471行真实订单解码，流程符号映射 |
| 8 | `AI_CONTEXT/Phase0/06-Architecture-Impact-Assessment.md` | 5项影响判定 + ADP-001~005 |

---

## 4. V1 架构冻结声明

### 4.1 核心表（8张，不可增减）

| # | 表名 | 说明 |
|---|------|------|
| 1 | `departments` | 部门（制一/二/三/四/总QC） |
| 2 | `customers` | 客户（16家已确认） |
| 3 | `processes` | 工序目录（P01-P35，35道已确认） |
| 4 | `process_routes` | 路线模板 |
| 5 | `route_steps` | 路线-工序关联 |
| 6 | `orders` | 订单 |
| 7 | `order_nodes` | 工序执行记录（核心追踪单元） |
| 8 | `exception_events` | 异常/质量事件 |

### 4.2 禁止事项

- ❌ 新增实体（表）
- ❌ 修改核心关系（FK 结构）
- ❌ 推翻 Phase 0 决策

---

## 5. 当前核心设计原则

1. **路线模板 ≠ 生产路线。** 订单创建时由业务人员确认/调整实际执行的工序。
2. **系统不自动推导生产路线。** AI 推荐延后至 V1.5+。
3. **生产过程中支持动态追加节点。** 包括：返工、重洗、QC、特殊处理。
4. **order_nodes = 真实生产轨迹。** UUID 替代索引，支持任意位置插入。
5. **事件日志追加，不覆盖。** 所有状态变更可回溯。

---

## 6. Architecture Decision Freeze

以下决策已在 Phase 0-B 最终判定，不可推翻。

| ID | 决策 | 判定 |
|----|------|------|
| **ADP-001** | 多规格订单采用 A/B 订单编号拆分 + `orders.specs` JSONB 记录变体。V1 不引入 `order_variants` 实体 | 不阻塞 V1 |
| **ADP-002** | 上下层流程不使用 DAG 模型。采用独立订单（A/B 拆分）或同一订单线性展开 + `order_nodes.layer` 标记 | 不阻塞 V1 |
| **ADP-003** | 挪用业务 V1 使用 `note` 文本记录。不建模跨订单库存关系 | 不阻塞 V1 |
| **ADP-004** | 胶圈/铜圈 H 订单复用 `orders` 模型，不新增 `materials` 实体 | 不阻塞 V1 |
| **ADP-005** | 总QC（P35）作为显式节点纳入路线模板。部门QC（P23-P25）不纳入路线模板，需要时动态追加 | 不阻塞 V1 |

---

## 7. 当前下一阶段

### Phase 1-B — Supabase Implementation

**入口条件：** Phase 1-A Schema Review 通过。

**目标：** 在 Supabase 中执行 DDL，建立 8 张表、索引、RLS 策略。

**前置产出：** `AI_CONTEXT/Phase1/01-Supabase-Schema-Plan.md`

**当前禁止（在 Review 通过前）：**
- ❌ 写代码
- ❌ 创建数据库
- ❌ 执行 SQL
- ❌ 新增功能
- ❌ 修改 V1 Scope

---

## 8. AI 协作规范

项目根目录 `01_PROJECT_AI_GUIDE.md` 定义了 AI 进入项目后的行为规范，包括：
- 强制读取顺序
- 文件权限等级（L0-L3）
- 数据流方向
- Phase 切换规则
- 执行前检查清单

**任何 AI 必须在执行任务前先读取 `01_PROJECT_AI_GUIDE.md`。**

---

> **最后更新：** 2026-08-06
> **Phase 0 关闭日期：** 2026-08-06
> **Phase 1-A Schema Design 完成日期：** 2026-08-06
