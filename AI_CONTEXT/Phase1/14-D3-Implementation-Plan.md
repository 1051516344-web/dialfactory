# DialFactory Phase 1-C-3 D-3 · Implementation Plan

> **状态：** APPROVED WITH REVISIONS — Updated per Review
> **Phase：** D-3 — P4 Order Detail (Core)
> **参考：** [10-Frontend-Specification.md](10-Frontend-Specification.md) §5 · [11-Frontend-Implementation-Plan.md](11-Frontend-Implementation-Plan.md) §6
> **原则：** 先 Review，再编码。不修改 Freeze。所有写操作经过 API Layer。
> **修订：** 2026-08-06 — 7 Required Revisions Applied

---

## 1. Files to Create / Modify

| File | Action | Purpose |
|------|:------:|---------|
| `js/data/exceptions.js` | **Create** | Exception events API |
| `js/domain/node-state.js` | **Create** | Node transition matrix + action validation |
| `js/domain/node-actions.js` | **Create** | **Orchestration layer.** Coordinates multi-step write operations (REVISION 1) |
| `js/domain/seq-calc.js` | **Create** | Gap-based seq calculation (REVISION 6) |
| `js/domain/validation.js` | **Create** | Business rule validation (qty_out for 检验) |
| `js/components/confirm-dialog.js` | **Create** | Reusable modal dialog |
| `js/components/toast.js` | **Create** | Toast notifications |
| `js/pages/order-detail.js` | **Create** | P4 Order Detail page (thin — delegates to domain) |
| `js/app.js` | **Modify** | Replace P4 placeholder with real route |
| `index.html` | **Modify** | Add new JS files to chain-load |

**Total: 8 new + 2 modified = 10 files**

---

## 2. API Changes

### 2.1 New Module: `js/data/exceptions.js`

```javascript
const ExceptionsAPI = {
  // List exceptions for a set of node IDs
  listByNodeIds(nodeIds):
    → { ok, data: Exception[] }

  // Create a new exception event
  create({ node_id, type, qty, resolution }):
    → { ok, data: Exception }

  // List all exceptions (cross-order, for P6)
  listAll({ type, page, pageSize }):
    → { ok, data: Exception[], count }
};
```

### 2.2 Extended Methods in `js/data/orders.js`

```javascript
// Existing methods remain. New write methods:

// Update a single node
async updateNode(nodeId, fields):
  // fields: { status?, qty_out?, pause_reason?, note? }
  → { ok, data }

// Insert a single node (rework / append)
async insertNode(nodeData):
  // nodeData: { order_id, process_id, process_name, process_code,
  //             dept_id, dept_name, seq, rework_pass, status, note? }
  → { ok, data }

// Batch update seq for nodes in an order
async bumpSeq(orderId, fromSeq, delta, excludeId):
  // UPDATE order_nodes SET seq = seq + delta
  // WHERE order_id = orderId AND seq >= fromSeq AND id != excludeId
  → { ok }
```

---

## 3. Domain Logic

### 3.1 `js/domain/node-state.js` — Explicit Transition Matrix (REVISION 2)

```javascript
const NodeState = {
  // ==========================================
  // ADL-003: Explicit Transition Matrix
  // ==========================================
  TRANSITIONS: {
    'waiting':   { valid: ['active'],                           terminal: false },
    'active':    { valid: ['done', 'paused'],                   terminal: false },
    'paused':    { valid: ['active'],                           terminal: false },
    'done':      { valid: [],                                   terminal: true  }
  },

  // Action → transition mapping
  ACTIONS: {
    advance:  { from: 'active',  to: 'done'   },
    pause:    { from: 'active',  to: 'paused' },
    resume:   { from: 'paused',  to: 'active' },
  },

  // Validate a direct status transition
  validate(from, to):
    → { valid: boolean, error?: string }

  // Get available actions for a node
  getAvailableActions(node):
    → string[]  // e.g. ['advance', 'pause', 'record_exception']
                // REWORK only if status='done'
                // APPEND only if status != 'waiting'

  // Check terminal state
  isTerminal(status): → boolean

  // Check if status can receive new child nodes (REWORK / APPEND)
  canCreateChild(status): → boolean
};
```

**Explicit Transition Matrix:**

| # | Transition | Action | Type | Valid |
|:--|-----------|--------|------|:-----:|
| T1 | `waiting` → `active` | (auto-activate) | Status change | ✅ |
| T2 | `active` → `done` | 完成 | Status change | ✅ |
| T3 | `active` → `paused` | 暂停 | Status change | ✅ |
| T4 | `paused` → `active` | 恢复 | Status change | ✅ |
| T5 | `done` → **REWORK** | 快捷返工 | **Node creation** | ✅ |
| T6 | `active` → **APPEND** | 动态追加 | **Node creation** | ✅ |
| T7 | `paused` → **APPEND** | 动态追加 | **Node creation** | ✅ |
| T8 | `done` → **APPEND** | 动态追加 | **Node creation** | ✅ |
| T9 | `waiting` → `done` | — | — | ❌ |
| T10 | `paused` → `done` | — | — | ❌ |
| T11 | `done` → `active` | — | — | ❌ |

### 3.2 `js/domain/node-actions.js` — Orchestration Layer (REVISION 1)

**Page must NOT directly control multi-step operations.**
All orchestration logic lives in this domain module.

```javascript
const NodeActions = {
  /**
   * Advance: active → done.
   * Orchestrates: validate → complete node → auto-activate next → update order status.
   * Page calls: NodeActions.advance(order, node).then(reRender)
   */
  async advance(order, node, { qtyOut } = {}):
    // 1. NodeState.validate('active', 'done')
    // 2. If process.type='检验': Validation.validateQtyOut(node, qtyOut)
    // 3. OrdersAPI.updateNode(node.id, { status: 'done', qty_out, updated_at })
    // 4. Find next waiting node by seq
    // 5. If exists: OrdersAPI.updateNode(next.id, { status: 'active' })
    // 6. OrdersAPI.updateStatus(OrderState.derive(nodes))
    // Returns: { ok, updatedNodes[], newOrderStatus }

  /**
   * Pause: active → paused.
   */
  async pause(node, pauseReason):
    // 1. NodeState.validate('active', 'paused')
    // 2. OrdersAPI.updateNode(node.id, { status: 'paused', pause_reason, updated_at })
    // 3. OrdersAPI.updateStatus(OrderState.derive(nodes))
    // Returns: { ok, updatedNode, newOrderStatus }

  /**
   * Resume: paused → active.
   */
  async resume(node):
    // 1. NodeState.validate('paused', 'active')
    // 2. OrdersAPI.updateNode(node.id, { status: 'active', pause_reason: null, updated_at })
    // 3. OrdersAPI.updateStatus(OrderState.derive(nodes))
    // Returns: { ok, updatedNode, newOrderStatus }

  /**
   * Rework: done → creates new node, rework_pass = parent.rework_pass + 1.
   * (REVISION 3: differentiated from APPEND by purpose)
   */
  async rework(order, parentNode):
    // 1. NodeState.canCreateChild('done') → true
    // 2. Compute gap-based insertion seq
    // 3. OrdersAPI.insertNode({
    //      order_id, process_id: parentNode.process_id,
    //      process_name: parentNode.process_name,
    //      process_code: parentNode.process_code,
    //      dept_id: parentNode.dept_id, dept_name: parentNode.dept_name,
    //      seq: gapSeq,
    //      rework_pass: parentNode.rework_pass + 1,
    //      status: 'active',
    //      purpose: 'rework',                    ← REVISION 3
    //      parent_node_id: parentNode.id          ← REVISION 4
    //    })
    // 4. OrdersAPI.updateStatus(OrderState.derive(nodes))
    // Returns: { ok, newNode, newOrderStatus }

  /**
   * Append: creates new node, rework_pass = 0.
   * (REVISION 3: differentiated from REWORK by purpose)
   */
  async append(order, parentNode, processId, reason):
    // 1. NodeState.canCreateChild(parentNode.status) → true (non-waiting)
    // 2. Fetch process details from ProcessesAPI
    // 3. Compute gap-based insertion seq
    // 4. OrdersAPI.insertNode({
    //      order_id, process_id, process_name, process_code,
    //      dept_id, dept_name,
    //      seq: gapSeq,
    //      rework_pass: 0,                       ← first time for this process
    //      status: 'active',
    //      purpose: 'append',                     ← REVISION 3
    //      parent_node_id: parentNode.id,         ← REVISION 4
    //      note: reason
    //    })
    // 5. OrdersAPI.updateStatus(OrderState.derive(nodes))
    // Returns: { ok, newNode, newOrderStatus }

  /**
   * Record exception on a node.
   */
  async recordException(nodeId, { type, qty, resolution }):
    // ExceptionsAPI.create({ node_id, type, qty, resolution })
    // Returns: { ok, exception }
};
```

### 3.3 `js/domain/seq-calc.js` — Gap-Based Seq (REVISION 6)

```javascript
const SeqCalc = {
  /**
   * Compute gap-based insertion seq.
   *
   * Strategy: Prefer gaps over global bump.
   *
   * Example:
   *   Before: [10, 20, 30]
   *   Insert after seq=10:
   *     Find gap between 10 and 20 → return 15
   *   Result: [10, 15, 20, 30]  (no bump needed)
   *
   *   Before: [10, 11, 12]  (no gap)
   *   Insert after seq=10:
   *     No gap → bump 11,12 to 21,22 → return 15
   *   Result: [10, 15, 21, 22]
   */
  gapInsertion(nodes, afterSeq):
    → { seq: number, needsBump: boolean, bumpFrom?: number }

  /**
   * If no gap available, compute bump parameters.
   */
  computeBump(nodes, fromSeq, delta):
    → { ids: UUID[], fromSeq: number, delta: number }

  /**
   * Validate seq integrity: no gaps, no duplicates, ordered.
   */
  validate(nodes):
    → { valid: boolean, issues?: string[] }
};
```

**Gap Insertion Rules:**
- Normal flow seq: 10, 20, 30, ... (step size = 10)
- Insert after seq=N: `Math.floor((N.seq + nextAfter(N).seq) / 2)`
- If N is last: `N.seq + GAP_STEP` (default: 10)
- Only bump when gap < 2 (i.e. seq values are consecutive)
- Bump: all nodes with seq ≥ bumpFrom get seq += GAP_STEP

### 3.4 `js/domain/validation.js` — Business Rules

```javascript
const Validation = {
  validateQtyOut(node, qtyOut):
    // process.type === '检验' AND qty_out is empty → INVALID
    → { valid: boolean, error?: string }

  validateDueDate(date):
    → { valid: boolean, error?: string }
};
```

---

## 4. Node State Machine Handling

### 4.1 Five Actions — Data Flow

#### Action 1: 完成 (active → done)

```
User clicks [完成] on active node
    │
    ▼
NodeState.validate('active', 'done')    ← domain validation
    │
    ├── INVALID → Toast: error message, abort
    │
    ▼ VALID
Check: process.type === '检验' ?
    │
    ├── YES → ConfirmDialog: "产出数量 *"
    │         → Validation.validateQtyOut(node, input)
    │         → INVALID → show error, stay on dialog
    │
    ▼ VALID
OrdersAPI.updateNode(nodeId, { status: 'done', qty_out, updated_at })
    │
    ├── FAIL → Toast: error, do NOT auto-activate next
    │
    ▼ SUCCESS
Find nextNode (seq = node.seq + 1)
    │
    ├── exists → OrdersAPI.updateNode(nextNode.id, { status: 'active' })
    │              ├── FAIL → Toast: "下游激活失败，请手动处理", but current node IS done
    │
    ▼
Recalculate order status → OrdersAPI.updateStatus(orderId, derivedStatus)
    │
    ▼
Update local state → re-render affected cards
```

#### Action 2: 暂停 (active → paused)

```
User clicks [暂停] on active node
    │
    ▼
ConfirmDialog: pause_reason selector (6 options)
    │
    ▼ User selects + confirms
OrdersAPI.updateNode(nodeId, {
  status: 'paused',
  pause_reason: selectedValue,
  updated_at
})
    │
    ├── FAIL → Toast: error
    │
    ▼ SUCCESS
Recalculate order status → update + re-render
```

#### Action 3: 恢复 (paused → active)

```
User clicks [恢复] on paused node
    │
    ▼
NodeState.validate('paused', 'active')
    │
    ▼ VALID
OrdersAPI.updateNode(nodeId, {
  status: 'active',
  pause_reason: null,
  updated_at
})
    │
    ├── FAIL → Toast: error
    │
    ▼ SUCCESS
Recalculate order status → update + re-render
```

#### Action 4: 快捷返工 (done → creates new active, rework_pass+1)

```
User clicks [返工] on done node
    │
    ▼
ConfirmDialog: "确认对 [process_name] 执行返工？将创建第 N+1 次执行记录。"
    │
    ▼ User confirms
newSeq = SeqCalc.insertionAfter(node, nodes)    ← node.seq + 1
    │
    ▼
OrdersAPI.insertNode({
  order_id, process_id: node.process_id,
  process_name: node.process_name,
  process_code: node.process_code,
  dept_id: node.dept_id, dept_name: node.dept_name,
  seq: newSeq,
  rework_pass: node.rework_pass + 1,
  status: 'active'
})
    │
    ├── FAIL → Toast: error, abort (no seq bump needed)
    │
    ▼ SUCCESS (returns new node with UUID)
OrdersAPI.bumpSeq(orderId, newSeq, +1, newId)   ← bump subsequent nodes
    │
    ├── FAIL → Toast: "Seq 重算失败，请刷新页面检查顺序"
    │            (non-fatal: data is correct, just seq may have gaps)
    │
    ▼
Recalculate order status → update + refresh full node list + re-render
```

#### Action 5: 动态追加 (creates new active, rework_pass=0)

```
User clicks [追加工序] on any non-waiting node
    │
    ▼
ConfirmDialog:
  - Process selector (dropdown: all active processes)
  - Insert position: "在 [current.process_name] 之后"
  - Reason input (optional, stored in note)
    │
    ▼ User fills + confirms
newSeq = SeqCalc.insertionAfter(node, nodes)
    │
    ▼
Fetch process details: ProcessesAPI.listProcesses() → find selected
    │
    ▼
OrdersAPI.insertNode({
  order_id, process_id: selectedProcess.id,
  process_name: selectedProcess.name,
  process_code: selectedProcess.code,
  dept_id: selectedProcess.default_dept_id,
  dept_name: (from departments cache),
  seq: newSeq,
  rework_pass: 0,          ← first time for this process
  status: 'active',
  note: reason
})
    │
    ├── FAIL → Toast: error
    │
    ▼ SUCCESS
OrdersAPI.bumpSeq(orderId, newSeq, +1, newId)
    │
    ▼
Recalculate order status → refresh + re-render
```

### 4.2 Action Availability Matrix

| node.status | 完成 | 暂停 | 恢复 | 返工 | 追加工序 | 记录异常 |
|:----------:|:---:|:---:|:---:|:---:|:------:|:------:|
| `active` | ✅ | ✅ | — | — | ✅ | ✅ |
| `paused` | — | — | ✅ | — | ✅ | ✅ |
| `done` | — | — | — | ✅ | ✅ | ✅ |
| `waiting` | — | — | — | — | — | — |

---

## 5. Write Operation Flow (REVISION 5)

### 5.1 Error Severity Classification

| Error Type | Examples | Severity | Response |
|-----------|---------|:--------:|---------|
| **Critical** | Primary write fails (updateNode/insertNode returns error) | 🔴 | **Rollback required.** Abort entire operation. No partial state |
| **Non-Critical** | Order status update fails after successful node change | 🟡 | **Warning only.** Data is correct. Status may be stale until next refresh |
| **UI-Only** | Re-render fails, DOM element not found | 🟢 | **Warning only.** Refresh page to restore |

### 5.2 General Write Pattern (with Rollback)

```
User Action
    │
    ▼
NodeState.validate(from, to)          ← 1. Validate transition
    ├── INVALID → abort
    │
    ▼
(Optional) ConfirmDialog.show()       ← 2. Collect input
    ├── CANCEL → abort
    │
    ▼
Primary Write:                        ← 3. Core mutation
  OrdersAPI.updateNode() / insertNode()
    ├── 🔴 FAIL → ROLLBACK (nothing committed), Toast error, abort
    │
    ▼ SUCCESS
Cascade Writes:                       ← 4. Dependent mutations
  ├── Auto-activate next node
  │     ├── 🔴 FAIL → (node IS done. Activation failed. Manual retry needed)
  │     │            NOTE: no rollback of primary write. This is non-critical.
  ├── Bump seq (if needed)
  │     ├── 🟡 FAIL → Toast "Seq重算失败，请刷新页面"
  └── Update order status
        ├── 🟡 FAIL → Toast "状态更新延迟，下次操作自动修正"
    │
    ▼
Update local state                    ← 5. From API response
    │
    ▼
Incremental re-render                 ← 6. DOM patch
    ├── 🟢 FAIL → Warning only
```

### 5.3 Rollback Rules

| Scenario | Rollback? | Rationale |
|----------|:---------:|-----------|
| Primary insertNode fails | N/A (nothing committed) | DB rejected. No cleanup needed |
| Primary updateNode fails | N/A (nothing committed) | DB rejected. No cleanup needed |
| Cascade (activate next) fails | ❌ No | Primary write (node done) is committed. Activation can be done manually |
| Cascade (bump seq) fails | ❌ No | Seq gap is cosmetic. Refresh page to re-sync |
| Cascade (order status) fails | ❌ No | Status is derived. Next action will correct it |

---

## 6. Validation Strategy

### 6.1 Client-side (Domain Layer)

| Rule | Validator | When |
|------|-----------|------|
| Status transition legality | `NodeState.validate()` | Before every write |
| qty_out required for 检验 | `Validation.validateQtyOut()` | Before completing 检验 node |
| qty_out > 0 | `Validation.validateQtyOut()` | Same |
| Process selected for append | Not empty check | Before insertNode |

### 6.2 Server-side (Database Layer)

| Rule | Enforcement |
|------|------------|
| FK constraint | ON DELETE RESTRICT / SET NULL |
| UNIQUE order_no | DB constraint |
| CHECK status IN (...) | DB constraint |
| NOT NULL fields | DB constraint |

### 6.3 Validation Flow

```
Client validation (domain/)
    │
    ├── FAIL → User feedback, no API call
    │
    ▼ PASS
API call (data/)
    │
    ├── DB error → { ok: false, error: "..." }
    │
    ▼ SUCCESS
{ ok: true, data }
```

---

## 7. Page Rendering Strategy

### 7.1 Data Loading

```
OrderDetailPage.render(orderId)
    │
    ├── [Loading] Skeleton flow (5 node placeholders)
    │
    ▼
Promise.all([
    OrdersAPI.getById(orderId),        ← order + customer + all nodes
    ExceptionsAPI.listByNodeIds(...)    ← (after getting nodes)
])
    │
    ▼
State computation:
  ├── OrderState.derive(nodes) → order status
  ├── OrderState.nodeStats(nodes) → progress
  └── Group exceptions by node_id
    │
    ▼
Render sections:
  ├── Info section (order_no, customer, qty, due_date, specs, route_snapshot)
  ├── Process flow (node cards with action buttons)
  └── Exception section (per order, not per node)
```

### 7.2 Incremental Re-render After Mutation

After any mutation:
1. Update the changed nodes in local array
2. Re-derive order status
3. Re-render only affected DOM elements:
   - The node card that changed
   - The next node card (if auto-activated)
   - The info section (progress + status badge)
   - The exception section (if exception recorded)

**No full page reload after mutation.**

### 7.3 Node Card Rendering

```
For each node (sorted by seq):
  ┌──────────────────────────────┐
  │ [►] P03 太阳纹加工   返工×1  │  ← status icon + code + name + rework badge
  │     制二                      │  ← dept_name
  │     进行中 · 8月6日开始       │  ← status label + time
  │                              │
  │  [完成] [暂停] [记录异常]     │  ← actions (conditional)
  │  [返工] [追加工序]            │
  │                              │
  │  ┌ 异常 ──────────────────┐  │
  │  │ 色差 · 30件 · 返回电镀  │  │  ← inline exceptions
  │  └────────────────────────┘  │
  └──────────────────────────────┘
       │
       ▼  (arrow connector to next node)
```

---

## 8. Components Needed

### 8.1 New Components

| Component | File | Purpose |
|-----------|------|---------|
| ConfirmDialog | `js/components/confirm-dialog.js` | Modal: pause reason, rework confirm, append form, exception form, qty_out input |
| Toast | `js/components/toast.js` | Non-blocking notification: success / error / warning |

### 8.2 ConfirmDialog API

```javascript
ConfirmDialog.show({
  title: '暂停原因',
  content: '<select>...</select>',   // HTML string for body
  confirmLabel: '确认暂停',
  onConfirm: (formData) => { ... },  // called on confirm
  onCancel: () => { ... }            // called on cancel/dismiss
});
```

### 8.3 Toast API

```javascript
Toast.show(message, type = 'info', duration = 3000);
// type: 'success' | 'error' | 'info'
// Auto-dismiss after duration. Multiple toasts stack.
```

---

## 9. File Structure After D-3

```
js/
├── data/
│   ├── client.js           ✅ D-0
│   ├── processes.js        ✅ D-1
│   ├── orders.js           ✅ D-2 (+ updateNode, insertNode, bumpSeq)
│   ├── customers.js        ✅ D-2
│   └── exceptions.js       🆕 D-3
│
├── domain/
│   ├── order-state.js      ✅ D-2
│   ├── node-state.js       🆕 D-3
│   ├── seq-calc.js         🆕 D-3
│   └── validation.js       🆕 D-3
│
├── components/
│   ├── nav-bar.js          ✅ D-0
│   ├── skeleton.js         ✅ D-0
│   ├── status-badge.js     ✅ D-2
│   ├── progress-bar.js     ✅ D-2
│   ├── empty-state.js      ✅ D-2
│   ├── confirm-dialog.js   🆕 D-3
│   └── toast.js            🆕 D-3
│
└── pages/
    ├── dashboard.js        ✅ D-2
    ├── order-list.js       ✅ D-2
    ├── order-detail.js     🆕 D-3
    └── route-list.js       ✅ D-1
```

---

## 10. D-3 Validation Plan (REVISION 7)

### 10.1 State Transition Tests

| # | Test | Expected |
|:--|------|----------|
| T1 | `NodeState.validate('active', 'done')` | `{ valid: true }` |
| T2 | `NodeState.validate('active', 'paused')` | `{ valid: true }` |
| T3 | `NodeState.validate('paused', 'active')` | `{ valid: true }` |
| T4 | `NodeState.validate('done', 'active')` | `{ valid: false, error: "已完成节点不可重新激活" }` |
| T5 | `NodeState.validate('waiting', 'done')` | `{ valid: false, error: "等待中节点不可直接完成" }` |
| T6 | `NodeState.validate('paused', 'done')` | `{ valid: false, error: "暂停节点需先恢复再完成" }` |
| T7 | `NodeState.getAvailableActions(doneNode)` | `['rework', 'append', 'record_exception']` |
| T8 | `NodeState.getAvailableActions(waitingNode)` | `[]` |
| T9 | `NodeState.getAvailableActions(activeNode)` | `['advance', 'pause', 'append', 'record_exception']` |
| T10 | `NodeState.getAvailableActions(pausedNode)` | `['resume', 'append', 'record_exception']` |

### 10.2 Invalid Transition Rejection

| # | Test | Expected |
|:--|------|----------|
| R1 | Call `NodeActions.advance()` on `done` node | Aborted. `NodeState.validate()` returns invalid |
| R2 | Call `NodeActions.advance()` on `waiting` node | Aborted |
| R3 | Call `NodeActions.resume()` on `active` node | Aborted |
| R4 | Advance 检验 node without qty_out | `Validation.validateQtyOut()` returns invalid. Dialog stays open |
| R5 | Advance 检验 node with qty_out=0 | `Validation.validateQtyOut()` returns invalid |
| R6 | Advance 检验 node with qty_out=500 | `Validation.validateQtyOut()` returns valid → proceed |

### 10.3 Write Failure Handling

| # | Test | Expected |
|:--|------|----------|
| W1 | `OrdersAPI.updateNode()` returns `{ ok: false }` | Node status unchanged. Toast error. No cascade actions executed |
| W2 | `OrdersAPI.insertNode()` returns `{ ok: false }` | No node created. Toast error. No seq bump |
| W3 | `OrdersAPI.bumpSeq()` returns `{ ok: false }` | Insert succeeded. Toast warning "请刷新页面". Seq gap is non-critical |
| W4 | `OrdersAPI.updateStatus()` returns `{ ok: false }` | Node action succeeded. Toast warning "状态更新延迟" |
| W5 | Network timeout (simulated) | `DB.call()` returns `{ ok: false, error: '...' }`. Toast error |

### 10.4 Freeze Compliance

| # | Check | Method |
|:--|-------|-------|
| F1 | Node states: only `waiting/active/done/paused` used | grep for status strings |
| F2 | No `handing_off` references | grep for 'handing_off' → 0 results |
| F3 | No `rework_strategy` references | grep for 'rework_strategy' → 0 results |
| F4 | `ON DELETE CASCADE` = 0 | Already verified in Phase 1-B |
| F5 | All writes through API layer | Code review: no direct supabase calls in pages/ |
| F6 | `exception_events.node_id` has no FK | Code review: INSERT doesn't rely on FK cascade |

---

## 11. Acceptance Criteria

### 11.1 Core Flow

| # | Criterion |
|:--|-----------|
| 1 | `/orders/:id` renders info section + process flow + exceptions |
| 2 | Node cards render in seq order with correct status colors |
| 3 | Action buttons shown/hidden per availability matrix |
| 4 | Exception records shown inline on respective node cards |

### 11.2 Five Actions

| # | Action | Acceptance |
|:--|--------|-----------|
| 5 | 完成 | active→done. Next waiting → active. 检验 prompts qty_out |
| 6 | 暂停 | active→paused. Dialog shows 6 reason options. pause_reason saved |
| 7 | 恢复 | paused→active. pause_reason cleared |
| 8 | 返工 | done→new active (rework_pass+1). Seq bumped. Orange background |
| 9 | 追加 | new active (rework_pass=0). Process selector. Seq bumped |

### 11.3 State & Validation

| # | Criterion |
|:--|-----------|
| 10 | Illegal transitions blocked with error message |
| 11 | 检验 node completed without qty_out → blocked |
| 12 | Order status auto-derived after each mutation |
| 13 | Progress bar updates after each mutation |

### 11.4 Error & Edge Cases

| # | Criterion |
|:--|-----------|
| 14 | Network error → toast + no state change |
| 15 | Seq bump failure → toast warning + refresh suggestion |
| 16 | 0 nodes → empty state |
| 17 | All nodes done → all green, order="completed", no action buttons |

---

## 12. Freeze Compliance (Pre-flight)

| Check | Expected | Status |
|-------|----------|:------:|
| Tables written | `order_nodes` (UPDATE + INSERT), `orders` (UPDATE status), `exception_events` (INSERT) | ✅ All exist |
| New tables | 0 | ✅ |
| New fields | 0 | ✅ |
| FK policy | RESTRICT on order_nodes.order_id → orders (no CASCADE) | ✅ |
| ADL-001 | Route snapshot preserved (read-only on detail page) | ✅ |
| ADL-002 | Rework = human decision. No auto-routing | ✅ |
| ADL-003 | Node states: waiting/active/done/paused only | ✅ |
| ADP-001~005 | No violation | ✅ |

---

## 13. Risk Assessment

| Risk | Level | Mitigation |
|------|:-----:|-----------|
| Seq inconsistency after failed bumpSeq | Medium | Non-fatal. Refresh page to re-sync |
| Concurrent modification (2 users) | Low | V1: 1-2 users, same room. updated_at provides basic detection |
| Partial write (primary OK, cascade fails) | Medium | Primary write committed. Cascade errors are warnings. User can retry cascading actions |
| Large node count (>20) performance | Low | V1 routes have 5-8 steps. Rework may add a few more. DOM size manageable |

---

> **Plan ready for Review. No code written. Awaiting approval to proceed to D-3 implementation.**
