# DialFactory Phase 0-A.2 · 模型缺口影响分析

> 状态：Phase 0 执行中
> 前置：Phase 0-A 业务语言映射（01-Business-Language-Mapping.md）
> 输入：5 个已识别的模型缺口
> 原则：不重构系统，只做最小必要调整
> 方法：逐缺口判定 → 是否改表结构 / 是否加实体 / 是否加字段 / 是否延后

---

## 一、分析框架

对每个缺口，回答 4 个判定问题：

| 判定维度 | 含义 | 触发条件 |
|----------|------|---------|
| **改表结构？** | 是否需要 ALTER TABLE / 新建表 / 改关系 | 当前表结构无法承载该业务信息 |
| **新增实体？** | 是否需要新表（一级实体） | 该概念有独立生命周期、需持久记录、无法附属于现有表 |
| **仅加字段？** | 是否在现有表上增加列即可 | 该概念附属于现有实体，只是属性缺失 |
| **延后 V1.5？** | 是否不在 V1 处理 | 该概念不阻塞 V1 核心流转、或依赖尚未确认的信息 |

### 判定优先级

```
优先加字段 > 新建实体 > 改表结构
优先 V1 可处理 > 延后 V1.5
```

---

## 二、逐缺口分析

---

### GAP-1 · 工序粒度不足

**来源：** 工厂语言库暴露 ~20 道工序，V1 示例仅 9 道。车床包含 4 种子类型（车窗/车圈/车唱片纹/车CD纹）。

**V1 当前承载能力检查：**

```sql
-- V1 processes 表（9-V1-Scope-Definition.md §5.3）
CREATE TABLE processes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT NOT NULL UNIQUE,    -- P01-P99
    name            TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT '加工',
    default_dept_id UUID REFERENCES departments(id),
    is_required     BOOLEAN DEFAULT false,
    is_active       BOOLEAN DEFAULT true
);
```

**分析：**

| 维度 | 判定 |
|------|------|
| 改表结构？ | **否。** `processes` 表设计已支持任意数量的工序。P01-P99 编号空间充足（99个）。"子类型"可以通过两种方式承载：(a) 分别建为独立工序 P01a车窗/P01b车圈，或 (b) 建为 P01 车床加工 + 订单参数区分。两种方式均不需要改表结构 |
| 新增实体？ | **否。** 不需要工序组（ProcessGroup）实体。V1 的扁平结构已足够——扁平工序清单匹配工厂"P01-P99 编号体系"的单一维度 |
| 仅加字段？ | **否。** 当前字段足够。`code` + `name` + `type` 已能区分车床的不同子类型 |
| 延后 V1.5？ | **否。** 但 V1 建表时只需预置**当前路线实际使用的工序**，不需要预置全部 20+ 道 |

**关键判断：** "车床有 4 种子类型"不是数据库设计问题，是**数据初始化问题**。V1 的 `processes` 表是扁平字典，4 种子类型 = 4 行记录。

**V1 操作决策：**

```
决策：不修改 processes 表结构。

V1 需要工厂提供的只是：
  "当前使用的 3-5 条路线中，每一条包含哪些工序？"

工厂语言库中的 20+ 道工序不需要全部预置。
仅预置路线中实际引用的工序即可。
未使用的工序——以后用到再加，一条 INSERT 的事。
```

**唯一风险点：** 如果"车床"的子类型在工厂实践中不是"互斥选择"而是"顺序执行"（先车窗→再车圈→再车CD纹），则需要确认它们之间的顺序依赖。这不影响表结构，但影响路线步骤的定义。

---

### GAP-2 · 表盘多层结构

**来源：** "上层面""下层面""组装"三个术语共同暗示表盘可能是多层结构。如果上下层独立加工，"一条订单 = 一条路线"的模型假设可能错误。

**V1 当前模型假设：**

```
订单 → 选择 1 条路线 → 展开为 1 组节点（线性序列）
```

**如果表盘是多层且分开加工，则现实是：**

```
订单
├── 上层路线 → 上层节点序列 ──┐
├── 下层路线 → 下层节点序列 ──┼── 组装节点 → 后续节点 → QC
└── （可能共享的后续工序） ──┘
```

**分析：**

这是 5 个缺口中**唯一可能触发表结构变更**的缺口。但触发的前提是：工厂确认上下层**分别独立加工、路线不同**。

| 场景 | 概率 | V1 影响 |
|------|------|---------|
| **场景A：上下层是同一块粗胚的两面，同时加工** | 较高 | 无影响。当前模型完全适配。 |
| **场景B：上下层是两个独立零件，但路线相同** | 中等 | 无影响。节点数量翻倍但路线结构不变。 |
| **场景C：上下层是两个独立零件，路线不同** | 较低 | **需要模型调整。** 订单需要支持多条并行路线。 |
| **场景D：只有部分订单是多层（如特定客户的高端产品线）** | 中等 | V1 可能需要区分"单层订单"和"多层订单"。 |

**逐场景的最小调整方案：**

#### 场景 A（同一粗胚两面）：无需任何调整

```
确认方式：问工厂 "上层面和下层面是同一个物理零件的正面和反面吗？"
如果回答"是" → GAP-2 关闭，无风险。
```

#### 场景 B（两零件、同路线）：V1 可承载，不加字段

```
方案：创建订单时，如果选了"多层"类型，路线展开时生成两套节点：
  上层-制一 → 上层-制二 → ... → 上层-组装前
  下层-制一 → 下层-制二 → ... → 下层-组装前
  组装 → 后续共享节点 → QC

order_nodes.seq 重新编号即可。
不需要改表结构。节点天然支持同一订单多条记录。
```

**但需要一个标记来区分"这个节点属于上层还是下层"。**

→ 这就是"仅加字段"：`order_nodes.layer` TEXT (nullable, 可选值 'upper'/'lower'/NULL)

#### 场景 C（两零件、不同路线）：需要最小调整

```
方案：orders 表增加 second_route_id 字段。
  orders.route_id      → 上层路线
  orders.second_route_id → 下层路线（nullable, 默认 NULL）

创建订单时：
  - 如果 second_route_id IS NULL → 单路线（当前行为）
  - 如果 second_route_id IS NOT NULL → 展开两条路线，生成两套节点
```

→ 这是"仅加字段"：`orders.second_route_id UUID REFERENCES process_routes(id)` (nullable)

→ 再加：`order_nodes.layer TEXT` (nullable)

**不需要新建实体。不需要改现有关系。**

#### 场景 D（部分订单多层）：同场景 B/C 方案

**汇总判定：**

| 判定维度 | 结论 |
|----------|------|
| 改表结构？ | **大概率不需要。** 最坏情况是场景C：在 `orders` 加 1 个可空外键，在 `order_nodes` 加 1 个可空文本字段。不改变任何已有列、不改变关系结构 |
| 新增实体？ | **否。** 上下层不是独立实体——它们共享订单号、交期、客户。独立建表过度建模 |
| 仅加字段？ | **是（如果场景B/C/D确认）。** `order_nodes.layer` TEXT + `orders.second_route_id` UUID（仅场景C） |
| 延后 V1.5？ | **不延后。** 如果工厂确认多层结构，V1 必须支持——否则无法正确展示订单的工序流程。但**可以先不做，等工厂回答后再决定** |

**V1 操作决策：**

```
决策：V1 数据库建表时，预留以下字段（不影响 V1 核心流转）：

  order_nodes.layer TEXT DEFAULT NULL
    -- NULL = 不适用（单层订单或组装后的共享节点）
    -- 'upper' = 上层面
    -- 'lower' = 下层面

  orders.second_route_id UUID DEFAULT NULL
    -- 仅当工厂确认"上下层路线不同"时启用
    -- 默认 NULL = 单路线模式（V1 最初设计）

如果工厂确认场景 A（同一零件两面）：
  → 两个预留字段永远不使用。零成本。

如果工厂确认场景 B/C/D：
  → 两个字段已在表中，无需迁移。
  → V1 前端在"创建订单"时增加一个选项："多层订单？"
```

---

### GAP-3 · 物料/组件缺失

**来源：** 7 个物料术语——胶圈、铜圈、平面圈、圈（小铜圈）、铜片、银钉、铜板钉——在 V1 模型中没有对应的承载位置。

**分析：**

物料缺失要拆成两个子问题：

#### 子问题 3a：物料作为"订单规格"（specification）

银钉 vs 铜板钉：这是客户要求的规格差异。等同于"用什么钉子"。

| 判定维度 | 结论 |
|----------|------|
| 改表结构？ | **否** |
| 新增实体？ | **否。** 物料规格不是独立实体，是订单的属性 |
| 仅加字段？ | **可以考虑。** `orders.specs JSONB` 替代当前 3 个固定字段（base_texture/plate_color/sand_type），容纳不同路线需要的不同规格参数，包括字钉类型 |
| 延后 V1.5？ | **看情况。** 如果工厂确认 V1 的 3 个规格字段（纹理/颜色/喷砂）不够用，改用 `specs JSONB` 是最小改动 |

**方案对比：**

```
方案A（V1 当前）：3 个固定字段
  orders.base_texture  -- 无底纹/太阳纹/CD纹
  orders.plate_color    -- 银白60s/金色/玫瑰金
  orders.sand_type      -- 重砂/轻砂/中砂/-

  问题：字钉类型（银钉/铜板钉）没地方放。
       搪瓷/喷漆/消光没地方放。

方案B（最小调整）：增加 1 个 JSONB 字段
  orders.specs JSONB DEFAULT '{}'
  -- 示例：{"base_texture":"太阳纹","plate_color":"银白60s","sand_type":"轻砂","stud_type":"银钉","finish":"哑光"}

  原有的 3 个固定字段可以保留（便于查询）或废弃（减少冗余）。
  推荐：保留 base_texture/plate_color/sand_type（高频查询），specs 存放额外信息。
```

**建议：采用方案 B，保留 3 个固定字段 + 新增 `orders.specs JSONB`。**

这不增加 V1 录入负担——跟单员创建订单时，specs 的内容随路线动态展示。选了"标准路线"→ 自动显示该路线需要的规格参数。

#### 子问题 3b：物料作为"追踪对象"（tracking）

胶圈/铜圈采购→验收→使用的流转路径。

| 判定维度 | 结论 |
|----------|------|
| 改表结构？ | **否。** V1 明确不覆盖库存管理（属于 ERP 范畴） |
| 新增实体？ | **否。** 不需要 `materials` / `inventory` 表。这是采购和库存的事 |
| 仅加字段？ | **否。** 没有字段可加——物料追踪需要独立的多条记录（采购日期、验收状态、使用订单），不是订单的一个属性 |
| 延后 V1.5？ | **是。** V1 不追踪物料流转。跟单员口头/微信管理即可。V1 运行 3 个月后评估是否需要 |

**汇总判定：**

| 子问题 | 改表结构 | 新增实体 | 仅加字段 | 延后 V1.5 |
|--------|---------|---------|---------|----------|
| 3a 物料作为规格 | 否 | 否 | ✅ `orders.specs JSONB` | 否 |
| 3b 物料作为追踪 | 否 | 否 | 否 | ✅ 是 |

**V1 操作决策：**

```
决策：
  V1 建表时增加 orders.specs JSONB DEFAULT '{}'
    — 存放银钉/铜板钉、搪瓷/喷漆类型、消光程度等"3个固定字段装不下"的规格参数
    — 该字段不强制填写，不参与流转逻辑
    — 仅用于订单信息展示

  V1 不建 materials 表、不追踪物料流转。
    胶圈/铜圈采购 → 口头管理。
    如果 V1 运行 3 个月后，跟单员频繁在备注中记录物料信息再评估。
```

---

### GAP-4 · 库存挪用关系

**来源：** "挪用45479"——使用之前订单的库存来满足当前订单。

**业务语义还原：**

```
正常订单 #0088：订单数量 500 → 制一至QC全流程 → 产出 500
挪用订单 #0089：订单数量 500 → 制一至QC全流程 → 产出 300 + 挪用 #0088 库存 200
```

**问题：** V1 如果只在 `order_nodes.qty_out` 记录 "QC产出500"，这 500 中有 200 不是自产的，统计"制一~制四的损耗率"会出错。

**分析：**

| 判定维度 | 结论 |
|----------|------|
| 改表结构？ | **否。** V1 不覆盖库存管理。挪用是"产出来源"问题，不是"工序追踪"问题 |
| 新增实体？ | **否。** 挪用本质上是一个备注信息（"这 200 件来自订单 #XXXX"），不需要独立表 |
| 仅加字段？ | **可加可不加。** 加：`order_nodes.qty_reused INTEGER` + `order_nodes.reuse_source TEXT`。不加：用 `note` 记录 |
| 延后 V1.5？ | **是。** V1 的核心目标是"订单在哪、卡了多久、有什么问题"。挪用不影响这三个问题的回答 |

**深层分析：为什么挪用在 V1 可以不受管控？**

1. **挪用不影响工序流转。** 挪用的 200 件走的是同样路线还是直接跳到总QC？——这不重要。系统的核心功能是推进节点状态，挪用的产品一样要走节点。
2. **挪用的统计影响是可接受的。** V1 本身只有总QC一个节点强制填 `qty_out`。如果跟单员在QC节点填"产出500"，统计时良率 = 500/500 = 100%。如果其中有200是挪用的，良率虚高——但 V1 不做 BI，良率虚高不影响系统功能。
3. **V1 不需要"万全数据"，需要"可用的数据"。** 

**V1 操作决策：**

```
决策：
  V1 不对"挪用"做任何建模。
  跟单员在 order_nodes.note 中自由记录 "挪用订单#45479库存200件"。
  
  不新增字段。不新增实体。不改表结构。

  V1.5 评估：如果挪用在真实运营中频繁发生（每月 > 5次），
  且确实污染了统计（管理层依赖QC良率数据做决策），
  则在 order_nodes 增加 qty_reused + reuse_source 字段。
```

---

### GAP-5 · 暂停原因分类

**来源：** "待办"（等待客户确认）与通用"暂停"未区分。

**业务语义还原：**

当前 V1 模型：
```
order_nodes.status = 'paused'  -- 只知道停了，不知道为什么停
```

工厂实际有多种暂停原因：
| 现象 | 工厂怎么说 | 对应场景 |
|------|-----------|---------|
| 等客户确认 | "待办" | 客户对颜色/样品有疑义，暂停等反馈 |
| 等物料 | "缺铜圈"/"等胶圈" | 组件未到，工序无法继续 |
| 等排期 | "等槽" | 电镀槽排不上，在排队 |
| 客户主动暂停 | — | 客户说"先别做，等我通知" |
| 质量问题暂停 | — | 发现异常，等待处理决策 |

**分析：**

| 判定维度 | 结论 |
|----------|------|
| 改表结构？ | **否。** |
| 新增实体？ | **否。** 暂停原因不是独立实体——它附属于节点的 paused 状态 |
| 仅加字段？ | **是。** `order_nodes.pause_reason TEXT` (nullable)。仅当 status='paused' 时有值 |
| 延后 V1.5？ | **不建议延后。** 原因：(a) 字段成本极低（一个可空TEXT列），(b) 回答"为什么停"是 V1 的核心问题Q3，(c) 跟单员点"暂停"时顺手选一个原因，不增加操作负担 |

**字段设计：**

```sql
order_nodes.pause_reason TEXT DEFAULT NULL
  -- NULL = 未暂停
  -- 预设可选值（跟单员可自定义）：
  --   'waiting_customer'  = 待客户确认
  --   'waiting_material'  = 待物料
  --   'waiting_schedule'  = 待排期
  --   'customer_hold'     = 客户要求暂停
  --   'quality_hold'      = 质量问题待处理
  --   'other'             = 其他
```

**V1 前端行为：**
- 跟单员点"暂停"→ 弹出预设原因列表（5-6 个选项 + 自定义文本）
- 不选原因也可以暂停（`pause_reason` 可空）
- 恢复时清除 `pause_reason`（设回 NULL）

**V1 操作决策：**

```
决策：
  V1 建表时增加 order_nodes.pause_reason TEXT DEFAULT NULL。
  
  这是 5 个缺口中唯一一个"确定要在 V1 加字段"的项。
  理由：
    - 成本极低（一个 TEXT 列）
    - 直接服务于 V1 核心问题 Q3
    - 不增加操作负担（选一下即可，不选也可以）
```

---

## 三、V1 表结构变更汇总

基于以上 5 个缺口分析，V1 的 8 张表需要以下调整：

### 变更清单

| # | 表 | 变更类型 | 字段 | 触发条件 | V1 是否执行 |
|---|-----|---------|------|---------|------------|
| **C1** | `order_nodes` | 加字段 | `pause_reason TEXT DEFAULT NULL` | 无条件 | ✅ **V1 执行** |
| **C2** | `order_nodes` | 加字段 | `layer TEXT DEFAULT NULL` | GAP-2 确认多层 | ⚠️ **V1 预留** |
| **C3** | `orders` | 加字段 | `second_route_id UUID DEFAULT NULL` | GAP-2 确认场景C | ⚠️ **V1 预留** |
| **C4** | `orders` | 加字段 | `specs JSONB DEFAULT '{}'` | GAP-3a 确认规格不足 | ⚠️ **V1 预留** |
| ~~C5~~ | ~~`order_nodes`~~ | ~~加字段~~ | ~~`qty_reused` / `reuse_source`~~ | — | ❌ **不执行，延后 V1.5** |
| ~~C6~~ | ~~新建表~~ | ~~`materials`~~ | — | — | ❌ **不执行，延后 V1.5** |

### 执行分级

```
V1 建表时必须包含（1项）：
  ✅ C1: order_nodes.pause_reason

V1 建表时预留（3项，默认 NULL，不用则零成本）：
  ⚠️ C2: order_nodes.layer
  ⚠️ C3: orders.second_route_id
  ⚠️ C4: orders.specs

V1 明确不包含（延后V1.5+）：
  ❌ 物料追踪（materials 表）
  ❌ 库存挪用（qty_reused / reuse_source）
  ❌ 工序组层次（process_groups 表）
```

### V1 最终 DDL 变更（仅变更部分）

```sql
-- orders 表变更
ALTER TABLE orders ADD COLUMN specs JSONB DEFAULT '{}';
ALTER TABLE orders ADD COLUMN second_route_id UUID;  -- 预留，可空

-- order_nodes 表变更
ALTER TABLE order_nodes ADD COLUMN pause_reason TEXT DEFAULT NULL;
ALTER TABLE order_nodes ADD COLUMN layer TEXT DEFAULT NULL;  -- 预留，可空
```

---

## 四、变更后的 V1 数据模型

### 完整表结构（含 Phase 0-A.2 变更）

```sql
-- ============================================
-- 主数据表（无变更）
-- ============================================

CREATE TABLE departments (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name    TEXT NOT NULL,        -- 制一/制二/制三/制四/总QC
    seq     INTEGER NOT NULL
);

CREATE TABLE customers (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name    TEXT NOT NULL,
    code    TEXT
);

-- ============================================
-- 工艺表（无变更）
-- ============================================

CREATE TABLE processes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT '加工',
    default_dept_id UUID REFERENCES departments(id),
    is_required     BOOLEAN DEFAULT false,
    is_active       BOOLEAN DEFAULT true
);

CREATE TABLE process_routes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    is_active   BOOLEAN DEFAULT true
);

CREATE TABLE route_steps (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id    UUID NOT NULL REFERENCES process_routes(id),
    process_id  UUID NOT NULL REFERENCES processes(id),
    seq         INTEGER NOT NULL
);

-- ============================================
-- 业务表（含 Phase 0-A.2 变更）
-- ============================================

CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_no        TEXT NOT NULL UNIQUE,
    customer_id     UUID REFERENCES customers(id),
    order_qty       INTEGER NOT NULL,
    due_date        DATE NOT NULL,
    route_id        UUID REFERENCES process_routes(id),
    -- Phase 0-A.2 变更 C3（预留）：多层订单的第二条路线
    second_route_id UUID DEFAULT NULL REFERENCES process_routes(id),
    -- Phase 0-A.2 变更 C4（预留）：柔性规格字段
    specs           JSONB DEFAULT '{}',
    status          TEXT DEFAULT 'in_production',  -- 自动计算
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE order_nodes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id),
    process_id      UUID REFERENCES processes(id),
    process_name    TEXT,
    dept_id         UUID REFERENCES departments(id),
    dept_name       TEXT,
    status          TEXT DEFAULT 'waiting',
    seq             INTEGER NOT NULL,
    rework_pass     INTEGER DEFAULT 0,
    -- Phase 0-A.2 变更 C1：暂停原因
    pause_reason    TEXT DEFAULT NULL,
    -- Phase 0-A.2 变更 C2（预留）：多层表盘的层级标记
    layer           TEXT DEFAULT NULL,
    qty_out         INTEGER,
    is_outsourced   BOOLEAN DEFAULT false,
    supplier_id     UUID,
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE exception_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id         UUID NOT NULL,
    type            TEXT NOT NULL,
    qty             INTEGER NOT NULL,
    resolution      TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 变更对比 V1 Scope 定义（9-V1-Scope-Definition.md）

| 维度 | V1 Scope 原定义 | Phase 0-A.2 后 | 变化 |
|------|----------------|----------------|------|
| 表数量 | 8 | 8 | 无变化 |
| orders 字段数 | 8 | 10 (+specs, +second_route_id) | +2（均预留可空） |
| order_nodes 字段数 | 10 | 12 (+pause_reason, +layer) | +2（1个确定+1个预留） |
| 新建表 | 0 | 0 | 无 |
| V1 核心业务字段数 | ~40 | ~44 | +4 |

---

## 五、变更对 V1 前端的影响评估

| 变更 | 前端影响 | 工作量 |
|------|---------|--------|
| C1 `pause_reason` | 暂停按钮 → 弹出原因选择框（5-6 个预设 + 自定义）。Paused 节点卡片显示原因标签 | **低** (~30行JS) |
| C2 `layer` | 如果启用：流程图在节点卡片上加层级标记（"上"/"下"）。如果未启用：零工作量 | **低** (~15行JS) |
| C3 `second_route_id` | 如果启用：创建订单页增加"多层订单"选项 → 选择第二条路线 | **中** (~50行JS) |
| C4 `specs` | 订单详情页展示 JSON 内容。创建订单时根据路线动态显示规格输入项 | **中** (~60行JS) |

**C3/C4 仅在工厂确认相应需求后才启用。V1 首版可以不暴露这两个字段。**

---

## 六、延后项路线图

| 延后项 | 延后原因 | 触发条件 | 目标版本 |
|--------|---------|---------|----------|
| `materials` 表 | 物料追踪属库存管理，V1 排除 | 跟单员频繁在备注中记录物料信息 | V1.5 |
| `qty_reused` / `reuse_source` | 挪用的统计影响在 V1 可接受 | 挪用频率 > 5次/月，且管理层依赖QC良率 | V1.5 |
| `process_groups` 表 | 工序组层次 V1 扁平结构已足够 | 工厂出现 > 30 道工序且分组管理成为刚需 | V2 |
| `handoffs` 表 | V1 日常流转自动推进已满足 | 部门间出现数量争议且需系统留证 | V1.5 |
| `suppliers` 表 + 外协模块 | 外协可通过备注+手动推进模拟 | 外协频率 > 10次/月且催办成为痛点 | V1.5 |

---

## 七、总结

### Phase 0-A.2 结论

**5 个缺口中：**

| 缺口 | 结论 | V1 动作 |
|------|------|---------|
| GAP-1 工序粒度 | 数据初始化问题，非表结构问题 | 无表结构变更。工厂只需提供路线中实际使用的工序清单 |
| GAP-2 多层结构 | 可能需加字段，但先等工厂确认 | V1 预留 `order_nodes.layer` + `orders.second_route_id` |
| GAP-3 物料缺失 | 规格 → 加 JSONB；追踪 → 延后 | V1 加 `orders.specs JSONB` |
| GAP-4 库存挪用 | 不阻塞 V1 核心流转 | 延后 V1.5 |
| GAP-5 暂停原因 | 成本极低，直接服务于 Q3 | V1 加 `order_nodes.pause_reason TEXT` |

**V1 新增字段总计：4 个**（1 个确定 + 3 个预留）。
**V1 新建表：0 个。**
**V1 表数量：维持 8 张。**
**V1 核心假设：未被推翻。**

### Phase 0-A 整体产出

```
Phase 0-A   01-Business-Language-Mapping.md    30条术语 → V1字段映射
Phase 0-A.2 本文档                             5个缺口 → 最小调整方案
```

### 下一步

1. 将 35 个待确认问题（来自 Phase 0-A）+ 5 个缺口的判定条件提交工厂
2. 获得反馈后更新 C2/C3/C4 的"预留 → 启用"状态
3. 确认后进入 Phase 0-B：使用 `01_Historical_Order_Data.xls` 验证工序推进逻辑

---

> **Phase 0-A 的核心结论：V1 8 张表的骨架不需要改动。最多加 4 个字段。没有新增实体的必要。没有重构的理由。工厂语言库证实了 V1 方向正确，暴露的缺口都在可控范围内。**
