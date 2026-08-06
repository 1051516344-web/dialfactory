# DialFactory Phase 1-C-2 · Frontend Implementation Plan

> **状态：** Planning
> **阶段：** Phase 1-C-2 — Implementation Planning
> **前置：** [09-Application-Architecture.md](09-Application-Architecture.md) · [10-Frontend-Specification.md](10-Frontend-Specification.md)
> **原则：** 只规划，不写代码。不修改 Freeze。

---

## 1. 前端目录结构

```
dialfactory/
├── index.html                          ← SPA entry point + PWA meta
├── manifest.json                       ← PWA manifest (V1.5 enable)
│
├── css/
│   ├── reset.css                       ← CSS reset / normalize
│   ├── variables.css                   ← CSS custom properties (colors, spacing, fonts)
│   ├── layout.css                      ← Grid, page shell, nav bar, card base
│   ├── components.css                  ← Badge, progress bar, dialog, empty state
│   ├── flow.css                        ← Process flow specific styles
│   └── pages.css                       ← Page-specific overrides
│
├── js/
│   ├── app.js                          ← App init, router, global state
│   ├── config.js                       ← SUPABASE_URL, ANON_KEY, constants
│   │
│   ├── data/
│   │   ├── client.js                   ← Supabase client singleton
│   │   ├── orders.js                   ← orders + order_nodes CRUD
│   │   ├── processes.js                ← processes + routes + steps reads
│   │   ├── exceptions.js               ← exception_events CRUD
│   │   └── customers.js                ← customers reads
│   │
│   ├── domain/
│   │   ├── order-state.js              ← orders.status derivation
│   │   ├── node-state.js               ← node status transition validator
│   │   ├── seq-calc.js                 ← seq recomputation logic
│   │   └── validation.js               ← Form + business rule validation
│   │
│   ├── components/
│   │   ├── nav-bar.js                  ← Top navigation bar
│   │   ├── status-badge.js             ← Status pill (color + label)
│   │   ├── progress-bar.js             ← Segmented progress bar
│   │   ├── confirm-dialog.js           ← Reusable modal dialog
│   │   ├── empty-state.js              ← Empty state placeholder
│   │   ├── skeleton.js                 ← Loading skeleton
│   │   └── toast.js                    ← Toast notification
│   │
│   ├── pages/
│   │   ├── dashboard.js                ← P1 · /
│   │   ├── order-list.js               ← P2 · /orders
│   │   ├── order-create.js             ← P3 · /orders/new
│   │   ├── order-detail.js             ← P4 · /orders/:id
│   │   ├── route-list.js               ← P5 · /routes
│   │   └── exception-list.js           ← P6 · /exceptions
│   │
│   └── utils/
│       ├── format.js                   ← Date, duration, number formatters
│       ├── dom.js                      ← DOM helpers (createElement, $, $$)
│       └── router.js                   ← Hash-based SPA router
│
└── supabase/
    └── migrations/                     ← (unchanged, Phase 1-B output)
```

### 1.1 File Count & Size Budget

| Category | Files | Target Total Size | Notes |
|----------|:-----:|:-----------------:|-------|
| HTML | 1 | < 2 KB | SPA shell |
| CSS | 6 | < 15 KB | No framework, custom properties |
| JS · Infrastructure | 4 | < 8 KB | app, config, router, dom utils |
| JS · Data Layer | 5 | < 12 KB | Supabase queries |
| JS · Domain | 4 | < 8 KB | Pure logic, no DOM |
| JS · Components | 7 | < 15 KB | Reusable UI |
| JS · Pages | 6 | < 25 KB | Page-level orchestration |
| JS · Utils | 2 | < 5 KB | Formatters |
| **Total** | **35** | **< 90 KB** | Well under V13's 53 KB for logic, but richer UI |

---

## 2. Vanilla JS 模块划分

### 2.1 Module Pattern

每个 JS 文件使用 IIFE 或 ES Module 模式导出：

```javascript
// pattern: named export object
// js/components/status-badge.js

const StatusBadge = (() => {
  const COLOR_MAP = {
    active:        { bg: '#DBEAFE', text: '#1D4ED8', label: '进行中' },
    done:          { bg: '#D1FAE5', text: '#047857', label: '已完成' },
    waiting:       { bg: '#F3F4F6', text: '#6B7280', label: '等待中' },
    paused:        { bg: '#FEF3C7', text: '#B45309', label: '已暂停' },
    in_production: { bg: '#DBEAFE', text: '#1D4ED8', label: '生产中' },
    completed:     { bg: '#D1FAE5', text: '#047857', label: '已完成' },
  };

  function render(status) {
    const c = COLOR_MAP[status] || COLOR_MAP.waiting;
    return `<span class="badge" style="background:${c.bg};color:${c.text}">${c.label}</span>`;
  }

  return { render };
})();
```

### 2.2 Dependency Graph

```
app.js
  ├── config.js                          (no deps)
  ├── utils/router.js                    (no deps)
  ├── utils/format.js                    (no deps)
  ├── utils/dom.js                       (no deps)
  │
  ├── data/client.js                     → config.js
  ├── data/orders.js                     → client.js
  ├── data/processes.js                  → client.js
  ├── data/exceptions.js                 → client.js
  ├── data/customers.js                  → client.js
  │
  ├── domain/order-state.js              (pure logic)
  ├── domain/node-state.js               (pure logic)
  ├── domain/seq-calc.js                 (pure logic)
  ├── domain/validation.js               (pure logic)
  │
  ├── components/nav-bar.js              → dom.js
  ├── components/status-badge.js         (pure render)
  ├── components/progress-bar.js         (pure render)
  ├── components/confirm-dialog.js       → dom.js
  ├── components/empty-state.js          (pure render)
  ├── components/skeleton.js             (pure render)
  ├── components/toast.js                → dom.js
  │
  └── pages/*                            → data/* + domain/* + components/*
```

### 2.3 Loading Strategy

| Tier | Files | Load Method |
|------|-------|------------|
| **Critical** | app.js, config.js, router.js, dom.js, client.js | `<script>` in index.html |
| **Page-level** | pages/*.js | Dynamic import on route change |
| **Lazy** | components/* (non-critical) | Loaded with parent page |

V1 简化策略：所有 JS 文件以 `<script type="module">` 加载。浏览器原生 ES Module 支持。不引入打包工具。

---

## 3. Supabase API Service Layer

### 3.1 Client Singleton

```javascript
// js/data/client.js
// Single Supabase client instance. Imported by all data modules.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const URL = 'https://wzfkmwrqnvjegunjueka.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

export const supabase = createClient(URL, KEY);
```

### 3.2 API Module Signatures

#### orders.js

```javascript
// Query
async function list(filters)        // { status?, dept_id?, customer_id?, search?, page? }
async function getById(id)          // order + customer name + all nodes + exceptions
async function getNodes(orderId)    // nodes ordered by seq

// Mutate
async function create(input)        // { order_no, customer_id, ..., route_id }
async function createNodes(nodes)   // batch insert order_nodes
async function updateOrder(id, data)
async function updateNode(id, data) // status, qty_out, pause_reason, note
async function insertNode(node)     // single node insert (rework / append)
async function updateSeq(orderId, fromSeq, delta)  // seq recomputation

// Derived
function deriveOrderStatus(nodes)   // in_production / paused / completed
```

#### processes.js

```javascript
async function listRoutes()              // active routes
async function getRouteWithSteps(id)     // route + steps + process details
async function listProcesses()           // all active processes
```

#### exceptions.js

```javascript
async function listByOrder(orderId)      // exceptions for an order
async function listAll(filters, page)    // paginated, filterable
async function create(event)             // { node_id, type, qty, resolution }
```

#### customers.js

```javascript
async function list()                    // all active customers
async function search(query)             // text search on name
```

### 3.3 Error Handling Wrapper

Every API call wrapped with a standard error handler:

```javascript
async function apiCall(promise) {
  try {
    const { data, error } = await promise;
    if (error) throw error;
    return { ok: true, data };
  } catch (err) {
    console.error('[API]', err);
    return { ok: false, error: err.message };
  }
}
```

---

## 4. 六个页面开发顺序

### 4.1 Phase Dependencies

```
Phase D-0: Infrastructure
    │
    ├── config.js, client.js, router.js, dom.js, format.js
    ├── CSS: variables.css, reset.css, layout.css
    └── index.html shell
    │
    ▼
Phase D-1: P5 Route List (simplest page)
    │   验证: Supabase 连通性 + 数据读取模式
    │
    ▼
Phase D-2: P2 Order List (+ P1 Dashboard)
    │   验证: 列表渲染 + 筛选 + 分页 + 状态组件
    │
    ▼
Phase D-3: P4 Order Detail (核心)
    │   验证: 流程图 + 节点操作 + 异常记录
    │
    ▼
Phase D-4: P3 Order Create
    │   验证: 表单 + ADL-001 路线确认 + multi-insert
    │
    ▼
Phase D-5: P6 Exception List + Polish
        验证: 跨页面数据 + UI polish
```

### 4.2 Rationale

| Order | Page | Reason |
|:-----:|------|--------|
| D-0 | Infra | Foundation. Nothing works without it |
| D-1 | P5 Routes | Simplest: 1 table read. Validates Supabase connectivity end-to-end |
| D-2 | P2+P1 | List rendering pattern established. Stats + filters |
| D-3 | P4 Detail | **Core complexity.** Must work before Create (Create → navigates to Detail) |
| D-4 | P3 Create | Depends on P4 to display result. ADL-001 workflow |
| D-5 | P6 + Polish | Cross-cutting. Exception aggregation. Final polish |

---

## 5. 核心组件拆分

### 5.1 Component Tree

```
index.html
└── <div id="app">
    ├── nav-bar.js                    ← Always mounted
    │   └── links × 4                ← Pure render
    │
    └── <main id="page-container">   ← Swapped by router
        │
        ├── [P1] dashboard.js
        │   ├── stats-cards × 3      ← Inline render
        │   ├── stalled-list         ← status-badge + format.js
        │   ├── due-warnings         ← format.js
        │   └── dept-queue           ← progress-bar
        │
        ├── [P2] order-list.js
        │   ├── filter-bar           ← Inline
        │   ├── order-card × N
        │   │   ├── status-badge
        │   │   └── progress-bar
        │   └── skeleton × N         ← Loading state
        │
        ├── [P3] order-create.js
        │   ├── step-1: form         ← validation.js
        │   └── step-2: route-confirm
        │       └── step-row × N     ← Toggle switch
        │
        ├── [P4] order-detail.js     ← ⭐ Core
        │   ├── info-section
        │   ├── process-flow
        │   │   └── node-card × N
        │   │       ├── status-badge
        │   │       ├── rework-badge
        │   │       └── action-buttons (conditional)
        │   ├── confirm-dialog       ← Shared
        │   └── exception-section
        │       └── exception-card × N
        │
        ├── [P5] route-list.js
        │   └── route-card × N
        │       └── step-row × N
        │
        └── [P6] exception-list.js
            └── exception-card × N
                └── status-badge
```

### 5.2 Shared Component Summary

| Component | Used By | Complexity | Dependencies |
|-----------|:------:|:---------:|-------------|
| `nav-bar` | All | Low | router.js |
| `status-badge` | P2, P4 | Low | None (pure render) |
| `progress-bar` | P2, P1 | Low | None (pure render) |
| `confirm-dialog` | P4 | Medium | dom.js |
| `empty-state` | All | Low | None |
| `skeleton` | P2 | Low | None |
| `toast` | All | Low | dom.js |

---

## 6. P4 Order Detail 详细实现方案

### 6.1 Why P4 is the Core

Order Detail is the most complex page. It combines:
- 5 distinct node actions (完成, 暂停, 恢复, 返工, 追加工序)
- Exception recording inline
- Real-time state recalculation (order status derived from nodes)
- Seq recomputation on insert
- Conditional UI based on node status

### 6.2 Data Loading (on page enter)

```
Step 1: GET /orders/:id
  → orders + customer name (JOIN)

Step 2: GET /order_nodes?order_id=:id&order=seq
  → array of nodes

Step 3: GET /exception_events?node_id=in(nodeIds)
  → grouped by node_id

Step 4: Render
  → Basic info section
  → Process flow (node cards)
  → Exception list
```

All 3 queries fire in parallel via `Promise.all`.

### 6.3 Process Flow Rendering

```
Algorithm: renderFlow(nodes, exceptions)

1. Sort nodes by seq ASC
2. Group exceptions by node_id into Map<nodeId, Event[]>
3. For each node:
   a. Determine card style from node.status
   b. Render status icon + process_name + dept_name
   c. If rework_pass > 0: render rework badge
   d. Determine available actions (see matrix below)
   e. If exceptions for this node: render inline exception list
   f. If not last node: render arrow connector
4. Update info section (progress bar, current status)
```

### 6.4 Action Availability Matrix

| node.status | 完成 | 暂停 | 恢复 | 返工 | 追加工序 | 记录异常 |
|:----------:|:---:|:---:|:---:|:---:|:------:|:------:|
| `active` | ✅ | ✅ | — | — | ✅ | ✅ |
| `paused` | — | — | ✅ | — | ✅ | ✅ |
| `done` | — | — | — | ✅ | ✅ | ✅ |
| `waiting` | — | — | — | — | — | — |

### 6.5 Action Implementation Details

#### 完成 (active → done)

```
1. If process.type === '检验':
     Show confirm-dialog with qty_out input
     Wait for user input
2. Call orders.updateNode(nodeId, { status: 'done', qty_out })
3. Find next node with seq = current.seq + 1
     If exists: call orders.updateNode(nextId, { status: 'active' })
4. Re-derive order status → call orders.updateOrder(orderId, { status })
5. Re-render flow
```

**Optimistic:** No. Status transition is critical — wait for API confirmation.

#### 暂停 (active → paused)

```
1. Show confirm-dialog with pause_reason options
2. Wait for user selection
3. Call orders.updateNode(nodeId, { status: 'paused', pause_reason })
4. Re-derive order status → update + re-render
```

#### 恢复 (paused → active)

```
1. Call orders.updateNode(nodeId, { status: 'active', pause_reason: null })
2. Re-derive + re-render
```

#### 快捷返工 (done → new active)

```
1. Show confirmation: "确认对 [process_name] 执行返工？"
2. Compute insertion:
     newSeq = current.seq + 1
3. Call orders.insertNode({
     order_id, process_id, process_name, process_code,
     dept_id, dept_name,
     seq: newSeq,
     rework_pass: current.rework_pass + 1,
     status: 'active'
   })
4. Call orders.updateSeq(orderId, newSeq, +1)  // bump all subsequent nodes
5. Re-derive + re-render
```

**Seq recomputation (seq-calc.js):**
```
function bumpSeq(orderId, fromSeq, delta):
  UPDATE order_nodes
  SET seq = seq + delta
  WHERE order_id = orderId AND seq >= fromSeq AND id != newlyInsertedId
```

#### 动态追加节点

```
1. Show confirm-dialog:
     - Process selector (dropdown: all active processes)
     - Insert position: "在 [current.process_name] 之后"
     - Reason input (optional)
2. Call orders.insertNode({
     order_id, process_id, process_name, process_code,
     dept_id, dept_name,
     seq: newSeq,
     rework_pass: 0,       // new process for this order
     status: 'active',
     note: reason
   })
3. Call orders.updateSeq(orderId, newSeq, +1)
4. Re-derive + re-render
```

#### 记录异常

```
1. Show confirm-dialog with exception form:
     - type: dropdown (6 presets)
     - qty: number input
     - resolution: dropdown (5 presets)
2. Call exceptions.create({ node_id, type, qty, resolution })
3. Re-fetch exceptions for this order → re-render exception section
```

### 6.6 State Derivation (order-state.js)

```
function deriveOrderStatus(nodes):
  if (nodes.every(n => n.status === 'done'))     → 'completed'
  if (nodes.filter(n => n.status !== 'done')
             .every(n => n.status === 'paused')) → 'paused'
  return 'in_production'
```

### 6.7 Re-render Strategy

After any mutation:
1. Update local nodes array (optimistic or from API response)
2. Re-derive order status
3. Re-render only affected sections:
   - Node that changed → update card
   - Next node (if auto-activated) → update card
   - Info section → update progress + status badge
   - Exception section → update if new exception added

**Incremental DOM update:** Compare new state with cached state. Only patch changed elements.

---

## 7. 数据流设计

### 7.1 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     PAGE (read)                          │
│                                                         │
│  Router → page.render()                                 │
│             │                                           │
│             ▼                                           │
│       data/orders.getById(id)                           │
│             │                                           │
│             ▼                                           │
│       data/client.js → Supabase REST                    │
│             │                                           │
│             ▼                                           │
│       return { ok, data }                               │
│             │                                           │
│             ▼                                           │
│       Build view model (merge order + nodes + exceptions)
│             │                                           │
│             ▼                                           │
│       Render DOM                                        │
│                                                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                     PAGE (write)                         │
│                                                         │
│  User action → page handler                             │
│                   │                                     │
│                   ▼                                     │
│            domain/node-state.validate(from, to)          │
│                   │                                     │
│              ┌────┴────┐                                │
│              │ INVALID  │ → show error, abort            │
│              └────┬────┘                                │
│                   │ VALID                               │
│                   ▼                                     │
│            data/orders.updateNode(...)                   │
│                   │                                     │
│                   ▼                                     │
│            domain/order-state.derive(nodes)              │
│                   │                                     │
│                   ▼                                     │
│            data/orders.updateOrder(status)               │
│                   │                                     │
│                   ▼                                     │
│            Update local state → Re-render impacted DOM   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 7.2 State Architecture

```
Global State (app.js)
  ├── currentRoute          ← string, set by router
  ├── currentUser           ← null in V1 (future: auth user)
  └── loading               ← boolean, global loading bar

Page State (per page, destroyed on navigation)
  ├── P4: order             ← single order object
  ├── P4: nodes[]           ← array of node objects
  ├── P4: exceptions{}      ← Map<nodeId, exception[]>
  └── P4: dirty             ← set of node IDs needing re-render

Cache (data layer)
  ├── processes[]           ← rarely changes, cache on first load
  ├── departments[]         ← 5 rows, cache permanently
  └── routes[]              ← cache on first load
```

### 7.3 Mutation Flow (Example: Node Complete)

```
1. User clicks [完成] on node #3
2. Page handler calls node-state.validate('active', 'done')
   → PASS
3. Page handler calls orders.updateNode(#3, {status:'done', updated_at:now})
   → API call → { ok: true }
4. Page handler finds node #4 (seq = 3+1)
   → calls orders.updateNode(#4, {status:'active'})
   → API call → { ok: true }
5. Page handler calls order-state.derive(nodes)
   → all nodes not done, not all paused → 'in_production'
   → (no change needed for order status)
6. Update local nodes array:
   nodes[2].status = 'done'
   nodes[3].status = 'active'
7. Re-render:
   - Node card #3: green (done), remove action buttons
   - Node card #4: blue (active), add action buttons
   - Progress bar: 3/5 → 4/5
```

---

## 8. Demo 订单测试流程

### 8.1 Test Order Script

以下为 Phase 1-C-3 (Implementation) 完成后，用于端到端验证的 Demo 流程：

```
Step 1: 准备数据
  - departments: 5 rows (已预置 ✅)
  - customers: INSERT '时诺' (SN)
  - processes: INSERT minimum process set (P01, P03, P05, P07, P09)
  - process_routes: INSERT '标准太阳纹+银白路线'
  - route_steps: INSERT 5 steps for the route

Step 2: 创建订单
  - Navigate to /orders/new
  - Fill: order_no='DEMO-2026-0001', customer='时诺', qty=500
  - Select route '标准太阳纹+银白路线'
  - Confirm all 5 steps
  - Submit → Navigate to /orders/:id

Step 3: 验证流程渲染
  - Check: 5 node cards rendered
  - Check: Node #1 is active (blue), others waiting (grey)
  - Check: Progress bar shows 0/5

Step 4: 推进节点
  - Click [完成] on Node #1
  - Verify: Node #1 → green (done)
  - Verify: Node #2 → blue (active, auto-activated)
  - Verify: Progress bar 1/5

Step 5: 记录异常 + 暂停
  - Click [记录异常] on Node #2
  - Fill: type='色差', qty=30, resolution='返回电镀'
  - Submit
  - Click [暂停] on Node #2
  - Select: '质量问题待处理'
  - Verify: Node #2 → yellow (paused)
  - Verify: Order status → 'paused'

Step 6: 恢复 + 继续
  - Click [恢复] on Node #2
  - Verify: Node #2 → blue (active)
  - Complete Node #2, #3 (P05 银白电镀)

Step 7: 返工
  - Click [返工] on Node #3 (done)
  - Confirm dialog
  - Verify: New node inserted after #3
  - Verify: New node has rework_pass=1, orange background
  - Verify: Subsequent nodes' seq incremented

Step 8: 动态追加
  - Click [追加工序] on new rework node
  - Select: 'P04 喷砂'
  - Insert after current
  - Verify: New node with rework_pass=0 (first time for this process)
  - Verify: Seq correctly recomputed

Step 9: 总QC
  - Complete all remaining nodes
  - On 总QC (检验 type): prompted for qty_out
  - Enter: 470
  - Complete → Order status → 'completed'

Step 10: 验证完成状态
  - All nodes green (done)
  - Progress bar 100%
  - Order list shows DEMO-0001 as '已完成'
  - Dashboard stats updated
```

### 8.2 Demo Data SQL

```sql
-- Phase 1-C-3 执行（当前阶段不执行）
INSERT INTO customers (name, code) VALUES ('时诺', 'SN');

INSERT INTO processes (code, name, type, default_dept_id) VALUES
  ('P01', '冲压成型', '加工', (SELECT id FROM departments WHERE name='制一')),
  ('P03', '太阳纹加工', '加工', (SELECT id FROM departments WHERE name='制二')),
  ('P05', '银白电镀', '加工', (SELECT id FROM departments WHERE name='制三')),
  ('P07', '移印', '加工', (SELECT id FROM departments WHERE name='制四')),
  ('P09', '总QC检验', '检验', (SELECT id FROM departments WHERE name='总QC'));

INSERT INTO process_routes (name) VALUES ('标准太阳纹+银白路线');

INSERT INTO route_steps (route_id, process_id, seq) VALUES
  ((SELECT id FROM process_routes WHERE name='标准太阳纹+银白路线'),
   (SELECT id FROM processes WHERE code='P01'), 1),
  -- ... (P03=2, P05=3, P07=4, P09=5);
```

---

## 9. 开发阶段拆分

### 9.1 Phase Breakdown

| Phase | Content | Files | Est. Effort | Acceptance |
|:-----:|---------|:-----:|:-----------:|-----------|
| **D-0** | Infrastructure | ~12 | Small | Router works, Supabase connects |
| **D-1** | P5 Route List | ~3 | Small | Read data from Supabase, render list |
| **D-2** | P2 List + P1 Dashboard | ~8 | Medium | Filter, sort, search orders. Dashboard stats. |
| **D-3** | P4 Order Detail | ~10 | **Large** | Full process flow with all 5 node actions |
| **D-4** | P3 Order Create | ~3 | Medium | 2-step wizard, ADL-001 confirmation |
| **D-5** | P6 Exceptions + Polish | ~5 | Small | Cross-order exception view. UI polish. |

### 9.2 Phase D-0: Infrastructure

**Goal:** App shell renders. Router navigates. Supabase client connects and queries successfully.

**Files:**
```
index.html, manifest.json
css/reset.css, css/variables.css, css/layout.css
js/config.js, js/app.js
js/utils/router.js, js/utils/dom.js, js/utils/format.js
js/data/client.js
components/nav-bar.js, components/skeleton.js
```

**Acceptance:**
- [ ] `index.html` loads without console errors
- [ ] Hash router navigates between `/`, `/orders`, `/orders/new`, `/orders/:id`, `/routes`, `/exceptions`
- [ ] `supabase.from('departments').select('*')` returns 5 rows
- [ ] Nav bar renders with 4 links
- [ ] CSS variables applied correctly

### 9.3 Phase D-1: P5 Route List

**Goal:** First Supabase-powered page renders correctly. Validates the complete data→render pipeline.

**Files:**
```
js/data/processes.js
js/pages/route-list.js
css/components.css
```

**Acceptance:**
- [ ] `/routes` shows all active routes from database
- [ ] Each route card shows name + step list with seq order
- [ ] Empty state shows when no routes exist
- [ ] Loading skeleton shows during fetch

### 9.4 Phase D-2: P2 Order List + P1 Dashboard

**Goal:** List rendering, filtering, sorting. Dashboard with derived statistics.

**Files:**
```
js/data/orders.js, js/data/customers.js
js/domain/order-state.js
js/pages/order-list.js, js/pages/dashboard.js
components/status-badge.js, components/progress-bar.js
components/empty-state.js
```

**Acceptance:**
- [ ] `/orders` lists orders with cards
- [ ] Card shows: order_no, customer, qty, due_date, status badge, progress bar
- [ ] Filters work: search by order_no, filter by status, filter by dept
- [ ] Sort: stalled orders on top, then by due date
- [ ] `/` dashboard shows stats cards with correct counts
- [ ] Stalled orders list (active > 3 days)
- [ ] Due date warnings (due within 3 days)
- [ ] Department queue counts
- [ ] Click order card → navigates to `/orders/:id` (page not yet built)

### 9.5 Phase D-3: P4 Order Detail (Core)

**Goal:** Full process flow with all interactions. This is the heart of the application.

**Files:**
```
js/data/exceptions.js
js/domain/node-state.js, js/domain/seq-calc.js, js/domain/validation.js
js/pages/order-detail.js
components/confirm-dialog.js, components/toast.js
css/flow.css
```

**Acceptance:**
- [ ] `/orders/:id` renders basic info section (order_no, customer, qty, due_date, specs, route)
- [ ] Process flow renders all nodes as vertical cards with arrows
- [ ] Node cards show correct colors per status (grey/blue/green/yellow)
- [ ] Node cards show correct actions per status matrix (§6.4)
- [ ] **[完成]** button: active → done. Next node auto-activates
- [ ] **[完成]** on 检验 type: prompts for qty_out. Blocks if empty
- [ ] **[暂停]** button: shows pause_reason dialog. active → paused
- [ ] **[恢复]** button: paused → active. pause_reason cleared
- [ ] **[返工]** button: shows confirmation. Creates new node with rework_pass+1
- [ ] **[返工]** seq recomputation: subsequent nodes seq += 1
- [ ] **[追加工序]** button: shows dialog with process selector + reason input
- [ ] **[记录异常]** button: shows form. Inserts exception_events row
- [ ] Order status auto-derived: completed / paused / in_production
- [ ] Progress bar updates after every mutation
- [ ] Exception section shows all exceptions for this order
- [ ] Error handling: network error shows toast + retry
- [ ] State validation: illegal transitions blocked with message

### 9.6 Phase D-4: P3 Order Create

**Goal:** Two-step order creation with ADL-001 route confirmation.

**Files:**
```
js/pages/order-create.js
(no new data/domain files — reuses existing)
```

**Acceptance:**
- [ ] Step 1 form renders: order_no, customer selector, qty, due_date, specs, route selector
- [ ] Customer selector: dropdown (if customers exist) + free-text fallback
- [ ] Route selector loads from `process_routes`
- [ ] Form validation: required fields, qty > 0, due_date ≥ today
- [ ] [下一步] loads Step 2: route steps display
- [ ] Step 2 shows all steps with toggle (confirmed ✅ / cancelled ❌)
- [ ] `is_required=true` steps: toggle disabled, 🔒 icon
- [ ] Confirmed count displayed
- [ ] Submit: creates order + route_snapshot + order_nodes
- [ ] Submit: first node active, rest waiting
- [ ] On success: navigates to `/orders/:newId`
- [ ] On error: shows error message, stays on form

### 9.7 Phase D-5: P6 Exception List + Polish

**Goal:** Cross-order exception view. Final UI polish.

**Files:**
```
js/pages/exception-list.js
css/pages.css (polish)
```

**Acceptance:**
- [ ] `/exceptions` lists all exceptions across orders
- [ ] Each card shows: type, qty, resolution, order_no, process_name, date
- [ ] Filter by type
- [ ] Click navigates to `/orders/:id`
- [ ] UI polish: consistent spacing, hover states, transitions
- [ ] Tablet viewport (768px): all pages usable
- [ ] Demo test flow (§8) executes end-to-end without errors

---

## 10. 每阶段验收标准

### 10.1 Stage Gate Checklist

| Phase | Gate Criteria |
|:-----:|--------------|
| **D-0** | App loads. Router works. Supabase `SELECT` succeeds. |
| **D-1** | One page reads from database and renders correctly. |
| **D-2** | Two pages with lists, filters, derived state. |
| **D-3** | ⭐ All 5 node actions work. Flow renders correctly. State derives correctly. |
| **D-4** | Order creation with ADL-001 confirmation. Navigates to detail on success. |
| **D-5** | Cross-order exception view. Demo flow passes. Tablet-usable. |

### 10.2 Demo Readiness Checklist

Before declaring Phase 1-C complete:

- [ ] Demo order created via UI (not SQL)
- [ ] All 5 node actions executed on demo order
- [ ] At least 1 exception recorded
- [ ] At least 1 rework node created
- [ ] At least 1 dynamic append executed
- [ ] Order completed via UI
- [ ] Dashboard reflects all changes
- [ ] Zero console errors
- [ ] Tablet viewport (768×1024): all interactions reachable

### 10.3 Known Deferred Items (V1.5+)

| Item | Reason |
|------|--------|
| Real-time subscriptions | V1: manual refresh sufficient |
| Offline capability | V1: online-only decision |
| PWA install prompt | V1.5: service worker |
| Advanced filters (date range) | V1: basic filters sufficient |
| Bulk operations | V1: single-order focus |
| Print / export | V1.5 |
| Dark mode | V2 |

---

## Appendix A: Router Specification

### A.1 Hash-based Router

```javascript
// js/utils/router.js
//
// Route table:
//   '/'              → pages/dashboard.js
//   '/orders'        → pages/order-list.js
//   '/orders/new'    → pages/order-create.js
//   '/orders/:id'    → pages/order-detail.js
//   '/routes'        → pages/route-list.js
//   '/exceptions'    → pages/exception-list.js
//
// Usage:
//   router.on('/', () => { ... })
//   router.navigate('/orders/abc-123')
//   router.start()
```

### A.2 Route Change Lifecycle

```
1. Hash change detected (hashchange event)
2. Match route pattern → extract params (e.g., id)
3. Call currentPage.destroy() if exists
4. Call newPage.render({ params })
5. Update nav active link
```

---

## Appendix B: CSS Custom Properties

```css
/* css/variables.css */
:root {
  /* Status */
  --color-active:     #3B82F6;
  --color-done:       #10B981;
  --color-paused:     #F59E0B;
  --color-waiting:    #9CA3AF;
  --color-danger:     #EF4444;

  /* Rework */
  --color-rework-1:   #FFF7ED;
  --color-rework-2:   #FFEDD5;
  --color-rework-3:   #FED7AA;

  /* Surfaces */
  --bg-page:          #F9FAFB;
  --bg-card:          #FFFFFF;
  --bg-input:         #FFFFFF;
  --bg-muted:         #F3F4F6;

  /* Text */
  --text-primary:     #111827;
  --text-secondary:   #6B7280;
  --text-muted:       #9CA3AF;

  /* Spacing */
  --space-xs:         4px;
  --space-sm:         8px;
  --space-md:         16px;
  --space-lg:         24px;
  --space-xl:         32px;

  /* Typography */
  --font-size-sm:     0.875rem;
  --font-size-base:   1rem;
  --font-size-lg:     1.25rem;
  --font-size-xl:     1.5rem;

  /* Border */
  --radius-sm:        4px;
  --radius-md:        8px;
  --radius-lg:        12px;

  /* Shadow */
  --shadow-card:      0 1px 3px rgba(0,0,0,0.1);
  --shadow-dialog:    0 4px 12px rgba(0,0,0,0.15);
}
```

---

> **Phase 1-C-2 Complete. Implementation Plan ready for Review. No code written.**
>
> **Next: Phase 1-C-3 — Implementation (after Plan approval).**
