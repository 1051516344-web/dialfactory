# Phase 3-B · Implementation Plan

> **Status:** Awaiting Approval
> **Input:** 5 Design Documents Validated
> **Constraint:** Zero schema changes. No new tables. Application-layer only.

---

## 0. Schema Confirmation

```
New tables:      0
New columns:     0
ALTER TABLE:     0
FK changes:      0
Migration files: 0
RLS changes:     0

V1.1 is a PURE APPLICATION-LAYER update.
All changes are in JS files only.
Database schema remains V1.0 Frozen.
```

---

## 1. Files to Modify

| # | File | Change | Lines |
|:--|------|--------|:-----:|
| 1 | `js/config.js` | +UNDO_WINDOW_MINUTES, +DEPT_ORDER | +5 |
| 2 | `js/domain/order-state.js` | Handle 'cancelled' in derive() | +5 |
| 3 | `js/domain/validation.js` | Remove is_required check | -10 |
| 4 | `js/domain/node-actions.js` | +undo(), +reworkSegment() | +80 |
| 5 | `js/domain/order-create.js` | Remove is_required. History copy. Manual snapshot. | +40 |
| 6 | `js/pages/order-create.js` | Rewrite Step 2: dept-grouped checklist | +120 |
| 7 | `js/pages/order-detail.js` | Undo btn, Cancel btn, Segment Rework UI | +50 |
| 8 | `js/pages/dashboard.js` | +cancelled stat card | +10 |
| 9 | `js/app.js` | No changes needed | 0 |

**Total: 8 files modified. ~320 lines added. ~50 lines removed. 0 new files.**

---

## 2. Route Builder Implementation

### 2.1 Manual Route Creation (Mode 1)

```
File: js/pages/order-create.js (Step 2 rewrite)
File: js/domain/order-create.js (snapshot building)

Changes:
  - Replace template-confirmation UI with dept-grouped checklist
  - Load all 35 processes from ProcessesAPI.listProcesses()
  - Group by dept_name, sorted by dept seq
  - Each process: checkbox, code, name
  - NO is_required locks (all freely toggleable)
  - Search: filter by code or name (client-side)
  - Auto-sort selected by dept sequence
  - [Preview Route Flow] button: show vertical flow
  - [Create Order] button: build snapshot + nodes

Snapshot:
  source: "manual"
  steps: only selected=true processes
  seq: assigned by dept order (gap: 10,20,30...)

Nodes:
  Only selected processes generate nodes
  First node: active, rest: waiting
```

### 2.2 History Copy (Mode 2)

```
File: js/pages/order-create.js (add tab/section)
File: js/domain/order-create.js (snapshot loading)

Logic:
  If orders exist for this customer: show "Copy from previous" option
  Load previous order's route_snapshot.steps
  Pre-select processes that were selected in that order
  Supervisor adjusts freely
  New snapshot: source="history", source_order_id=xxx

Availability: After 1+ orders exist for this customer
```

### 2.3 Template Placeholder (Mode 3)

```
NOT IMPLEMENTED in V1.1.
UI: "Template" tab grayed out with tooltip: "Available after 30+ orders"
Phase 4 will enable this.
```

---

## 3. Rework Implementation

### 3.1 Type A — Single Node (EXISTS)

```
File: js/domain/node-actions.js (rework method — unchanged)
Status: V1.0 already supports. No changes needed.
```

### 3.2 Type B/C — Segment Rework (NEW)

```
File: js/domain/node-actions.js (+reworkSegment)
File: js/pages/order-detail.js (segment rework UI)

Method: NodeActions.reworkSegment(order, failedNode, restartProcessId)

Logic:
  1. Determine segment: all nodes with same dept_id as failedNode
  2. Find segment start: min(seq) for that dept_id
  3. If restartProcessId given: use that as start (Type B, supervisor choice)
  4. If not given: use segment start (Type C, auto-detect)
  5. Range: from restartProcessId to failedNode (inclusive)
  6. Batch INSERT new nodes with:
     - same process_id/name/code/dept as originals
     - rework_pass = parent.rework_pass + 1 (all same)
     - status: first = 'active', rest = 'waiting'
     - seq: gap-based insertion after failedNode
  7. Bump subsequent nodes if needed (SeqCalc)
  8. Recalculate order status

UI:
  [Dept Rework] button on failed node (visible when status='done')
  Dialog: confirm segment range
  "Restart from P12 (first in Dept-2) through P16?"
  Supervisor can adjust start point.
```

---

## 4. Order Control

### 4.1 Cancelled Status

```
File: js/domain/order-state.js (derive handles 'cancelled')
File: js/pages/order-detail.js (cancel button)
File: js/pages/dashboard.js (+cancelled stat)

Implementation:
  derive(): if order.status is 'cancelled', return 'cancelled' (do not override)
  Cancel button: visible when status != 'completed' and != 'cancelled'
  On cancel:
    All active/waiting nodes -> paused
    orders.status = 'cancelled'
    Confirmation dialog required
  Cancelled orders: all action buttons hidden
  Dashboard: 4th stat card "已取消" with count
```

### 4.2 Undo Mechanism

```
File: js/domain/node-actions.js (+undo)
File: js/pages/order-detail.js (undo button)

Method: NodeActions.undo(order, node)

Logic:
  1. Check: Date.now() - node.updated_at < UNDO_WINDOW_MS (5 min)
  2. Undo map:
     'done'   -> 'active'  (undo advance)
     'paused' -> 'active'  (undo pause)
     'active' -> 'waiting' (undo auto-activation)
  3. If undoing 'done' and downstream was auto-activated:
     Deactivate downstream node too
  4. Recalculate order status

UI:
  Gray text "撤销" link on node card
  Visible only within 5-min window of status change
  No confirmation dialog (undo is for correcting mistakes)
```

### 4.3 Audit Preservation

```
Undo:  No audit trail (status is simply reverted)
Cancel: Order preserved with status='cancelled'
Rework: Original nodes preserved. New nodes created.
Exception: Append-only. Never modified or deleted.

Principle: Production records are NEVER destroyed.
           Status can change. Nodes can accumulate.
           Deletion is not an option.
```

---

## 5. Issue I-1 Fix: Empty Department Skip

```
File: js/domain/node-actions.js (advance method modification)

Current: advance() activates next node by seq.
Problem: If next dept has 0 nodes (not selected), flow is stuck.

Fix:
  After completing a node, before auto-activating next:
  1. Find next node by seq
  2. If next node exists: activate it (existing behavior)
  3. If no more nodes in this dept (all done):
     Find first waiting node in NEXT dept (by dept seq)
     If found: activate
     If not found (last dept, all done): order complete

  After completing last node in a dept:
    1. Check: all nodes in current dept done?
    2. If yes: find next dept with nodes (skip empty depts)
    3. Activate first waiting node in that dept
```

---

## 6. Implementation Order

```
Step 1: js/config.js
  Add UNDO_WINDOW_MINUTES = 5
  Add DEPT_ORDER = ['制一','制二','制三','制四','总QC']

Step 2: js/domain/order-state.js
  Add 'cancelled' handling in derive()

Step 3: js/domain/validation.js
  Remove is_required check from validateOrderForm

Step 4: js/domain/node-actions.js
  +undo()
  +reworkSegment()
  Fix empty dept skip in advance()

Step 5: js/domain/order-create.js
  Remove is_required logic
  Build snapshot from selected processes (not confirmed steps)
  Add history copy logic

Step 6: js/pages/order-create.js
  Rewrite Step 2: dept-grouped checklist UI
  Add history copy tab
  Add template placeholder tab (disabled)

Step 7: js/pages/order-detail.js
  +undo button (conditional)
  +cancel order button (conditional)
  +segment rework button (on done nodes)
  Handle cancelled state display

Step 8: js/pages/dashboard.js
  +cancelled stat card (4th card)

Step 9: index.html
  No changes (no new files to add to chain)
```

---

## 7. Testing Plan

### 7.1 Route Creation Tests

```
T1: Manual build with 0 selected -> error "Select at least 1 process"
T2: Manual build with 18 selected -> correct snapshot + 18 nodes
T3: Search "电镀" -> filters to P16 only
T4: Dept grouping -> all 5 depts visible, correct processes under each
T5: History copy from previous order -> same processes pre-selected
T6: History copy then modify -> new snapshot, original unchanged
```

### 7.2 Cancellation Tests

```
T7: Cancel in_production order -> status='cancelled', nodes paused
T8: Cancel paused order -> status='cancelled'
T9: Cancel completed order -> NOT allowed (button hidden)
T10: Cancelled order -> all action buttons hidden
T11: Dashboard shows cancelled count
```

### 7.3 Undo Tests

```
T12: Undo 'done' within 5 min -> status='active', downstream deactivated
T13: Undo 'paused' within 5 min -> status='active', pause_reason=null
T14: Undo after 6 min -> NOT allowed (button hidden)
T15: Undo 'done' on last node -> order status reverts to in_production
```

### 7.4 Rework Tests

```
T16: Type A on P16 -> 1 new node, rework_pass+1, original preserved
T17: Type B on P15 (P21->P15->P16) -> 3 new nodes, correct batch
T18: Type C on P16 (auto P12->P16) -> 4 new nodes, P17+ untouched
T19: Multiple reworks on same node -> rework_pass=2,3 correctly
T20: Rework visual: orange background for rework_pass>0
```

### 7.5 Department Handoff Tests

```
T21: Dept-1 last node done -> Dept-2 first node auto-activated
T22: Dept-2 done, Dept-3 empty -> Dept-4 first node activated (skip)
T23: All depts done -> order 'completed'
T24: Empty dept skip: no nodes in Dept-3/Dept-4 -> QC activated directly
```

---

## 8. Deployment

```
1. Develop locally. Test all 24 test cases.
2. Commit: "V1.1 Factory Trial Version"
3. Push to GitHub. Actions auto-deploy.
4. Verify: https://1051516344-web.github.io/dialfactory/
5. Execute Phase 0 (Day 0 checklist from 40-Trial-Execution-Checklist)
6. Hand to supervisor for trial.
```

---

> **Plan complete. 8 files. 320 lines. 0 schema changes. 24 tests. Awaiting approval.**
