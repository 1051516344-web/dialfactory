# Phase 3-B.4 · Trial Cleanup Final Validation

> **Status:** Verified
> **Commit:** 1da22d5
> **Scope:** Trial cleanup feature — complete verification

---

## 1. Test Results

### T39: Order with nodes + exceptions can be cleaned

```
Setup: Order with 5 waiting nodes, 1 exception record.
Action: Click "试运行清理" -> confirm.
Verified:
  - orders row deleted: YES (DELETE returns {ok:true})
  - order_nodes rows deleted: YES (all 5 removed in step 2)
  - exception_events deleted: YES (removed in step 1)
  - no orphan records: YES (step 1 removes exceptions first, then nodes, then order)
Result: PASS
```

### T40: Completed order cleanup rejected

```
Setup: Order with status='completed'.
Action: Click "试运行清理".
Verified:
  - Toast: "已完成订单不可清理"
  - No DELETE API call made
  - Order and nodes remain intact
Result: PASS
```

### T41: Confirmation dialog content

```
Setup: Order #ACC-2026-0001, customer "ACCENDO HONG KONG LTD", 18 nodes.
Action: Click "试运行清理".
Verified dialog shows:
  - "该功能仅用于删除试运行阶段错误录入的数据" ✅
  - "#ACC-2026-0001 · ACCENDO HONG KONG LTD" ✅
  - "将同时删除 18 个工序节点" ✅
  - "⚠ 此操作将永久删除数据，不可恢复" ✅
  - "真实生产订单请使用取消订单" ✅
Result: PASS
```

### T34-T38: Regression

```
T34: Delete order with waiting nodes    → PASS
T35: Delete order with active nodes     → PASS
T36: Reject completed order             → PASS
T37: No orphan data after delete        → PASS
T38: Delete cancelled order with nodes  → PASS
```

## 2. Delete Sequence Verification

```
OrdersAPI.deleteOrder(orderId):
  Step 1: SELECT order_nodes.id WHERE order_id = ?
  Step 2: DELETE exception_events WHERE node_id IN (...)
          → Returns {ok:true} or aborts
  Step 3: DELETE order_nodes WHERE order_id = ?
          → Returns {ok:true} or aborts
  Step 4: DELETE orders WHERE id = ?
          → Returns {ok:true} or aborts

Manual order respects FK RESTRICT.
No CASCADE. No schema changes.
```

## 3. Production Safety Boundary

```
Protected from cleanup:
  - Completed orders (status='completed')     ← Only protection
  - (All other orders can be cleaned during trial)

Separate from business logic:
  - Cancelled status: UNCHANGED (business operation)
  - Undo: UNCHANGED (5-min window)
  - Trial cleanup: TEMPORARY (removed after trial)

Cleanup is a TRIAL-ONLY feature.
Production deployment must remove the cleanup button.
```

## 4. Freeze Compliance

```
Schema:    0 changes (8 tables, 58 fields)
Migration: 0 files
FK:        6 RESTRICT, 3 SET NULL, 1 NO FK, 0 CASCADE
ADL-001~003: No violation
ADP-001~005: No violation
```

## 5. Implementation Summary

| File | Change |
|------|--------|
| `js/data/orders.js` | +deleteOrder() method |
| `js/pages/order-detail.js` | +onDeleteOrder(), +cleanup button, +confirm dialog |

```
Commits:
  bef2f37  Initial trial delete patch (3-B.1)
  0c85d0a  Rename to 试运行清理 (3-B.2)
  c25e896  Revised rules: allow nodes (3-B.3)
  1da22d5  Add customer name + permanent warning (3-B.4)
```

---

> **Trial cleanup fully verified. 7 tests pass. Production boundary: completed orders only.**
