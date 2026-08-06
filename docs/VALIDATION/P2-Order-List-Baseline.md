# DialFactory V1 — Page Baseline

## 1. Page Information

| 项目 | 内容 |
|------|------|
| **Page** | P2 Order List |
| **Route** | `#/orders` |
| **Status** | **BASELINED** |
| **Phase** | Phase 1-C-3 D-2 |
| **Version** | V1.0 |
| **Created** | 2026-08-06 |
| **Module** | `js/pages/order-list.js` |

---

## 2. Purpose

浏览、搜索、筛选所有订单。快速定位特定订单并查看其状态。

**V1 能力：**
- 订单卡片列表（分页，20 条/页）
- 4 维筛选：搜索订单号、状态、部门、客户
- 智能排序：卡顿订单自动置顶 → 交期近的优先
- 每张卡片显示：订单号、客户、数量、交期、规格、进度条、状态徽章、预警信息
- 点击卡片进入订单详情

**V1 限制：**
- 不做批量操作
- 不做导出
- 不做高级筛选（日期范围、数量范围）

---

## 3. Data Dependency

### Tables Used

| Table | Access | Purpose |
|-------|:------:|---------|
| `orders` | SELECT | 订单主数据 |
| `order_nodes` | SELECT (batch) | 节点统计：进度、卡顿、当前工序 |
| `customers` | SELECT | 客户名称 |
| `departments` | SELECT | 部门筛选（dept_id → name 映射） |

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
OrderListPage.render(filters)
    │
    ├── [Loading] Skeleton.cards(5) + filter bar
    │
    └── Promise.all([
    │       CustomersAPI.list(),                      ← for filter dropdown
    │       OrdersAPI.list({ filters, page: 0 })      ← main query
    │   ])
    │
    ├── Extract orderIds[]
    │
    └── OrdersAPI.getNodeStats(orderIds)               ← CONSTRAINT D-2-001: batch
    │
    ▼
Merge: orders[] + stats{} per order
    │
    ▼
Sort (client-side):
  1. isStalled → top
  2. due_date ASC
    │
    ▼
Render:
  ├── Filter bar (search + 3 dropdowns)
  ├── Order cards (with progress bar + warning)
  └── "Load more" button (if hasMore)

Filter changes:
  → re-render with new filters, page reset to 0

Dept filter (2-step):
  Step 1: order_nodes WHERE dept_id=X AND status='active' → orderIds
  Step 2: orders WHERE id IN (orderIds)
```

---

## 5. API Layer

### Modules Used

| Module | Method | Purpose |
|--------|--------|---------|
| `js/data/orders.js` | `OrdersAPI.list()` | Paginated orders with filters |
| `js/data/orders.js` | `OrdersAPI.getNodeStats()` | Batch node aggregation |
| `js/data/customers.js` | `CustomersAPI.list()` | Customer dropdown options |
| `js/data/client.js` | `DB.call()` | Direct dept query (deptMap cache) |

### Key Query Patterns

```javascript
// Main list query
OrdersAPI.list({
  status: 'in_production',   // optional filter
  customerId: '...',         // optional filter
  search: '0088',            // ilike on order_no
  deptId: '...',             // 2-step: find orderIds → filter
  page: 0,
  pageSize: 20
})

// Batch node stats — single query for ALL visible orders
OrdersAPI.getNodeStats(['id1', 'id2', ...])  // CONSTRAINT D-2-001
```

### NodeStats Structure

```javascript
{
  [orderId]: {
    total: 5, done: 3, active: 1, paused: 1, waiting: 0,
    currentNode: { process_name, dept_name, updated_at },
    isStalled: true, stalledDays: 5,
    hasNodes: true, progressPercent: 60
  }
}
```

---

## 6. Component List

### Page Component

| File | Export | Role |
|------|--------|------|
| `js/pages/order-list.js` | `OrderListPage.render()` | Page orchestrator |
| | `OrderListPage.onFilter()` | Filter change handler |
| | `OrderListPage.onSearch()` | Search debounce handler |
| | `OrderListPage.loadMore()` | Pagination handler |

### Internal Functions

| Function | Output |
|----------|--------|
| `renderFilterBar()` | Search input + 3 dropdowns |
| `renderOrderCard(order)` | Card with header, meta, progress, warning |
| `renderFull(container, orders, count)` | Full page render |
| `getDeptId(name)` | Name → UUID cache |
| `isDueSoon(dateStr)` | Boolean: within 3 days |

### Shared Components Used

| Component | Usage |
|-----------|-------|
| `StatusBadge.render(status)` | Order status pill on each card |
| `ProgressBar.render(stats)` | Segmented progress bar per card |
| `EmptyState.render()` | No orders state |
| `Skeleton.cards(5)` | Loading state |
| `Format.date()` | Due date display |
| `Format.number()` | Quantity display |
| `Format.dueDays()` | Due warning text |
| `Format.stalledSince()` | Stalled warning text |
| `OrderState.derive()` | Status from node counts (CONSTRAINT D-2-003) |

---

## 7. User Interactions

| 用户行为 | 系统响应 |
|---------|---------|
| 打开订单列表 (`#/orders`) | 加载 orders + node stats，渲染卡片列表 |
| 输入搜索关键词 | 300ms debounce 后重新查询 |
| 选择状态下拉筛选 | 重新查询，page 归零 |
| 选择部门下拉筛选 | 2-step 查询：先找 orderIds → 再查 orders |
| 选择客户下拉筛选 | 重新查询 |
| 点击订单卡片 | 导航到 `#/orders/:id` |
| 点击 "+ 新建订单" | 导航到 `#/orders/new` |
| 点击 "加载更多" | 追加下一页数据到列表 |
| 加载失败 | 显示错误提示 + 重试按钮 |

---

## 8. State Handling

### Loading

```
┌──────────────────────────────┐
│ 订单列表           [+ 新建]  │
├──────────────────────────────┤
│ [🔍 搜索...] [状态▾] [部门▾] │
├──────────────────────────────┤
│ ██████████████░░░░░░░░░░░░░  │  ← 5 skeleton cards
│ ████████████░░░░░░░░░░░░░░░  │
│ ██████████████░░░░░░░░░░░░░  │
│ ██████████░░░░░░░░░░░░░░░░░  │
│ ████████████████░░░░░░░░░░░  │
└──────────────────────────────┘
```

### Success

```
┌──────────────────────────────┐
│ 订单列表           [+ 新建]  │
├──────────────────────────────┤
│ [🔍 搜索...] [生产中▾] [全部▾]│
│ 共 15 条订单                  │
├──────────────────────────────┤
│ ┌ #0088 · 时诺    [生产中] ┐ │
│ │ 500件 · 8月20日 · 太阳纹+银白│
│ │ ████████████░░░ 60% (3/5)  │ │
│ │ ⚠ 制三电镀 · 卡了5天       │ │
│ └────────────────────────────┘ │
│ ┌ #0090 · 飞亚达   [生产中] ┐ │
│ │ 300件 · 8月9日 · CD纹+金色  │ │
│ │ ████████████████ 80% (4/5) │ │
│ │ ⏰ 8月9日 · 还剩3天         │ │
│ └────────────────────────────┘ │
│ ┌ #0085 · 时诺    [已完成]  ┐ │
│ │ 200件 · 7月30日             │ │
│ │ ██████████████████ 100%    │ │
│ └────────────────────────────┘ │
│          [加载更多...]         │
└──────────────────────────────┘
```

### Empty

```
┌──────────────────────────────┐
│ 订单列表           [+ 新建]  │
├──────────────────────────────┤
│ [🔍 搜索...] [全部▾] [全部▾] │
├──────────────────────────────┤
│           📋                 │
│         暂无订单              │
│  点击右上角"新建订单"         │
│  创建第一张订单。            │
└──────────────────────────────┘
```

### Error

```
┌──────────────────────────────┐
│ 订单列表                      │
├──────────────────────────────┤
│           ⚠️                 │
│   加载失败：[error message]    │
│         [重试]               │
└──────────────────────────────┘
```

---

## 9. Validation Checklist

| # | Check | Result |
|:--|-------|:------:|
| 1 | 页面通过 `#/orders` 路由正常访问 | ✅ |
| 2 | 订单卡片显示：order_no, customer, qty, due_date, badge, progress | ✅ |
| 3 | 进度条正确渲染分段颜色 | ✅ |
| 4 | 搜索框按 order_no 筛选 | ✅ |
| 5 | 状态下拉筛选生效 | ✅ |
| 6 | 部门筛选通过 2-step 查询生效 | ✅ |
| 7 | 卡顿订单自动置顶 | ✅ |
| 8 | 卡顿/交期预警正确显示 | ✅ |
| 9 | 点击卡片导航到 `/orders/:id` | ✅ |
| 10 | "加载更多"追加下一页 | ✅ |
| 11 | 空数据显示 empty state | ✅ |
| 12 | Node stats 通过 batch 查询 (CONSTRAINT D-2-001) | ✅ |
| 13 | 状态从 nodes 推导，非直接读取 orders.status (CONSTRAINT D-2-003) | ✅ |
| 14 | 无直接 Supabase 调用 | ✅ |
| 15 | 无 N+1 查询 | ✅ |

---

## 10. Freeze Compliance

### Schema

| Check | Status |
|-------|:------:|
| 修改数据库表结构 | **NO** |
| 新增字段 | **NO** |
| 修改 FK 策略 | **NO** |
| 查询表：`orders`, `order_nodes`, `customers`, `departments` | 仅 SELECT |

### ADL

| ID | Status |
|----|:------:|
| ADL-001 | N/A — 不涉及路线创建 |
| ADL-002 | N/A — 不涉及返工 |
| ADL-003 | ✅ — 进度条和状态基于 order_nodes 聚合 |

### ADP

| ID | Status |
|----|:------:|
| ADP-001~005 | N/A |

### Final

```
Freeze Status: PASS
```

---

## 11. Known Limitations

| # | Limitation | Reason | Target |
|:--|-----------|--------|:------:|
| 1 | 部门筛选需 2-step 查询 | `orders` 表无 `dept_id`。部门属于 `order_nodes` | — (Schema design) |
| 2 | 客户筛选依赖预加载列表 | 客户数据 L3，可能为空 | Phase 1-C data init |
| 3 | 不支持实时更新 | V1 无 Realtime | V1.5 |
| 4 | 排序为客户端排序 | V1 数据量小可接受。大数据需 DB 排序 | V1.5 |
| 5 | 搜索结果无高亮 | V1 简化 | V2 |
| 6 | 不支持批量操作 | V1 单订单操作 | V2 |

---

## 12. Future Extension

| Capability | Phase | Notes |
|-----------|:-----:|-------|
| Realtime list updates | V1.5 | Supabase channel on `orders` + `order_nodes` |
| DB-level sort (stalled first) | V1.5 | Computed column or view |
| Advanced filters (date range, qty range) | V2 | UI + API extension |
| Batch operations (bulk status change) | V2 | Need Change Proposal |
| Export to CSV | V2 | Frontend CSV generation |

---

> **Baseline established. Any future modification to P2 must reference this document.**
