# DialFactory Phase 1-C-3 D-2 · Implementation Plan

> **状态：** Plan — Awaiting Review
> **Phase：** D-2 — P2 Order List + P1 Dashboard
> **参考：** [10-Frontend-Specification.md](10-Frontend-Specification.md) §2-§3 · [11-Frontend-Implementation-Plan.md](11-Frontend-Implementation-Plan.md) §9.4
> **原则：** 先 Review，再编码。不修改 Freeze。

---

## 1. Files to Create / Modify

| File | Action | Purpose |
|------|:------:|---------|
| `js/data/orders.js` | **Create** | Orders + order_nodes API service |
| `js/data/customers.js` | **Create** | Customers API service |
| `js/domain/order-state.js` | **Create** | Derive order status from nodes |
| `js/components/status-badge.js` | **Create** | Status pill component |
| `js/components/progress-bar.js` | **Create** | Segmented progress bar |
| `js/components/empty-state.js` | **Create** | Empty state placeholder |
| `js/pages/order-list.js` | **Create** | P2 Order List page |
| `js/pages/dashboard.js` | **Create** | P1 Dashboard page |
| `js/app.js` | **Modify** | Replace P1 + P2 placeholders |
| `index.html` | **Modify** | Add new JS files to chain-load |

**Total: 8 new files + 2 modified**

---

## 2. Query Design

### 2.1 P2 Order List — Main Query

```sql
-- orders with customer name + node stats
SELECT
  o.id, o.order_no, o.customer_id, o.order_qty, o.due_date,
  o.base_texture, o.plate_color, o.sand_type,
  o.status, o.note, o.created_at, o.updated_at,
  c.name AS customer_name
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
ORDER BY
  -- stalled first (handled in JS after node query)
  o.due_date ASC
```

**Supabase JS equivalent:**
```javascript
supabase.from('orders')
  .select('*, customer:customers(name)')
  .order('created_at', { ascending: false })
  .range(0, 19)
```

### 2.2 P2 — Node Stats (for progress bar + stall detection + dept info)

```sql
SELECT order_id, status, dept_name, process_name, updated_at
FROM order_nodes
WHERE order_id IN (id1, id2, ...)
ORDER BY order_id, seq ASC
```

```javascript
supabase.from('order_nodes')
  .select('order_id, status, seq, dept_name, process_name, updated_at')
  .in('order_id', orderIds)
  .order('seq', { ascending: true })
```

### 2.3 P2 — Filter Queries

```
Filter: status    → .eq('status', value)
Filter: customer  → .eq('customer_id', value)
Filter: search    → .ilike('order_no', `%${q}%`)
Filter: dept      → get order_ids from order_nodes WHERE dept_id=X AND status='active'
```

**Dept filter requires two-step query:**
```javascript
// Step 1: find order_ids with active node in this dept
const { data: nodeOrders } = await supabase.from('order_nodes')
  .select('order_id')
  .eq('dept_id', deptId)
  .eq('status', 'active');

// Step 2: query orders with those IDs
const orderIds = [...new Set(nodeOrders.map(n => n.order_id))];
supabase.from('orders').select('...').in('id', orderIds);
```

### 2.4 P1 Dashboard — Aggregation Queries

```
Stats:   orders.count grouped by status          → 3 counts
Stalled: order_nodes WHERE status='active'
           AND updated_at < now() - 3 days        → stalled order_ids
Due:     orders WHERE due_date < now() + 3 days
           AND status != 'completed'              → due order_ids
Dept:    order_nodes WHERE status='active'
           GROUP BY dept_id                        → 5 counts
```

---

## 3. API Method Design

### 3.1 `js/data/orders.js`

```javascript
const OrdersAPI = {
  // List orders with pagination + optional filters
  list({ status, customerId, search, deptId, page, pageSize }):
    → { ok, data: Order[], count }

  // Get single order with all nodes
  getById(orderId):
    → { ok, data: { ...order, nodes: Node[] } }

  // Get node stats for a set of orders (progress, stall, current node)
  getNodeStats(orderIds):
    → { ok, data: Map<orderId, NodeStats> }

  // Update order status (derived)
  updateStatus(orderId, status):
    → { ok, data }
};
```

**NodeStats structure:**
```javascript
{
  total: 5,                        // total nodes
  done: 3,                         // count where status='done'
  active: 1,                       // count where status='active'
  paused: 1,                       // count where status='paused'
  waiting: 0,                      // count where status='waiting'
  currentNode: {                   // first active node
    process_name: '太阳纹加工',
    dept_name: '制二',
    updated_at: '2026-08-01T...'
  },
  stalledDays: 5,                  // days since currentNode.updated_at (if active > CONFIG.STALL_DAYS)
  isStalled: true
}
```

### 3.2 `js/data/customers.js`

```javascript
const CustomersAPI = {
  // List all active customers
  list():
    → { ok, data: Customer[] }

  // Text search
  search(query):
    → { ok, data: Customer[] }
};
```

---

## 4. Data Aggregation Logic

### 4.1 Order Status Derivation (`js/domain/order-state.js`)

```javascript
const OrderState = {
  derive(nodes):
    // All done → 'completed'
    // All non-done are paused → 'paused'
    // Otherwise → 'in_production'

  nodeStats(nodes, orderId):
    // Count by status
    // Find current active node
    // Calculate stalled days
    // Return NodeStats object
};
```

### 4.2 P2 Order Card — Data Assembly

```
For each order in page:
  1. Render basic info (order_no, customer, qty, due_date)
  2. Render status badge (order.status)
  3. Render progress bar (from nodeStats)
  4. Render spec text ("太阳纹+银白")
  5. If nodeStats.isStalled → ⚠ warning
  6. If due_date < now() + 3d → ⏰ warning
```

### 4.3 P1 Dashboard — Data Assembly

```
Fetch in parallel:
  Promise.all([
    orders.count by status,        // Stats cards
    active_nodes WHERE stalled,    // Stalled orders
    orders WHERE due_soon,         // Due warnings
    active_nodes GROUP BY dept     // Dept queue
  ])

Render:
  Stats cards (3)
  Stalled list (order cards)
  Due warning list
  Dept queue grid (5)
```

---

## 5. Page Component Design

### 5.1 P2 Order List

```
Page structure:
┌────────────────────────────────────┐
│ 订单列表                [+ 新建]   │
├────────────────────────────────────┤
│ [🔍 搜索...] [状态▾] [客户▾] [部门▾]│  ← Filter bar
├────────────────────────────────────┤
│ ┌─ Order Card ──────────────────┐ │
│ │ #0088 · 时诺         生产中    │ │  ← Header: order_no + customer + badge
│ │ 500件 · 8月20日 · 太阳纹+银白 │ │  ← Meta: qty + due_date + specs
│ │ ████████████░░░░  60%         │ │  ← Progress bar
│ │ ⚠ 制三电镀 · 卡了5天          │ │  ← Warning (conditional)
│ └────────────────────────────────┘ │
│ ┌─ Order Card ──────────────────┐ │
│ │ ...                            │ │
│ └────────────────────────────────┘ │
│              [加载更多]            │
└────────────────────────────────────┘

Components used:
  - StatusBadge.render(status)
  - ProgressBar.render({ total, done, active, paused, waiting })
  - EmptyState.render({ icon, title, desc })
  - Skeleton.cards(5)

Filter bar:
  - Search input (debounce 300ms, client-side for order_no)
  - Status dropdown (All / 生产中 / 已暂停 / 已完成)
  - Customer dropdown (All / loaded from CustomersAPI)
  - Department dropdown (All / 制一~总QC)

Pagination:
  - "Load more" button at bottom
  - 20 items per page
  - Append to existing list (not replace)

Sort order (client-side):
  1. Stalled (hasStalledWarning) → top
  2. Due date ASC (closest first)
  3. created_at DESC
```

### 5.2 P1 Dashboard

```
Page structure:
┌────────────────────────────────────┐
│ DialFactory             [+ 新建]   │
├────────────────────────────────────┤
│ ┌────────┐ ┌────────┐ ┌────────┐  │
│ │ 生产中  │ │ 已暂停  │ │ 已完成  │  │  ← Stats cards
│ │   12   │ │    3   │ │   45   │  │
│ └────────┘ └────────┘ └────────┘  │
│                                    │
│ ⚠ 卡顿订单                         │
│ ┌──────────────────────────────┐  │
│ │ #0088 · 时诺 · 制三电镀 · 5天│  │  ← Stalled order chips
│ │ #0091 · 飞亚达 · 制二打磨·4天 │  │
│ └──────────────────────────────┘  │
│                                    │
│ ⏰ 交期预警                         │
│ ┌──────────────────────────────┐  │
│ │ #0090 · 8月9日 · 还剩3天     │  │  ← Due warning chips
│ └──────────────────────────────┘  │
│                                    │
│ 部门待办                           │
│ ┌──────┬──────┬──────┬──────┬────┐│
│ │ 制一  │ 制二  │ 制三  │ 制四  │QC││  ← Dept queue grid
│ │  2   │  3   │  5   │  1   │ 2 ││
│ └──────┴──────┴──────┴──────┴────┘│
└────────────────────────────────────┘

Components used:
  - StatusBadge.render() (for stats card counts coloring)
  - EmptyState.render() (for each section when empty)

Data fetching:
  - All 4 queries in parallel via Promise.all
  - Single loading state for entire page
  - Section-level empty states (not page-level)
```

---

## 6. Component Specifications

### 6.1 StatusBadge

```javascript
StatusBadge.render(status):
  Input:  'active' | 'done' | 'waiting' | 'paused' |
          'in_production' | 'completed'
  Output: <span class="badge" style="background:X;color:Y">Label</span>
  Source: CONFIG.STATUS_COLORS[status], CONFIG.STATUS_LABELS[status]
```

### 6.2 ProgressBar

```javascript
ProgressBar.render({ total, done, active, paused, waiting }):
  Input:  count of each status
  Output: <div class="progress-bar">
            <div class="seg seg-done"    style="width:X%">
            <div class="seg seg-active"  style="width:X%">
            <div class="seg seg-paused"  style="width:X%">
            <div class="seg seg-waiting" style="width:X%">
          </div>
  Edge:   total = 0 → grey bar 100%
```

### 6.3 EmptyState (JS wrapper for CSS component)

```javascript
EmptyState.render({ icon, title, desc, action }):
  Output: <div class="empty-state">
            <div class="empty-state-icon">{icon}</div>
            <div class="empty-state-title">{title}</div>
            {desc ? <div class="empty-state-desc">{desc}</div> : ''}
            {action ? action : ''}
          </div>
```

---

## 7. Acceptance Criteria

### 7.1 P2 Order List

| # | Criterion | Method |
|:--|-----------|--------|
| 1 | `/orders` renders order cards | Navigate, check DOM |
| 2 | Cards show: order_no, customer, qty, due_date, status badge | Visual |
| 3 | Progress bar renders with correct segments | Visual |
| 4 | Stalled warning (⚠) shows on orders with active node > 3 days | Test with demo data |
| 5 | Due warning (⏰) shows on orders due within 3 days | Test with demo data |
| 6 | Status filter works | Select dropdown, verify |
| 7 | Search by order_no works | Type partial, verify |
| 8 | Dept filter shows orders with active nodes in that dept | Select dept, verify |
| 9 | "Load more" loads next page | Click, verify append |
| 10 | Empty state when no orders | Clear filters, verify |
| 11 | Click card → navigates to `/orders/:id` | Click, check URL |
| 12 | All queries through OrdersAPI | Code review |

### 7.2 P1 Dashboard

| # | Criterion | Method |
|:--|-----------|--------|
| 1 | `/` renders stats cards with correct counts | Navigate, check |
| 2 | Stalled orders list shows orders with correct info | Verify |
| 3 | Due warnings show orders with correct due info | Verify |
| 4 | Dept queue shows 5 departments with counts | Verify |
| 5 | Click stalled card → navigate to order | Click, check URL |
| 6 | Click due warning → navigate to order | Click, check URL |
| 7 | Click dept queue → navigate to `/orders` filtered by dept | Click, check URL |
| 8 | Empty sections show "暂无" message | Test with empty DB |
| 9 | All queries through OrdersAPI | Code review |

---

## 8. Chain-Load Update

`index.html` script chain after D-2:

```javascript
const scripts = [
  'js/data/client.js',
  'js/data/processes.js',     // D-1
  'js/data/orders.js',         // D-2 new
  'js/data/customers.js',      // D-2 new
  'js/domain/order-state.js',  // D-2 new
  'js/components/status-badge.js',  // D-2 new
  'js/components/progress-bar.js',  // D-2 new
  'js/components/empty-state.js',   // D-2 new
  'js/pages/route-list.js',    // D-1
  'js/pages/order-list.js',    // D-2 new
  'js/pages/dashboard.js',     // D-2 new
  'js/app.js'
];
```

---

## 9. Freeze Compliance Check (Pre-flight)

| Check | Expected | Status |
|-------|----------|:------:|
| Tables queried | `orders`, `order_nodes`, `customers`, `departments` (all existing) | ✅ |
| New tables | 0 | ✅ |
| New fields | 0 | ✅ |
| FK policy change | None | ✅ |
| ADL violation | None (read-only from these pages) | ✅ |
| ADP violation | None | ✅ |

---

> **Plan ready for Review. No code written yet. Awaiting approval to proceed to D-2 implementation.**
