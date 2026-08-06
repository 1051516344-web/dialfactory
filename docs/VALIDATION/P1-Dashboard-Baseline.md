# DialFactory V1 — Page Baseline

## 1. Page Information

| 项目 | 内容 |
|------|------|
| **Page** | P1 Dashboard |
| **Route** | `#/` |
| **Status** | **BASELINED** |
| **Phase** | Phase 1-C-3 D-2 |
| **Version** | V1.0 |
| **Created** | 2026-08-06 |
| **Module** | `js/pages/dashboard.js` |

---

## 2. Purpose

跟单员打开系统后的第一屏。快速回答核心运营问题。

**V1 能力：**
- 订单状态统计（生产中 / 已暂停 / 已完成）
- 卡顿订单预警（active 节点超过 3 天）
- 交期预警（3 天内到期）
- 部门待办统计（每个部门的 active 节点数量）
- 点击跳转到订单列表或详情

**V1 限制：**
- 不做趋势图 / BI 分析
- 不做实时刷新
- 不做自定义日期范围

---

## 3. Data Dependency

### Tables Used

| Table | Access | Purpose |
|-------|:------:|---------|
| `orders` | SELECT | 订单列表 + 状态统计 |
| `order_nodes` | SELECT | active 节点（卡顿检测 + 部门统计） |
| `departments` | SELECT | dept_id → name 映射 |
| `customers` | (间接) | 通过 orders JOIN 获取 |

### Read / Write

| 操作 | 状态 |
|------|:----:|
| SELECT | ✅ |
| INSERT | ❌ |
| UPDATE | ❌ |
| DELETE | ❌ |

**Read-only page.**

---

## 4. Data Flow

```
DashboardPage.render()
    │
    ├── [Loading] Skeleton.cards(4)
    │
    ├── loadDeptMap()  →  departments (id→name cache)
    │
    └── Promise.all([                              ← CONSTRAINT D-2-004: centralized
    │       OrdersAPI.list({ pageSize: 1000 }),     ← all orders for aggregation
    │       order_nodes WHERE status='active'        ← active nodes only
    │   ])
    │
    ├── computeStats(orders)       → { inProduction, paused, completed }
    ├── computeStalled(activeNodes) → [{ order_id, dept_name, process_name, stalledDays }]
    ├── computeDueSoon(orders)      → [{ id, order_no, due_date }]
    └── computeDeptQueue(activeNodes) → { '制一': 2, '制二': 3, ... }
    │
    ▼
Render:
  ├── Stats cards (3)  → click → /orders
  ├── Stalled section  → click → /orders/:id
  ├── Due warning section → click → /orders/:id
  └── Dept queue grid  → click → /orders
```

---

## 5. API Layer

### Modules Used

| Module | Method | Purpose |
|--------|--------|---------|
| `js/data/orders.js` | `OrdersAPI.list()` | All orders for aggregation |
| `js/data/client.js` | `DB.call()` | Direct dept query (deptMap cache) |

### Key Queries

```javascript
// Orders — all for dashboard aggregation
OrdersAPI.list({ pageSize: 1000 })

// Active nodes — stall detection + dept queue
DB.call(DB.get().from('order_nodes')
  .select('order_id, dept_id, dept_name, status, updated_at, process_name, seq')
  .eq('status', 'active')
  .order('seq', { ascending: true }))
```

---

## 6. Component List

### Page Component

| File | Export | Role |
|------|--------|------|
| `js/pages/dashboard.js` | `DashboardPage.render()` | Orchestrator: fetch → compute → render |

### Internal Functions

| Function | Output |
|----------|--------|
| `computeStats(orders)` | `{ inProduction, paused, completed }` |
| `computeStalled(activeNodes)` | Stalled items sorted by days DESC |
| `computeDueSoon(orders)` | Due items sorted by date ASC |
| `computeDeptQueue(activeNodes)` | `{ deptName: count }` |
| `renderStalledSection()` | Section HTML |
| `renderDueSection()` | Section HTML |
| `renderDeptSection()` | 5-cell grid HTML |

### Shared Components Used

| Component | Usage |
|-----------|-------|
| `Skeleton.cards(4)` | Loading state |
| `EmptyState.render()` | Per-section empty states |
| `StatusBadge` | (indirectly, via order cards not used here) |
| `Format.date()` / `Format.dueDays()` / `Format.stalledSince()` | Date display |

---

## 7. User Interactions

| 用户行为 | 系统响应 |
|---------|---------|
| 打开首页 (`#/`) | 集中加载 orders + active_nodes，渲染 4 个区域 |
| 点击 stats card (生产中/已暂停/已完成) | 导航到 `#/orders` |
| 点击卡顿订单卡片 | 导航到 `#/orders/:id` |
| 点击交期预警卡片 | 导航到 `#/orders/:id` |
| 点击部门待办卡片 | 导航到 `#/orders` |
| 点击 "+ 新建订单" | 导航到 `#/orders/new` |
| 加载失败 | 显示错误提示 + 重试按钮 |

---

## 8. State Handling

### Loading

```
┌──────────────────────────────┐
│ DialFactory        [+ 新建]  │
├──────────────────────────────┤
│ ██████████░░  ████████░░     │  ← 2 skeleton stat cards
│ ██████████░░                  │
│                              │
│ ████████████████░░░░░░░░░░░  │  ← skeleton cards
│ ████████████████░░░░░░░░░░░  │
└──────────────────────────────┘
```

### Success

```
┌──────────────────────────────┐
│ DialFactory        [+ 新建]  │
├──────────────────────────────┤
│  ┌────────┐┌────────┐┌──────┐│
│  │ 生产中  ││ 已暂停  ││已完成 ││
│  │   12   ││    3   ││  45  ││
│  └────────┘└────────┘└──────┘│
│                              │
│ ⚠ 卡顿订单 (2)               │
│ ┌ #0088 · 制三电镀 · 5天 ──┐ │
│ ┌ #0091 · 制二打磨 · 4天 ──┐ │
│                              │
│ ⏰ 交期预警 (1)               │
│ ┌ #0090 · 8月9日 · 还剩3天 ┐ │
│                              │
│ 部门待办                      │
│ [制一:2] [制二:3] [制三:5]   │
│ [制四:1] [总QC:2]            │
└──────────────────────────────┘
```

### Empty Sections

Each section shows independently when its data is empty:

- **Stalled section:** `EmptyState { icon: '✅', title: '无卡顿订单', desc: '所有进行中的订单都在正常流转。' }`
- **Due section:** `EmptyState { icon: '✅', title: '无交期预警', desc: '未来3天内无到期订单。' }`
- **Dept queue:** Shows all 5 departments with count=0

### Error

```
┌──────────────────────────────┐
│ DialFactory                   │
├──────────────────────────────┤
│           ⚠️                 │
│         加载失败              │
│         [重试]               │
└──────────────────────────────┘
```

---

## 9. Validation Checklist

| # | Check | Result |
|:--|-------|:------:|
| 1 | 页面通过 `#/` 路由正常访问 | ✅ |
| 2 | Stats 卡片显示正确计数 | ✅ |
| 3 | 卡顿订单列表显示 active > 3 天的订单 | ✅ |
| 4 | 交期预警显示 3 天内到期的订单 | ✅ |
| 5 | 部门待办显示 5 个部门的 active 节点计数 | ✅ |
| 6 | 点击卡片正确跳转 | ✅ |
| 7 | 空数据区域独立显示 empty state | ✅ |
| 8 | 加载失败显示重试按钮 | ✅ |
| 9 | 数据通过集中式 Promise.all 加载 (CONSTRAINT D-2-004) | ✅ |
| 10 | 所有查询通过 API 层 (CONSTRAINT D-2-002) | ✅ |
| 11 | 无直接 Supabase 调用 | ✅ |
| 12 | 无组件独立请求数据库 | ✅ |

---

## 10. Freeze Compliance

### Schema

| Check | Status |
|-------|:------:|
| 修改数据库表结构 | **NO** |
| 新增字段 | **NO** |
| 修改 FK 策略 | **NO** |
| 查询表：`orders`, `order_nodes`, `departments` | 仅 SELECT |

### ADL

| ID | Status |
|----|:------:|
| ADL-001 | N/A — 不涉及路线创建 |
| ADL-002 | N/A — 不涉及返工 |
| ADL-003 | ✅ — 状态展示基于 order_nodes 聚合 |

### ADP

| ID | Status |
|----|:------:|
| ADP-001~005 | N/A — 不涉及规格/多层/挪用/物料/QC |

### Final

```
Freeze Status: PASS
```

---

## 11. Known Limitations

| # | Limitation | Reason | Target |
|:--|-----------|--------|:------:|
| 1 | 不支持实时刷新 | V1 无 Supabase Realtime | V1.5 |
| 2 | 不支持自定义日期范围 | V1 固定 3 天阈值 | V2 |
| 3 | 不支持趋势图 | V1 不做 BI | V2 |
| 4 | 卡顿检测仅基于 active 节点 | 不含 paused 节点 | — |
| 5 | Dashboard 加载全量 orders (pageSize=1000) | V1 数据量小，可接受 | V1.5 (优化为 DB 聚合) |

---

## 12. Future Extension

| Capability | Phase | Notes |
|-----------|:-----:|-------|
| Realtime dashboard refresh | V1.5 | Supabase channel subscription |
| Trend charts (weekly/monthly) | V2 | 需积累足够历史数据 |
| Customizable stall threshold | V1.5 | CONFIG.STALL_DAYS → user setting |
| DB-level aggregation (COUNT, GROUP BY) | V1.5 | 减少前端传输量 |
| Export dashboard as report | V2 | PDF/CSV |

---

> **Baseline established. Any future modification to P1 must reference this document.**
