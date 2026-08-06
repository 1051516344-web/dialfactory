# DialFactory Phase 1-C-1 · Frontend Specification

> **状态：** Design
> **阶段：** Phase 1-C-1 — Frontend Specification
> **前置：** [09-Application-Architecture.md](09-Application-Architecture.md) · [DialFactory-V1-Freeze.md](../../docs/FREEZE/DialFactory-V1-Freeze.md)
> **原则：** 只设计页面和交互。不写代码。不修改数据库。

---

## §1 Page Inventory

### 1.1 Route Map

```
/                        → P1 · Dashboard (首页)
/orders                  → P2 · Order List (订单列表)
/orders/new              → P3 · Order Create (新建订单)
/orders/:id              → P4 · Order Detail (订单详情)
/routes                  → P5 · Route List (路线模板)
/exceptions              → P6 · Exception List (异常汇总)
```

### 1.2 Page Summary

| # | Page | Route | Core Component | Priority |
|:--|------|-------|---------------|:--------:|
| P1 | Dashboard | `/` | `dashboard.js` | P0 |
| P2 | Order List | `/orders` | `order-list.js` | P0 |
| P3 | Order Create | `/orders/new` | `order-create.js` | P0 |
| P4 | Order Detail | `/orders/:id` | `process-flow.js` | P0 |
| P5 | Route List | `/routes` | `route-list.js` | P1 |
| P6 | Exception List | `/exceptions` | `exception-list.js` | P1 |

---

## §2 P1 · Dashboard（首页）

### 2.1 Purpose

跟单员打开系统后的第一屏。快速回答：哪些订单卡了、哪些快超期、每个部门有多少活。

### 2.2 Layout

```
┌──────────────────────────────────────────────┐
│  DialFactory V1               [+ 新建订单]   │
├──────────────────────────────────────────────┤
│                                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│  │ 生产中   │ │ 已暂停   │ │ 已完成   │        │
│  │   12    │ │    3    │ │   45    │        │
│  └─────────┘ └─────────┘ └─────────┘        │
│                                              │
│  ⚠ 卡顿订单 (active > 3天)                   │
│  ┌─────────────────────────────────────┐     │
│  │ #0088 · 时诺 · 制三电镀 · 卡了5天    │     │
│  │ #0091 · 飞亚达 · 制二打磨 · 卡了4天   │     │
│  └─────────────────────────────────────┘     │
│                                              │
│  ⏰ 交期预警 (3天内到期)                      │
│  ┌─────────────────────────────────────┐     │
│  │ #0090 · 8月9日到期 · 还剩3天         │     │
│  └─────────────────────────────────────┘     │
│                                              │
│  部门待办                                    │
│  ┌────────┬────────┬────────┬──────┬────┐   │
│  │  制一   │  制二   │  制三   │ 制四  │总QC│  │
│  │   2    │   3    │   5    │  1   │ 2  │   │
│  └────────┴────────┴────────┴──────┴────┘   │
│                                              │
└──────────────────────────────────────────────┘
```

### 2.3 Components

| Component | Data Source | Refresh |
|-----------|------------|:-------:|
| **Stats Cards** (生产中/已暂停/已完成) | `orders.status` count | On load |
| **Stalled Orders** | `order_nodes` WHERE status='active' AND updated_at < now()-3d | On load |
| **Due Date Warnings** | `orders` WHERE due_date < now()+3d AND status!='completed' | On load |
| **Dept Queue** | `order_nodes` WHERE status='active' GROUP BY dept_id | On load |

### 2.4 Interactions

| Trigger | Action |
|---------|--------|
| Click stat card | Navigate to `/orders` filtered by status |
| Click stalled order | Navigate to `/orders/:id` |
| Click due warning | Navigate to `/orders/:id` |
| Click dept queue | Navigate to `/orders` filtered by dept |
| Click [+ 新建订单] | Navigate to `/orders/new` |

### 2.5 Data Queries

```javascript
// Stats
supabase.from('orders').select('status', { count: 'exact', head: true })

// Stalled nodes → orders
supabase.from('order_nodes')
  .select('order_id, orders!inner(order_no, customer:customers(name))')
  .eq('status', 'active')
  .lt('updated_at', threeDaysAgo)

// Due warnings
supabase.from('orders')
  .select('order_no, due_date, customer:customers(name)')
  .lt('due_date', threeDaysFromNow)
  .neq('status', 'completed')

// Dept queue
supabase.from('order_nodes')
  .select('dept_id, dept_name', { count: 'exact' })
  .eq('status', 'active')
```

---

## §3 P2 · Order List（订单列表）

### 3.1 Purpose

浏览、搜索、筛选所有订单。定位特定订单。

### 3.2 Layout

```
┌──────────────────────────────────────────────┐
│  ← 返回    订单列表              [+ 新建订单] │
├──────────────────────────────────────────────┤
│  🔍 搜索订单号...    [生产中▾] [制一▾]        │
├──────────────────────────────────────────────┤
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ #0088 · 时诺 · 太阳纹+银白             │  │
│  │ 500件 · 8月20日交期 · 生产中           │  │
│  │ ████████████░░░░  60% (3/5 done)      │  │
│  │ ⚠ 制三电镀 active · 卡了5天            │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ #0090 · 飞亚达 · CD纹+金色             │  │
│  │ 300件 · 8月9日交期 · 生产中            │  │
│  │ ████████████████  80% (4/5 done)      │  │
│  │ ⏰ 3天后到期                            │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ #0085 · 时诺 · 无底纹+银白             │  │
│  │ 200件 · 7月30日交期 · ✅ 已完成        │  │
│  │ ██████████████████ 100%                │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  [ 加载更多... ]                             │
└──────────────────────────────────────────────┘
```

### 3.3 Order Card

| Element | Data Field | Display Rule |
|---------|-----------|-------------|
| Order No | `order_no` | Always |
| Customer | `customers.name` | Always (fallback: `customer_id` UUID) |
| Specs | `base_texture` + `plate_color` | Concatenated, e.g. "太阳纹+银白" |
| Quantity | `order_qty` | Always |
| Due Date | `due_date` | Red if overdue |
| Status Badge | `status` | Color: 生产中(blue) / 暂停(yellow) / 完成(green) |
| Progress Bar | derived: done_nodes / total_nodes | Grey = waiting, Blue = active, Green = done |
| Warning | derived | ⚠ if stalled, ⏰ if due soon |
| Current Node | derived: active node's `process_name` + `dept_name` | If status = 'in_production' |

### 3.4 Filters

| Filter | Type | Values |
|--------|------|--------|
| Search | Text input | `order_no` contains |
| Status | Dropdown | All / 生产中 / 已暂停 / 已完成 |
| Department | Dropdown | All / 制一 / 制二 / 制三 / 制四 / 总QC |
| Customer | Dropdown | All / (customer list) |

### 3.5 Sort

| Default Sort | Rule |
|-------------|------|
| 1st priority | Stalled orders (active > 3 days) → top |
| 2nd priority | Due date (ascending) |
| 3rd priority | `created_at` (descending) |

### 3.6 Interactions

| Trigger | Action |
|---------|--------|
| Click order card | Navigate to `/orders/:id` |
| Type in search | Filter list (client-side debounce 300ms) |
| Change filter dropdown | Re-fetch from Supabase |
| Scroll to bottom | Load next page (pagination, 20 per page) |

---

## §4 P3 · Order Create（新建订单）

### 4.1 Purpose

跟单员创建新订单。执行 ADL-001 流程：选客户 → 选路线 → 确认工序 → 填参数 → 生成节点。

### 4.2 Layout — Step 1: Basic Info

```
┌──────────────────────────────────────────────┐
│  ← 返回    新建订单                          │
├──────────────────────────────────────────────┤
│                                              │
│  订单编号 *                                  │
│  ┌────────────────────────────────────┐      │
│  │ CUST-2026-0088                      │      │
│  └────────────────────────────────────┘      │
│                                              │
│  客户 *                                      │
│  ┌────────────────────────────────────┐      │
│  │ 时诺 (SN)                      ▾   │      │
│  └────────────────────────────────────┘      │
│  (V1 初期可选: 直接输入客户名)               │
│                                              │
│  订单数量 *                    交期 *        │
│  ┌──────────────────┐ ┌────────────────┐    │
│  │ 500              │ │ 2026-08-20     │    │
│  └──────────────────┘ └────────────────┘    │
│                                              │
│  规格参数                                    │
│  底质纹理▾         电镀颜色▾                 │
│  喷砂类型▾                                   │
│                                              │
│  工艺路线 *                                  │
│  ┌────────────────────────────────────┐      │
│  │ 标准太阳纹+银白路线            ▾   │      │
│  └────────────────────────────────────┘      │
│                                              │
│  备注                                        │
│  ┌────────────────────────────────────┐      │
│  │ (选填)                              │      │
│  └────────────────────────────────────┘      │
│                                              │
│              [ 下一步：确认工序 → ]           │
└──────────────────────────────────────────────┘
```

### 4.3 Layout — Step 2: Confirm Route Steps (ADL-001)

```
┌──────────────────────────────────────────────┐
│  ← 返回    确认工序                          │
├──────────────────────────────────────────────┤
│  路线: 标准太阳纹+银白路线                    │
│  以下为该路线的全部建议工序。                 │
│  必修工序 (🔒) 不可取消。                     │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ 🔒 P01 冲压成型 · 制一          [必修] │  │
│  ├────────────────────────────────────────┤  │
│  │ ✅ P03 太阳纹加工 · 制二        [确认] │  │
│  ├────────────────────────────────────────┤  │
│  │ ❌ P04 喷砂 · 制二              [取消] │  │
│  ├────────────────────────────────────────┤  │
│  │ ✅ P05 银白电镀 · 制三          [确认] │  │
│  ├────────────────────────────────────────┤  │
│  │ ✅ P07 移印 · 制四              [确认] │  │
│  ├────────────────────────────────────────┤  │
│  │ 🔒 P09 总QC检验 · 总QC          [必修] │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  已确认: 5 道工序 · 已取消: 1 道             │
│                                              │
│              [ ← 返回修改 ]  [ 创建订单 ✓ ]   │
└──────────────────────────────────────────────┘
```

### 4.4 Step 2 Interaction Rules

| Rule | Behavior |
|------|----------|
| `is_required=true` | 显示 🔒 标记。Toggle disabled。不可取消 |
| `is_required=false` | 默认 ✅ 确认。可切换为 ❌ 取消 |
| Toggle click | 切换 confirmed: true ↔ false |
| Cancel count | 实时显示 "已确认 N 道 · 已取消 M 道" |
| Minimum confirmed | ≥ 1 (enforced by submit button) |

### 4.5 Create Order — Submit

On click [创建订单]:

```
1. INSERT INTO orders (order_no, customer_id, order_qty, due_date, ...)
2. Build route_snapshot JSONB from step confirmations
3. UPDATE orders SET route_snapshot = ...
4. For each confirmed=true step:
     INSERT INTO order_nodes (order_id, process_id, ..., status, seq)
     First node → status='active', rest → 'waiting'
5. Navigate to /orders/:new_id
```

### 4.6 Form Validation

| Field | Rule | Error Message |
|-------|------|--------------|
| `order_no` | Required, unique | "请输入订单编号" / "订单编号已存在" |
| `customer_id` | Required (V1: or text input) | "请选择客户" |
| `order_qty` | Required, > 0, integer | "请输入有效数量" |
| `due_date` | Required, ≥ today | "请选择交期" |
| `route_id` | Required | "请选择工艺路线" |
| Confirmed steps | ≥ 1 | "至少确认一道工序" |

---

## §5 P4 · Order Detail（订单详情）⭐ Core

### 5.1 Purpose

单张订单的完整视图。包含：基本信息、流程图（核心）、异常列表。

### 5.2 Layout

```
┌──────────────────────────────────────────────┐
│  ← 订单列表    #0088 · 时诺    生产中        │
├──────────────────────────────────────────────┤
│                                              │
│  ┌─ 基本信息 ──────────────────────────────┐ │
│  │ 客户: 时诺    数量: 500件               │ │
│  │ 交期: 2026-08-20 (还剩14天)             │ │
│  │ 规格: 太阳纹 + 银白60s + 轻砂           │ │
│  │ 路线: 标准太阳纹+银白路线               │ │
│  │ 备注: —                                  │ │
│  └──────────────────────────────────────────┘ │
│                                              │
│  ┌─ 生产流程 ──────────────────────────────┐ │
│  │                                          │ │
│  │  [✓] P01 冲压成型 · 制一                │ │
│  │   │  done · 8月6日                      │ │
│  │   ▼                                      │ │
│  │  [►] P03 太阳纹加工 · 制二              │ │
│  │   │  active · 进行中                    │ │
│  │   ▼                                      │ │
│  │  [ ] P05 银白电镀 · 制三                │ │
│  │   │  waiting                             │ │
│  │   ▼                                      │ │
│  │  [ ] P07 移印 · 制四                    │ │
│  │   │  waiting                             │ │
│  │   ▼                                      │ │
│  │  [ ] P09 总QC检验 · 总QC                │ │
│  │      waiting                             │ │
│  │                                          │ │
│  └──────────────────────────────────────────┘ │
│                                              │
│  ┌─ 异常记录 ──────────────────────────────┐ │
│  │ #1 · P03太阳纹 · 色差 · 30件            │ │
│  │     处理: 返回电镀 · 8月6日             │ │
│  │ —                                       │ │
│  │ (无更多异常)                             │ │
│  └──────────────────────────────────────────┘ │
│                                              │
└──────────────────────────────────────────────┘
```

### 5.3 Process Flow Component（核心组件）

#### 5.3.1 Node Card

Each node rendered as a vertical card connected by arrows:

```
┌──────────────────────────┐
│ [►] P03 太阳纹加工       │  ← status icon + process_code + process_name
│     制二                  │  ← dept_name
│     进行中 · 8月6日开始   │  ← status label + started_at
│                          │
│  [完成] [暂停] [记录异常] │  ← action buttons (conditional)
│  [返工] [追加工序]        │
└──────────────────────────┘
```

#### 5.3.2 Status Display

| status | Icon | Card Style | Actions Available |
|--------|:----:|-----------|------------------|
| `waiting` | `[ ]` | Grey border, muted bg | — |
| `active` | `[►]` | Blue border, blue bg | 完成, 暂停, 记录异常 |
| `done` | `[✓]` | Green border, green bg | 返工, 追加工序 |
| `paused` | `[⏸]` | Yellow border, yellow bg | 恢复, 记录异常 |

#### 5.3.3 Rework Badge

| rework_pass | Badge |
|:----------:|-------|
| 0 | (none) |
| 1 | `返工×1` · light orange bg |
| 2 | `返工×2` · medium orange bg |
| ≥3 | `返工×N` · dark orange bg |

### 5.4 Node Actions

#### 5.4.1 完成 (active → done)

```
User clicks [完成]
    │
    ▼
If process.type = '检验' AND qty_out IS NULL:
  → Show input: "产出数量 *"
  → User fills qty_out → Confirm
    │
    ▼
UPDATE order_nodes SET status='done', qty_out=?, updated_at=now()
    │
    ▼
Find next waiting node → UPDATE SET status='active'
    │
    ▼
Recompute orders.status → Re-render
```

#### 5.4.2 暂停 (active → paused)

```
User clicks [暂停]
    │
    ▼
Show dialog:
  ┌─────────────────────────────┐
  │ 暂停原因                     │
  │ ○ 待客户确认                 │
  │ ○ 待物料                     │
  │ ○ 待排期                     │
  │ ○ 客户要求暂停               │
  │ ○ 质量问题待处理             │
  │ ○ 其他: __________          │
  │              [确认暂停]      │
  └─────────────────────────────┘
    │
    ▼
UPDATE order_nodes SET status='paused', pause_reason=?
    │
    ▼
Recompute orders.status → Re-render
```

#### 5.4.3 恢复 (paused → active)

```
User clicks [恢复]
    │
    ▼
UPDATE order_nodes SET status='active', pause_reason=NULL
    │
    ▼
Recompute orders.status → Re-render
```

#### 5.4.4 快捷返工 (repeat_node)

```
User clicks [返工] on a done node
    │
    ▼
Show confirmation:
  "确认对 [P03 太阳纹加工] 执行返工？"
  "将创建第 2 次执行的记录。"
    │
    ▼
INSERT INTO order_nodes (
  order_id, process_id, process_name, process_code,
  dept_id, dept_name,
  seq = current.seq + 1,
  rework_pass = current.rework_pass + 1,
  status = 'active'
)
    │
    ▼
UPDATE all subsequent nodes: seq += 1
    │
    ▼
Recompute orders.status → Re-render with new node
```

#### 5.4.5 动态追加节点

```
User clicks [追加工序] on any node
    │
    ▼
Show dialog:
  ┌─────────────────────────────────────┐
  │ 追加工序                             │
  │ 选择工序: [P05 银白电镀 ▾]          │
  │ 插入位置: 在 [P03 太阳纹加工] 之后  │
  │ 原因 (选填): ______________         │
  │                  [确认追加]          │
  └─────────────────────────────────────┘
    │
    ▼
INSERT INTO order_nodes (
  order_id, process_id, ...,
  seq = insert_position,
  rework_pass = 0,      ← 该工序首次执行
  status = 'active',
  note = reason
)
    │
    ▼
UPDATE all nodes with seq >= insert_position: seq += 1
    │
    ▼
Recompute orders.status → Re-render with new node
```

### 5.5 Exception Recording

```
User clicks [记录异常] on a node
    │
    ▼
Show form:
  ┌─────────────────────────────────────┐
  │ 记录异常                             │
  │ 节点: P03 太阳纹加工                 │
  │                                      │
  │ 缺陷类型 *: [色差 ▾]                 │
  │ 影响数量 *: [___] 件                 │
  │ 处理方式: [返回电镀 ▾]               │
  │                  [记录异常]           │
  └─────────────────────────────────────┘
    │
    ▼
INSERT INTO exception_events (node_id, type, qty, resolution)
    │
    ▼
Re-render exception list under the flow
```

### 5.6 Data Queries (Page Load)

```javascript
// Order basic info
supabase.from('orders')
  .select('*, customer:customers(name)')
  .eq('id', orderId)
  .single()

// All nodes (ordered by seq)
supabase.from('order_nodes')
  .select('*')
  .eq('order_id', orderId)
  .order('seq', { ascending: true })

// All exceptions for this order
supabase.from('exception_events')
  .select('*')
  .in('node_id', nodeIds)
  .order('created_at', { ascending: false })
```

---

## §6 P5 · Route List（路线模板）

### 6.1 Purpose

查看工厂当前使用的工艺路线模板。

### 6.2 Layout

```
┌──────────────────────────────────────────────┐
│  ← 返回    工艺路线                          │
├──────────────────────────────────────────────┤
│                                              │
│  ┌─ 标准太阳纹+银白路线 ──────────────────┐  │
│  │ 1. P01 冲压成型 · 制一                  │  │
│  │ 2. P03 太阳纹加工 · 制二                │  │
│  │ 3. P04 喷砂 · 制二                      │  │
│  │ 4. P05 银白电镀 · 制三                  │  │
│  │ 5. P07 移印 · 制四                      │  │
│  │ 6. P09 总QC检验 · 总QC                  │  │
│  └──────────────────────────────────────────┘  │
│                                              │
│  ┌─ CD纹+金色路线 ─────────────────────────┐  │
│  │ 1. P01 冲压成型 · 制一                  │  │
│  │ 2. P02 CD纹加工 · 制二                  │  │
│  │ 3. P06 金色电镀 · 制三                  │  │
│  │ 4. P08 装字钉 · 制四                    │  │
│  │ 5. P09 总QC检验 · 总QC                  │  │
│  └──────────────────────────────────────────┘  │
│                                              │
└──────────────────────────────────────────────┘
```

### 6.3 Data Query

```javascript
supabase.from('process_routes')
  .select('*, route_steps(seq, process:processes(code, name, type, default_dept:departments(name)))')
  .eq('is_active', true)
  .order('created_at')
```

---

## §7 P6 · Exception List（异常汇总）

### 7.1 Purpose

跨订单查看所有异常记录。

### 7.2 Layout

```
┌──────────────────────────────────────────────┐
│  ← 返回    异常记录                          │
├──────────────────────────────────────────────┤
│  [类型▾] [时间范围▾]                         │
├──────────────────────────────────────────────┤
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ 色差 · 30件 · 返回电镀                 │  │
│  │ #0088 · P03 太阳纹加工 · 8月6日       │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ 电镀不良 · 15件 · 重做                  │  │
│  │ #0091 · P05 银白电镀 · 8月5日         │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ 划伤 · 5件 · 特采                       │  │
│  │ #0088 · P07 移印 · 8月4日             │  │
│  └────────────────────────────────────────┘  │
│                                              │
└──────────────────────────────────────────────┘
```

### 7.3 Data Query

```javascript
supabase.from('exception_events')
  .select('*, node:order_nodes(order_id, process_name, orders!inner(order_no))')
  .order('created_at', { ascending: false })
  .range(start, end)
```

---

## §8 Shared Components

### 8.1 Navigation Bar

```
┌──────────────────────────────────────────────┐
│  DialFactory    [首页] [订单] [路线] [异常]   │
└──────────────────────────────────────────────┘
```

| Element | Link |
|---------|------|
| DialFactory (logo) | `/` |
| 首页 | `/` |
| 订单 | `/orders` |
| 路线 | `/routes` |
| 异常 | `/exceptions` |

### 8.2 Status Badge

| Status | Color | CSS Class |
|--------|-------|-----------|
| `in_production` / `active` | Blue `#3B82F6` | `.badge-blue` |
| `paused` | Yellow `#F59E0B` | `.badge-yellow` |
| `completed` / `done` | Green `#10B981` | `.badge-green` |
| `waiting` | Grey `#9CA3AF` | `.badge-grey` |

### 8.3 Progress Bar

```
████████████░░░░  60% (3/5 done)
```

| Segment | Color | Represents |
|---------|-------|-----------|
| Green `#10B981` | Done nodes |
| Blue `#3B82F6` | Active node |
| Grey `#9CA3AF` | Waiting nodes |
| Yellow `#F59E0B` | Paused nodes |

### 8.4 Confirm Dialog

Reusable for: 暂停, 返工, 追加工序, 记录异常

```
┌──────────────────────────────────┐
│  Title                           │
│                                  │
│  Content / Form                  │
│                                  │
│         [取消]    [确认]         │
└──────────────────────────────────┘
```

### 8.5 Empty State

```
┌──────────────────────────────────┐
│                                  │
│         (icon)                   │
│      暂无数据                    │
│      description                 │
│                                  │
│    [行动按钮]                    │
│                                  │
└──────────────────────────────────┘
```

---

## §9 Interaction Patterns

### 9.1 Optimistic Update

| Operation | Optimistic | Reason |
|-----------|:---------:|--------|
| Node status change | ✅ Yes | Instant feedback. Revert on API error |
| Order create | ❌ No | Multi-step. Wait for API success |
| Exception record | ❌ No | Append-only. Wait for API |
| Node insert (rework/append) | ❌ No | Seq recomputation. Wait for API |

### 9.2 Error Handling

| Error | User Message | Recovery |
|-------|-------------|----------|
| Network error | "网络不可用，请检查 WiFi 连接后重试" | Retry button |
| API error | "操作失败：[reason]。请重试。" | Retry button |
| FK violation | "无法删除：该数据正在被使用。" | OK button |
| Validation error | Specific field error message | Highlight field |

### 9.3 Loading States

| State | Display |
|-------|---------|
| Page load | Skeleton cards (grey placeholder blocks) |
| Button action | Button text → "处理中..." + spinner + disabled |
| List load more | Spinner at bottom |
| Empty list | Empty state component |

### 9.4 Responsive Target

| Device | Width | Target |
|--------|:----:|--------|
| Tablet (primary) | 768-1024px | 跟单员平板 |
| Desktop | 1024px+ | 管理查看 |
| Mobile | < 768px | 不优化（V1 不做） |

---

## §10 Color System

### 10.1 Status Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-active` | `#3B82F6` | Node active, order in_production |
| `--color-done` | `#10B981` | Node done, order completed |
| `--color-paused` | `#F59E0B` | Node paused, order paused |
| `--color-waiting` | `#9CA3AF` | Node waiting |
| `--color-danger` | `#EF4444` | Overdue, critical warning |
| `--color-reworks` | `#FFF7ED` → `#FFEDD5` → `#FED7AA` | rework_pass 1/2/3+ |

### 10.2 Background Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-page` | `#F9FAFB` | Page background |
| `--bg-card` | `#FFFFFF` | Card background |
| `--bg-input` | `#FFFFFF` | Input background |
| `--bg-muted` | `#F3F4F6` | Disabled state |

---

## §11 V1 Feature Coverage

| # | V1 Feature (10 items) | Page / Component | Status |
|:--|-----------------------|-----------------|:------:|
| 1 | 订单创建 | P3 + Step 2 Confirm | ✅ |
| 2 | 订单列表 | P2 | ✅ |
| 3 | 流程可视化 | P4 Process Flow | ✅ |
| 4 | 节点推进 | P4 [完成] button | ✅ |
| 5 | 节点暂停 | P4 [暂停] + dialog | ✅ |
| 6 | 异常记录 | P4 [记录异常] + form | ✅ |
| 7 | 简单返工 | P4 [返工] button | ✅ |
| 8 | 动态追加节点 | P4 [追加工序] + dialog | ✅ |
| 9 | 状态回退 | (via 恢复操作) | ✅ |
| 10 | 交期预警 | P1 Due Warnings + P2 Card ⏰ | ✅ |

---

> **Phase 1-C-1 Complete. 6 pages, 8 shared components, comprehensive interaction specification. Ready for Phase 1-C-2 UI implementation planning.**
