# Phase 3-B · Change Impact Analysis

> **Status:** Module Modification Plan
> **Principle:** Minimal changes. No schema DDL. No new pages.

---

## 1. Modules Requiring CHANGE

| Module | Change | Reason |
|--------|--------|--------|
| `js/pages/order-create.js` | **Rewrite Step 2** | Manual Route Builder (dept-grouped checklist) |
| `js/domain/order-create.js` | **Modify** | Remove is_required. Add history copy. Build snapshot from selected. |
| `js/domain/node-actions.js` | **Add methods** | +undo(), +reworkSegment() |
| `js/pages/order-detail.js` | **Modify** | Undo button. Cancel order button. Segment rework UI. |
| `js/domain/order-state.js` | **Modify** | Handle 'cancelled' status in derive() |
| `js/pages/dashboard.js` | **Modify** | +cancelled stat card |
| `js/config.js` | **Add** | UNDO_WINDOW_MINUTES = 5 |

## 2. Modules Requiring NO CHANGE

| Module | Reason |
|--------|--------|
| `js/data/orders.js` | API methods sufficient (updateNode, insertNode, bumpSeq, createOrder) |
| `js/data/processes.js` | API methods sufficient |
| `js/data/exceptions.js` | No changes needed |
| `js/data/customers.js` | No changes needed |
| `js/data/client.js` | No changes needed |
| `js/domain/node-state.js` | Transition matrix unchanged |
| `js/domain/validation.js` | Remove is_required check, rest unchanged |
| `js/domain/seq-calc.js` | gapInsertion already supports batch |
| `js/components/*` | All reusable as-is |
| `js/pages/route-list.js` | Unchanged (still read-only) |
| `js/pages/exception-list.js` | Unchanged |
| `js/pages/order-list.js` | Unchanged |
| `js/utils/*` | Unchanged |

## 3. Schema Change

```
NONE for V1.1.

Phase 4 only:
  + users table
  + order_nodes.updated_by
  + orders.created_by
  + RLS update
```

## 4. File Count

```
Modified:  7 JS files
New:       0 files
Deleted:   0 files
Schema:    0 changes

Estimated: ~300 lines added, ~100 lines removed.
```

## 5. Order of Implementation

```
1. config.js              (UNDO_WINDOW_MINUTES)
2. domain/order-state.js  (cancelled status)
3. domain/node-actions.js (+undo, +reworkSegment)
4. domain/order-create.js (remove is_required, history copy)
5. domain/validation.js   (remove is_required check)
6. pages/order-create.js  (Route Builder UI)
7. pages/order-detail.js  (undo button, cancel button, segment rework)
8. pages/dashboard.js     (+cancelled card)
```
