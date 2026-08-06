# DialFactory Phase 1-A · Supabase Schema Plan

> **状态：** Revision Completed — 等待重新 Review
> **阶段：** Phase 1-A — Schema Revision
> **原则：** 不修改业务模型、不新增实体、不改变 ADP 决策、仅输出实施设计
> **基于：** 10-Business-Model-V1.md（冻结）+ 9-V1-Scope-Definition.md + Phase 0-A.2 Gap Analysis + ADL-001/002/003
> **修订依据：** [02-Schema-Review-Report.md](02-Schema-Review-Report.md) — CRIT-001 / WARN-001~004

---

## 一、8 张表关系确认

### 1.1 ER 关系总览

```
customers (1) ──────── (N) orders
                            │
                            │ (1) route_id
                            ▼
                       process_routes (1) ──────── (N) route_steps (N) ──────── (1) processes
                            │                                                       │
                            │ (N) second_route_id (预留, nullable)                  │ (N) default_dept_id
                            ▼                                                       ▼
orders (1) ──────── (N) order_nodes (N) ──────── (1) processes                 departments
  │                          │                      (快照: process_name)            │
  │                          │ (N) dept_id ─────────────────────────────────────────┘
  │                          │    (快照: dept_name)
  │                          │
  │                          │ (1) order_nodes ──────── (N) exception_events
  │                          │    (返工: 同 order_id + process_id, rework_pass 递增)
  │                          │
  ▼                          ▼
  (route_snapshot JSONB)   (seq 排序)
```

### 1.2 关系基数矩阵

| 父表 | 子表 | 基数 | 关联字段 | 说明 |
|------|------|------|---------|------|
| `customers` | `orders` | 1:N | `customer_id` | 一个客户可下多个订单 |
| `orders` | `order_nodes` | 1:N | `order_id` | 一张订单展开为多条节点 |
| `process_routes` | `orders` | 1:N | `route_id` | 一条路线可被多张订单引用 |
| `process_routes` | `route_steps` | 1:N | `route_id` | 一条路线包含多个步骤 |
| `processes` | `route_steps` | 1:N | `process_id` | 一道工序可出现在多条路线中 |
| `departments` | `processes` | 1:N | `default_dept_id` | 一道工序默认归属一个部门 |
| `processes` | `order_nodes` | 1:N | `process_id` | 一道工序可被多条节点引用（快照） |
| `departments` | `order_nodes` | 1:N | `dept_id` | 一个部门可关联多条节点（快照） |
| `order_nodes` | `exception_events` | 1:N | `node_id` | 一条节点可记录多个异常 |
| `order_nodes` | `order_nodes` (返工) | 1:N | `order_id` + `process_id` | 同订单同工序多次执行，`rework_pass` 区分 |

### 1.3 关键业务规则（来自 ADL）

| 规则 | 来源 | 数据库体现 |
|------|------|-----------|
| 路线模板是建议集，非强制集 | ADL-001 | `orders.route_snapshot` JSONB 记录每步 `confirmed` 标记 |
| 仅 confirmed=true 的工序展开为 order_nodes | ADL-001 | 应用层逻辑，建表时不强制 |
| 跟单员可动态追加节点（seq 自动重算） | ADL-001 | `order_nodes` 支持同订单任意 `seq` 插入 |
| 返工由人工决策，不做系统自动路由 | ADL-002 | `processes` 表无 `rework_strategy` 字段 |
| 快捷返工：同工序 rework_pass+1 | ADL-002 | `order_nodes.rework_pass` 语义：同工序+1，新工序=0 |
| 动态追加新工序：rework_pass=0 | ADL-002 | 同上 |
| 节点四态：waiting/active/done/paused | ADL-003 | `order_nodes.status` CHECK 约束，移除 handing_off |
| 订单状态自动计算（三态） | ADL-003 | `orders.status` 由 order_nodes 聚合推导，不手动设置 |

---

## 二、字段 DDL 映射

### 2.1 departments（部门）— 预置数据，V1 无 CRUD

| 业务字段 | PostgreSQL 类型 | 约束 | 成熟度 | 说明 |
|---------|----------------|------|--------|------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | — | 系统生成 |
| `name` | `TEXT` | `NOT NULL` | L1 | 制一/制二/制三/制四/总QC |
| `seq` | `INTEGER` | `NOT NULL` | L1 | 1→2→3→4→5 线性顺序 |
| `type` | `TEXT` | `NOT NULL DEFAULT 'production'` | L2 | production / qc |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT now()` | — | 系统字段 |

**DDL：**
```sql
CREATE TABLE departments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    type        TEXT NOT NULL DEFAULT 'production'
        CHECK (type IN ('production', 'qc')),
    created_at  TIMESTAMPTZ DEFAULT now()
);
```

**预置数据：**
```sql
INSERT INTO departments (name, seq, type) VALUES
    ('制一', 1, 'production'),
    ('制二', 2, 'production'),
    ('制三', 3, 'production'),
    ('制四', 4, 'production'),
    ('总QC', 5, 'qc');
```

---

### 2.2 customers（客户）— 预置数据，V1 无 CRUD

| 业务字段 | PostgreSQL 类型 | 约束 | 成熟度 | 说明 |
|---------|----------------|------|--------|------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | — | 系统生成 |
| `name` | `TEXT` | `NOT NULL` | L3 | 客户全称 |
| `code` | `TEXT` | 可空 | L3 | 短码，如 "C01" |
| `is_active` | `BOOLEAN` | `DEFAULT true` | L2 | 区分活跃/停用 |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT now()` | — | 系统字段 |

**DDL：**
```sql
CREATE TABLE customers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    code        TEXT,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now()
);
```

> **V1 策略说明（Phase 0-A.3 Proposal-002）：** `customers.name` 保持 `NOT NULL`（业务上每张订单必须有客户），但 V1 初期客户数据为 L3（17 家客户名称未获工厂确认）。V1 前端策略：
> - 订单创建时允许临时客户文本输入（自由文本，不强制外键下拉选择）
> - `orders.customer_id` 允许 `NULL`（见 §2.6），待客户主数据就绪后再建立外键关联
> - 不阻塞 V1 核心流转

---

### 2.3 processes（工序目录）

| 业务字段 | PostgreSQL 类型 | 约束 | 成熟度 | 说明 |
|---------|----------------|------|--------|------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | — | 系统生成 |
| `code` | `TEXT` | `NOT NULL UNIQUE` | L2 | P01-P99，工厂统一编号 |
| `name` | `TEXT` | `NOT NULL` | L2 | 工序名称 |
| `type` | `TEXT` | `NOT NULL DEFAULT '加工'` | L1 | 加工 / 检验 / 辅助 |
| `default_dept_id` | `UUID` | `REFERENCES departments(id)` | L2 | 默认执行部门 |
| `is_required` | `BOOLEAN` | `DEFAULT false` | L2 | 必修工序不可在订单创建时取消 |
| `is_active` | `BOOLEAN` | `DEFAULT true` | L1 | 停用保留编号 |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT now()` | — | 系统字段 |

**DDL：**
```sql
CREATE TABLE processes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT '加工'
        CHECK (type IN ('加工', '检验', '辅助')),
    default_dept_id UUID REFERENCES departments(id),
    is_required     BOOLEAN DEFAULT false,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

### 2.4 process_routes（工艺路线模板）

| 业务字段 | PostgreSQL 类型 | 约束 | 成熟度 | 说明 |
|---------|----------------|------|--------|------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | — | 系统生成 |
| `name` | `TEXT` | `NOT NULL` | L2 | 如 "标准太阳纹+银白路线" |
| `is_active` | `BOOLEAN` | `DEFAULT true` | L2 | 停用保留 |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT now()` | — | 系统字段 |

**DDL：**
```sql
CREATE TABLE process_routes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now()
);
```

---

### 2.5 route_steps（路线步骤关联）

| 业务字段 | PostgreSQL 类型 | 约束 | 成熟度 | 说明 |
|---------|----------------|------|--------|------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | — | 系统生成 |
| `route_id` | `UUID` | `NOT NULL REFERENCES process_routes(id)` | L1 | 所属路线 |
| `process_id` | `UUID` | `NOT NULL REFERENCES processes(id)` | L1 | 对应工序 |
| `seq` | `INTEGER` | `NOT NULL` | L1 | 路线中的顺序号 |

**DDL：**
```sql
CREATE TABLE route_steps (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id    UUID NOT NULL REFERENCES process_routes(id),
    process_id  UUID NOT NULL REFERENCES processes(id),
    seq         INTEGER NOT NULL,
    UNIQUE (route_id, process_id, seq)
);
```

---

### 2.6 orders（订单）

| 业务字段 | PostgreSQL 类型 | 约束 | 成熟度 | 说明 |
|---------|----------------|------|--------|------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | — | 系统生成 |
| `order_no` | `TEXT` | `NOT NULL UNIQUE` | L1 | 订单编号，全厂唯一 |
| `customer_id` | `UUID` | `REFERENCES customers(id)` | L2 | 所属客户 |
| `order_qty` | `INTEGER` | `NOT NULL` | L1 | 订单数量 |
| `due_date` | `DATE` | `NOT NULL` | L1 | 交期 |
| `base_texture` | `TEXT` | 可空 | L2 | 底质纹理：无底纹/太阳纹/CD纹 |
| `plate_color` | `TEXT` | 可空 | L2 | 电镀颜色：银白60s/金色/玫瑰金/象牙... |
| `sand_type` | `TEXT` | 可空 | L3 | 喷砂类型：重砂/轻砂/中砂/-。工厂语言库零出现，待 Phase 0-B 验证是否必要 |
| `route_id` | `UUID` | `REFERENCES process_routes(id)` | L1 | 选择的路线模板 |
| `route_snapshot` | `JSONB` | `DEFAULT '{}'` | L1 | **ADL-001**：路线快照 + confirmed 标记 |
| `second_route_id` | `UUID` | `REFERENCES process_routes(id)` (可空) | L3 | **预留 C3**：多层订单第二条路线 |
| `specs` | `JSONB` | `DEFAULT '{}'` | L3 | **预留 C4**：柔性规格（字钉类型/喷漆/消光等） |
| `status` | `TEXT` | `DEFAULT 'in_production'` | L1 | 自动计算：in_production / paused / completed |
| `note` | `TEXT` | 可空 | L2 | 跟单员备注 |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT now()` | — | 系统字段 |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT now()` | — | 系统字段 |

**DDL：**
```sql
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_no        TEXT NOT NULL UNIQUE,
    customer_id     UUID REFERENCES customers(id),
    order_qty       INTEGER NOT NULL,
    due_date        DATE NOT NULL,
    base_texture    TEXT,
    plate_color     TEXT,
    sand_type       TEXT,
    route_id        UUID REFERENCES process_routes(id),
    route_snapshot  JSONB DEFAULT '{}',
    second_route_id UUID DEFAULT NULL REFERENCES process_routes(id),
    specs           JSONB DEFAULT '{}',
    status          TEXT DEFAULT 'in_production'
        CHECK (status IN ('in_production', 'paused', 'completed')),
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

---

### 2.7 order_nodes（工序执行记录 · 核心追踪单元）

| 业务字段 | PostgreSQL 类型 | 约束 | 成熟度 | 说明 |
|---------|----------------|------|--------|------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | — | 系统生成 |
| `order_id` | `UUID` | `NOT NULL REFERENCES orders(id)` | L1 | 所属订单 |
| `process_id` | `UUID` | `REFERENCES processes(id)` | L1 | 对应工序模板 |
| `process_name` | `TEXT` | 可空 | L1 | **快照**：创建时的工序名称 |
| `process_code` | `TEXT` | 可空 | L1 | **快照**：创建时的工序编号 |
| `dept_id` | `UUID` | `REFERENCES departments(id)` | L1 | 执行部门 |
| `dept_name` | `TEXT` | 可空 | L1 | **快照**：创建时的部门名称 |
| `status` | `TEXT` | `DEFAULT 'waiting'` | L1 | **ADL-003**：waiting/active/done/paused（四态） |
| `seq` | `INTEGER` | `NOT NULL` | L1 | 在订单所有节点中的执行顺序 |
| `rework_pass` | `INTEGER` | `DEFAULT 0` | L1 | **ADL-002**：0=正常，1=第1次返工... |
| `pause_reason` | `TEXT` | `DEFAULT NULL` | L2 | **Phase 0-A.2 C1**：暂停原因 |
| `layer` | `TEXT` | `DEFAULT NULL` | L3 | **预留 C2**：层级标记 upper/lower/NULL |
| `qty_out` | `INTEGER` | 可空 | L2 | 产出数量（仅 type='检验' 的节点必填） |
| `is_outsourced` | `BOOLEAN` | `DEFAULT false` | L3 | V1.5 预留：是否外协 |
| `supplier_id` | `UUID` | 可空 | L3 | V1.5 预留：外协供应商 |
| `note` | `TEXT` | 可空 | L2 | 跟单员备注 |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT now()` | — | 系统字段 |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT now()` | — | 系统字段（用于状态回退） |

**DDL：**
```sql
CREATE TABLE order_nodes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id),
    process_id      UUID REFERENCES processes(id),
    process_name    TEXT,
    process_code    TEXT,
    dept_id         UUID REFERENCES departments(id),
    dept_name       TEXT,
    status          TEXT DEFAULT 'waiting'
        CHECK (status IN ('waiting', 'active', 'done', 'paused')),
    seq             INTEGER NOT NULL,
    rework_pass     INTEGER DEFAULT 0,
    pause_reason    TEXT DEFAULT NULL,
    layer           TEXT DEFAULT NULL,
    qty_out         INTEGER,
    is_outsourced   BOOLEAN DEFAULT false,
    supplier_id     UUID,
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

---

### 2.8 exception_events（质量事件）

| 业务字段 | PostgreSQL 类型 | 约束 | 成熟度 | 说明 |
|---------|----------------|------|--------|------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | — | 系统生成 |
| `node_id` | `UUID` | `NOT NULL`（无 FK） | L1 | 关联节点。不设外键——节点删除后异常记录保留 |
| `type` | `TEXT` | `NOT NULL` | L1 | 缺陷类型（预设列表） |
| `qty` | `INTEGER` | `NOT NULL` | L1 | 影响数量 |
| `resolution` | `TEXT` | 可空 | L1 | 处理方式（预设列表） |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT now()` | — | 系统字段 |

**DDL：**
```sql
CREATE TABLE exception_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id     UUID NOT NULL,
    type        TEXT NOT NULL,
    qty         INTEGER NOT NULL,
    resolution  TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);
```

> **设计决策（来自 [4-数据库设计原则.md](../4-数据库设计原则.md) §4）：** `node_id` 不设置 FOREIGN KEY 约束。节点可能被删除，但异常记录需要作为独立历史事实保留。

---

## 三、Primary Key 设计

### 3.1 统一策略

| 决策项 | 选择 | 理由 |
|--------|------|------|
| PK 类型 | `UUID` | 全局唯一、插入/删除不影响其他行、支持未来分布式扩展 |
| 生成方式 | `gen_random_uuid()` | PostgreSQL 原生，v4 随机 UUID，无碰撞风险 |
| 命名 | `id` | 全库统一，简洁明确 |

### 3.2 为什么不用自增 ID

| 维度 | UUID | 自增 ID (SERIAL/BIGSERIAL) |
|------|------|---------------------------|
| 节点插入/删除后引用稳定性 | ✅ 永不错位 | ❌ seq 变更时关联断裂 |
| 并发安全性 | ✅ 无需锁表 | ⚠️ 需要 SEQUENCE 锁 |
| 客户端预生成 | ✅ 可离线生成 | ❌ 必须等数据库 |
| 存储空间 | ⚠️ 16 bytes | ✅ 4/8 bytes |
| 索引性能 | ⚠️ 略低于自增 | ✅ B-Tree 最优 |
| 可读性 | ❌ 不直观 | ✅ 可排序可读 |

**结论：** UUID 的引用稳定性和并发安全优势对 `order_nodes` 的插入/重排场景至关重要（ADL-001 动态追加节点时 seq 会变化，但 UUID 不变）。存储和索引开销在 V1 数据量下（预计 < 10万行）可忽略。

---

## 四、Foreign Key 设计

### 4.1 FK 清单

| 子表 | 字段 | 父表 | ON DELETE | 理由 |
|------|------|------|-----------|------|
| `orders` | `customer_id` | `customers` | `RESTRICT` | 有订单的客户不可删除 |
| `orders` | `route_id` | `process_routes` | `RESTRICT` | 路线被订单引用时不可删除 |
| `orders` | `second_route_id` | `process_routes` | `SET NULL` | 预留字段，删路线时置空 |
| `processes` | `default_dept_id` | `departments` | `RESTRICT` | 部门被工序引用时不可删除 |
| `route_steps` | `route_id` | `process_routes` | `RESTRICT` | 路线被步骤引用时不可删除。保护模板数据完整性 |
| `route_steps` | `process_id` | `processes` | `RESTRICT` | 工序被路线引用时不可删除 |
| `order_nodes` | `order_id` | `orders` | `RESTRICT` | **生产数据保护。** 删订单前必须先显式处理所有节点。推荐软删除（status='cancelled'） |
| `order_nodes` | `process_id` | `processes` | `SET NULL` | 工序停用后，历史节点保留 process_name 快照 |
| `order_nodes` | `dept_id` | `departments` | `SET NULL` | 部门停用后，历史节点保留 dept_name 快照 |
| `exception_events` | `node_id` | — | **无 FK** | 节点删除后异常记录保留 |

### 4.2 FK 设计原则

1. **主数据保护：** `customers`、`departments`、`processes`、`process_routes` 被业务表引用时使用 `RESTRICT`，防止误删
2. **生产数据保护：** `order_nodes` 使用 `RESTRICT`——生产轨迹不可被级联删除。订单需删除时先显式处理节点，或使用软删除
3. **快照容错：** `order_nodes.process_id` 和 `order_nodes.dept_id` 使用 `SET NULL`——工序改名/部门调整后，历史节点通过 `process_name` 和 `dept_name` 快照字段仍可读
4. **无 FK 例外：** `exception_events.node_id` 不设外键——这是 [4-数据库设计原则.md](../4-数据库设计原则.md) 的明确要求

---

## 五、Index 建议

### 5.1 核心查询索引

| 表 | 索引名 | 字段 | 类型 | 覆盖查询场景 |
|----|--------|------|------|-------------|
| `orders` | `idx_orders_status_created` | `(status, created_at DESC)` | B-Tree | 订单列表按状态筛选 + 时间排序 |
| `orders` | `idx_orders_customer` | `(customer_id)` | B-Tree | 按客户筛选订单 |
| `orders` | `idx_orders_due_date` | `(due_date)` | B-Tree | 交期预警（超期订单标红） |
| `order_nodes` | `idx_nodes_order_seq` | `(order_id, seq)` | B-Tree | **最核心索引**：订单流程图渲染（按顺序列出所有节点） |
| `order_nodes` | `idx_nodes_dept_status` | `(dept_id, status)` | B-Tree | 部门待办查询（"制二有哪些 active 节点"） |
| `order_nodes` | `idx_nodes_status` | `(status)` | B-Tree | 全厂卡顿扫描（"所有 active 超 3 天的节点"） |
| `route_steps` | `idx_steps_route_seq` | `(route_id, seq)` | B-Tree | 路线模板展开（按顺序读取步骤） |
| `exception_events` | `idx_exceptions_node` | `(node_id)` | B-Tree | 节点异常列表（点开节点查看关联异常） |
| `exception_events` | `idx_exceptions_type_time` | `(type, created_at DESC)` | B-Tree | 异常类型统计（V1.5+ 使用，V1 预建） |

### 5.2 索引设计原则

1. **复合索引左前缀规则：** `(order_id, seq)` 同时覆盖 `WHERE order_id = ?` 和 `WHERE order_id = ? ORDER BY seq`
2. **V1 数据量预估：** 订单 100-500 行/年，节点 500-2500 行/年，异常 50-200 行/年。索引开销极小，预建不妨碍性能
3. **不做过度索引：** 不在 `note`、`specs` 等自由文本字段上建索引。不在纯预留字段（`layer`、`supplier_id`）上建索引
4. **外键索引：** PostgreSQL 不会自动为 FK 建索引。所有 FK 列（`customer_id`、`route_id`、`order_id`、`dept_id` 等）已在上述索引中覆盖

### 5.3 完整索引 DDL

```sql
-- orders
CREATE INDEX idx_orders_status_created ON orders (status, created_at DESC);
CREATE INDEX idx_orders_customer ON orders (customer_id);
CREATE INDEX idx_orders_due_date ON orders (due_date);

-- order_nodes（核心）
CREATE INDEX idx_nodes_order_seq ON order_nodes (order_id, seq);
CREATE INDEX idx_nodes_dept_status ON order_nodes (dept_id, status);
CREATE INDEX idx_nodes_status ON order_nodes (status);

-- route_steps
CREATE INDEX idx_steps_route_seq ON route_steps (route_id, seq);

-- exception_events
CREATE INDEX idx_exceptions_node ON exception_events (node_id);
CREATE INDEX idx_exceptions_type_time ON exception_events (type, created_at DESC);
```

---

## 六、Enum 设计

### 6.1 枚举策略

**选择：TEXT + CHECK 约束，不使用 PostgreSQL 原生 ENUM 类型。**

| 维度 | TEXT + CHECK | 原生 ENUM |
|------|-------------|-----------|
| Supabase JS SDK 兼容 | ✅ 完全兼容，字符串直读直写 | ⚠️ 需要 pg_catalog 查询枚举值 |
| 新增枚举值 | ✅ `ALTER TABLE DROP CONSTRAINT + ADD CONSTRAINT` | ⚠️ `ALTER TYPE ADD VALUE`（不可在事务中回滚） |
| 可移植性 | ✅ 纯 SQL 标准 | ❌ PostgreSQL 专有 |
| 存储效率 | ⚠️ 占用文本空间 | ✅ 4 bytes |
| V1 适用性 | ✅ 枚举值少、变更预期低 | — |

**V1 数据量下存储差异可忽略。选择 TEXT + CHECK 以保证 Supabase SDK 兼容性。**

### 6.2 枚举值清单

#### departments.type

| 值 | 含义 | 适用范围 |
|----|------|---------|
| `production` | 生产部门 | 制一/制二/制三/制四 |
| `qc` | 检验部门 | 总QC |

#### processes.type

| 值 | 含义 | 行为差异 |
|----|------|---------|
| `加工` | 物理改变产品 | 无特殊行为 |
| `检验` | 检查质量 | 标记 done 时强制填写 `qty_out` |
| `辅助` | 等待/运输/外协 | 无特殊行为（V1 可能不启用） |

#### order_nodes.status（ADL-003 四态）

| 值 | 含义 | 合法来源 | 合法目标 |
|----|------|---------|---------|
| `waiting` | 等待上游完成 | (初始状态) / paused→(N/A) | active |
| `active` | 正在执行 | waiting→active / paused→active | done / paused / active(返工) |
| `done` | 已完成 | active→done | (终态，不可转换) |
| `paused` | 暂停 | active→paused | active |

#### orders.status（自动计算，三态）

| 值 | 计算规则 |
|----|---------|
| `in_production` | 存在非 done 节点，且非全部 paused |
| `paused` | 所有非 done 节点都是 paused |
| `completed` | 所有节点都是 done |

#### exception_events.type（预设缺陷类型）

| 值 | 说明 |
|----|------|
| `色差` | 颜色不符合标准 |
| `电镀不良` | 电镀层缺陷 |
| `划伤` | 表面划痕 |
| `沙眼` | 表面针孔 |
| `变形` | 物理形变 |
| `其他` | 兜底选项 |

#### exception_events.resolution（预设处理方式）

| 值 | 说明 |
|----|------|
| `返回电镀` | 退回制三重镀 |
| `返回磨板` | 退回制二打磨 |
| `重做` | 本工序重做 |
| `特采` | 让步接收 |
| `报废` | 不可修复 |

#### order_nodes.pause_reason（Phase 0-A.2 C1）

| 值 | 说明 |
|----|------|
| `waiting_customer` | 待客户确认 |
| `waiting_material` | 待物料 |
| `waiting_schedule` | 待排期 |
| `customer_hold` | 客户要求暂停 |
| `quality_hold` | 质量问题待处理 |
| `other` | 其他（跟单员自定义文本通过 `note` 补充） |

> **注意：** `pause_reason` 不设 CHECK 约束（TEXT 可空）。预设值在前端下拉框展示，但数据库允许跟单员输入自定义原因。

#### order_nodes.layer（预留 C3，V1 不启用）

| 值 | 说明 |
|----|------|
| `upper` | 上层面 |
| `lower` | 下层面 |
| `NULL` | 不适用（单层订单） |

---

## 七、JSONB 字段设计

### 7.1 orders.route_snapshot（ADL-001 核心字段）

**用途：** 记录订单创建时跟单员对路线模板的确认/调整结果。路线模板日后可能变化，但此快照永久保留当时的决策。

**数据结构：**
```json
{
  "route_id": "<UUID>",
  "route_name": "标准太阳纹+银白路线",
  "snapshot_at": "2026-08-06T10:30:00+08:00",
  "steps": [
    {
      "seq": 1,
      "process_code": "P01",
      "process_name": "冲压成型",
      "dept_name": "制一",
      "is_required": true,
      "confirmed": true
    },
    {
      "seq": 2,
      "process_code": "P03",
      "process_name": "太阳纹加工",
      "dept_name": "制二",
      "is_required": false,
      "confirmed": true
    },
    {
      "seq": 3,
      "process_code": "P04",
      "process_name": "喷砂",
      "dept_name": "制二",
      "is_required": false,
      "confirmed": false
    },
    {
      "seq": 4,
      "process_code": "P05",
      "process_name": "银白电镀",
      "dept_name": "制三",
      "is_required": false,
      "confirmed": true
    },
    {
      "seq": 5,
      "process_code": "P07",
      "process_name": "移印",
      "dept_name": "制四",
      "is_required": false,
      "confirmed": true
    },
    {
      "seq": 6,
      "process_code": "P09",
      "process_name": "总QC检验",
      "dept_name": "总QC",
      "is_required": true,
      "confirmed": true
    }
  ]
}
```

**业务规则：**
- `is_required=true` 的工序（必修工序），`confirmed` 必须为 `true`——前端不可取消勾选
- `confirmed=false` 的工序不生成 `order_nodes`
- `snapshot_at` 记录快照时间戳，用于追溯"订单创建时路线是什么样子"

**访问模式：**
- **写入：** 订单创建时一次性写入，后续不修改
- **读取：** 订单详情页展示"原始路线 vs 实际节点"对比（展示被跳过的工序）
- **不建 GIN 索引：** 此 JSONB 仅作为整体读写，不需要按 JSON 内部字段查询

### 7.2 orders.specs（Phase 0-A.2 C4 预留）

**用途：** 存储 `base_texture` / `plate_color` / `sand_type` 三个固定字段装不下的额外规格参数。

**数据结构（示例）：**
```json
{
  "stud_type": "银钉",
  "finish": "哑光",
  "paint_type": "平搪瓷",
  "extinction": "轻消光"
}
```

**业务规则：**
- V1 首版不暴露此字段给前端
- 不参与任何流转逻辑
- 三个固定字段（`base_texture` / `plate_color` / `sand_type`）保留为独立列——它们是高频查询和筛选字段
- `specs` 仅用于未来扩展，存放固定字段装不下的规格参数

**访问模式：**
- V1：不读写
- V1.5+：根据路线模板动态展示对应的规格输入项
- **不建 GIN 索引**

---

## 八、RLS 权限初步规划

### 8.1 V1 权限模型

| 维度 | V1 决策 |
|------|---------|
| 认证方式 | Supabase anon key + 简单密码（不启用 Supabase Auth） |
| 用户数 | 1-2 个跟单员共用同一账号 |
| 网络环境 | 内网 + 受信用户 |
| RLS 必要性 | **V1 启用 RLS（零成本安全层），但不做细粒度角色** |

> **依据 [9-V1-Scope-Definition.md](../9-V1-Scope-Definition.md) §二.1：** "权限/多用户 ❌ 否——工厂固定人员，1-2 个跟单员共用同一账号。Supabase 的 anon key + 简单密码即可。"

### 8.2 RLS 策略设计

即使 V1 只有单一用户角色，仍然启用 RLS 作为安全底线。策略如下：

#### 全局策略

```sql
-- 所有表默认拒访
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE exception_events ENABLE ROW LEVEL SECURITY;
```

#### 单一角色策略（V1 简化版）

```sql
-- V1 策略：基于 anon key 的请求允许全部操作
-- 所有表使用统一的 "authenticated 全权限" 策略
CREATE POLICY "V1: full access" ON departments FOR ALL USING (true);
CREATE POLICY "V1: full access" ON customers FOR ALL USING (true);
CREATE POLICY "V1: full access" ON processes FOR ALL USING (true);
CREATE POLICY "V1: full access" ON process_routes FOR ALL USING (true);
CREATE POLICY "V1: full access" ON route_steps FOR ALL USING (true);
CREATE POLICY "V1: full access" ON orders FOR ALL USING (true);
CREATE POLICY "V1: full access" ON order_nodes FOR ALL USING (true);
CREATE POLICY "V1: full access" ON exception_events FOR ALL USING (true);
```

> **说明：** V1 使用 `USING (true)` 是因为只有受信内网用户。这不是"不做安全"，而是"安全边界在网络层（内网 + 受信设备），不在应用层"。RLS 框架已就绪，V2 引入多用户时只需替换 `USING` 条件，无需改表结构。

### 8.3 V2 角色策略（预设计，不在 V1 实施）

当 V2 引入多用户时，RLS 策略将按以下角色分化（此处仅做设计预留）：

| 角色 | orders | order_nodes | exception_events | processes / routes | audit_logs |
|------|--------|-------------|------------------|--------------------|------------|
| **admin** | 全部 CRUD | 全部 CRUD | 全部 CRUD | 全部 CRUD | 只读 |
| **worker** | 可读写 | 可读写本部门节点 | 可读写（通过 node→dept 关联） | 只读 | 只读 |
| **viewer** | 全部只读 | 全部只读 | 全部只读 | 只读 | 只读 |

```sql
-- 示例：V2 worker 角色 — 仅可读写本部门节点
-- CREATE POLICY "worker: dept nodes" ON order_nodes
--     FOR ALL USING (
--         dept_id IN (
--             SELECT id FROM departments
--             WHERE id IN (SELECT dept_id FROM user_depts WHERE user_id = auth.uid())
--         )
--     );
```

### 8.4 应用层安全补充

| 措施 | 说明 |
|------|------|
| Supabase anon key | 仅授予 SELECT/INSERT/UPDATE/DELETE 权限（通过 RLS 限制行级） |
| Service Key | 不暴露给前端。仅用于数据初始化脚本 |
| 敏感操作确认 | 订单删除、工序停用等破坏性操作需要前端二次确认 |
| 数据不可变规则 | 通过应用层 + RLS (USING 条件) 双重保障（见 §九） |

---

## 九、数据不可变规则

来自 [7-架构设计-v1.md](../7-架构设计-v1.md) §4.3 和 [4-数据库设计原则.md](../4-数据库设计原则.md) §5：

| # | 规则 | 实施层 |
|---|------|--------|
| 1 | `processes` 已被订单使用的行，不可 DELETE、不可 UPDATE（除 `is_active` 外） | 应用层校验 |
| 2 | `process_routes` 同上规则 | 应用层校验 |
| 3 | `exception_events` 不可修改、不可删除（只能新增修正事件） | RLS + 应用层 |
| 4 | `order_nodes` 只可修改 `status`、时间、数量、备注，不可修改 `process_id`、`dept_id`、`seq` | 应用层校验 |
| 5 | 订单完成（`status='completed'`）后，所有关联节点锁定 | 应用层校验 |
| 6 | 所有表 `created_at` 不可手动修改（DEFAULT now() 保证） | 数据库层 |

> **V1 审计策略：** 不建独立 `audit_logs` 表（延后至 V2）。基本追溯通过 `created_at` / `updated_at` + `route_snapshot` 快照 + `process_name` / `dept_name` 冗余字段实现。

---

## 十、完整建表顺序

由于外键依赖关系，DDL 执行必须按以下顺序：

```
1. departments        (无依赖)
2. customers          (无依赖)
3. processes          (依赖 departments)
4. process_routes     (无依赖)
5. route_steps        (依赖 process_routes, processes)
6. orders             (依赖 customers, process_routes)
7. order_nodes        (依赖 orders, processes, departments)
8. exception_events   (依赖 order_nodes 的逻辑，但无 FK)
```

---

## 十一、完整 DDL 汇总

以下为 V1 全部 8 张表的完整 DDL，可直接在 Supabase SQL Editor 中执行：

```sql
-- ============================================================
-- DialFactory V1 · 完整建表 DDL
-- Phase 1-A: Supabase Schema Plan
-- 基于: 10-Business-Model-V1.md (冻结) + ADL-001/002/003
-- ============================================================

-- 1. departments（部门）
CREATE TABLE departments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    type        TEXT NOT NULL DEFAULT 'production'
        CHECK (type IN ('production', 'qc')),
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. customers（客户）
CREATE TABLE customers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    code        TEXT,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- 3. processes（工序目录）
CREATE TABLE processes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT '加工'
        CHECK (type IN ('加工', '检验', '辅助')),
    default_dept_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
    is_required     BOOLEAN DEFAULT false,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- 4. process_routes（工艺路线模板）
CREATE TABLE process_routes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- 5. route_steps（路线步骤）
CREATE TABLE route_steps (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id    UUID NOT NULL REFERENCES process_routes(id) ON DELETE RESTRICT,
    process_id  UUID NOT NULL REFERENCES processes(id) ON DELETE RESTRICT,
    seq         INTEGER NOT NULL,
    UNIQUE (route_id, process_id, seq)
);

-- 6. orders（订单）
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_no        TEXT NOT NULL UNIQUE,
    customer_id     UUID REFERENCES customers(id) ON DELETE RESTRICT,
    order_qty       INTEGER NOT NULL,
    due_date        DATE NOT NULL,
    base_texture    TEXT,
    plate_color     TEXT,
    sand_type       TEXT,
    route_id        UUID REFERENCES process_routes(id) ON DELETE RESTRICT,
    route_snapshot  JSONB DEFAULT '{}',
    second_route_id UUID DEFAULT NULL REFERENCES process_routes(id) ON DELETE SET NULL,
    specs           JSONB DEFAULT '{}',
    status          TEXT DEFAULT 'in_production'
        CHECK (status IN ('in_production', 'paused', 'completed')),
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 7. order_nodes（工序执行记录）
CREATE TABLE order_nodes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    process_id      UUID REFERENCES processes(id) ON DELETE SET NULL,
    process_name    TEXT,
    process_code    TEXT,
    dept_id         UUID REFERENCES departments(id) ON DELETE SET NULL,
    dept_name       TEXT,
    status          TEXT DEFAULT 'waiting'
        CHECK (status IN ('waiting', 'active', 'done', 'paused')),
    seq             INTEGER NOT NULL,
    rework_pass     INTEGER DEFAULT 0,
    pause_reason    TEXT DEFAULT NULL,
    layer           TEXT DEFAULT NULL,
    qty_out         INTEGER,
    is_outsourced   BOOLEAN DEFAULT false,
    supplier_id     UUID,
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 8. exception_events（质量事件）
CREATE TABLE exception_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id     UUID NOT NULL,
    type        TEXT NOT NULL,
    qty         INTEGER NOT NULL,
    resolution  TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 索引
-- ============================================================

-- orders
CREATE INDEX idx_orders_status_created ON orders (status, created_at DESC);
CREATE INDEX idx_orders_customer ON orders (customer_id);
CREATE INDEX idx_orders_due_date ON orders (due_date);

-- order_nodes
CREATE INDEX idx_nodes_order_seq ON order_nodes (order_id, seq);
CREATE INDEX idx_nodes_dept_status ON order_nodes (dept_id, status);
CREATE INDEX idx_nodes_status ON order_nodes (status);

-- route_steps
CREATE INDEX idx_steps_route_seq ON route_steps (route_id, seq);

-- exception_events
CREATE INDEX idx_exceptions_node ON exception_events (node_id);
CREATE INDEX idx_exceptions_type_time ON exception_events (type, created_at DESC);

-- ============================================================
-- RLS 启用
-- ============================================================

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE exception_events ENABLE ROW LEVEL SECURITY;

-- V1 策略：受信内网用户全权限
CREATE POLICY "V1: full access" ON departments FOR ALL USING (true);
CREATE POLICY "V1: full access" ON customers FOR ALL USING (true);
CREATE POLICY "V1: full access" ON processes FOR ALL USING (true);
CREATE POLICY "V1: full access" ON process_routes FOR ALL USING (true);
CREATE POLICY "V1: full access" ON route_steps FOR ALL USING (true);
CREATE POLICY "V1: full access" ON orders FOR ALL USING (true);
CREATE POLICY "V1: full access" ON order_nodes FOR ALL USING (true);
CREATE POLICY "V1: full access" ON exception_events FOR ALL USING (true);

-- ============================================================
-- 预置数据
-- ============================================================

INSERT INTO departments (name, seq, type) VALUES
    ('制一', 1, 'production'),
    ('制二', 2, 'production'),
    ('制三', 3, 'production'),
    ('制四', 4, 'production'),
    ('总QC', 5, 'qc');
```

---

## 十二、字段统计

| 表 | 业务字段数 | 系统字段数 | 预留字段数 | 总计 |
|----|-----------|-----------|-----------|------|
| `departments` | 3 | 1 | 0 | 4 |
| `customers` | 3 | 1 | 0 | 4 |
| `processes` | 6 | 1 | 0 | 7 |
| `process_routes` | 2 | 1 | 0 | 3 |
| `route_steps` | 3 | 0 | 0 | 3 |
| `orders` | 11 | 2 | 2 (`second_route_id`, `specs`) | 15 |
| `order_nodes` | 12 | 2 | 3 (`layer`, `is_outsourced`, `supplier_id`) | 17 |
| `exception_events` | 4 | 1 | 0 | 5 |
| **总计** | **44** | **9** | **5** | **58** |

> **对比 V1 Scope 原定义：** 8 张表、~40 业务字段。Phase 0-A.2 后增至 44 业务字段（+`pause_reason`、+`route_snapshot` 展开为独立 JSONB、+固定规格字段保留、+预留字段）。表数量不变，无新增实体。

---

## 十三、文档交叉引用

| 本文档章节 | 关联决策来源 |
|-----------|-------------|
| §一 表关系确认 | [10-Business-Model-V1.md](../10-Business-Model-V1.md) §3 |
| §二 字段 DDL 映射 | [10-Business-Model-V1.md](../10-Business-Model-V1.md) §4 + [Phase 0-A.2](Phase0-A.2-Model-Gap-Analysis.md) §4 |
| §三 PK 设计 | [4-数据库设计原则.md](../4-数据库设计原则.md) §2 |
| §四 FK 设计 | [4-数据库设计原则.md](../4-数据库设计原则.md) §4 + [7-架构设计-v1.md](../7-架构设计-v1.md) §4.3 |
| §五 Index 建议 | [7-架构设计-v1.md](../7-架构设计-v1.md) §4.2 |
| §六 Enum 设计 | [9-V1-Scope-Definition.md](../9-V1-Scope-Definition.md) §5-6 + [ADL-003](ADL-Architecture-Decision-Log.md) |
| §七 JSONB 设计 | [ADL-001](ADL-Architecture-Decision-Log.md) + [Phase 0-A.2](Phase0-A.2-Model-Gap-Analysis.md) §GAP-3 |
| §八 RLS 规划 | [9-V1-Scope-Definition.md](../9-V1-Scope-Definition.md) §二.1 + [7-架构设计-v1.md](../7-架构设计-v1.md) §6 |
| §九 不可变规则 | [7-架构设计-v1.md](../7-架构设计-v1.md) §4.3 + [4-数据库设计原则.md](../4-数据库设计原则.md) §5 |
| §一~九 整体 | [ADL-001/002/003](ADL-Architecture-Decision-Log.md) 全部 3 条决策 |

---

> **Phase 1-A 完成标志：** 本文档产出后，Phase 1-B 将直接使用本文档 §十一 的完整 DDL 在 Supabase 中建表。**当前阶段禁止执行任何 SQL。**
