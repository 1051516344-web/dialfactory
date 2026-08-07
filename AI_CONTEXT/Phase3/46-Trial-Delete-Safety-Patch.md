# Phase 3-B.1 · Trial Delete Safety Patch

> **Status:** Implemented
> **Commit:** bef2f37
> **Purpose:** Temporary. Remove wrongly created test orders during trial only.

---

## 1. Reason

Factory trial will generate test data. Supervisor may create wrong orders. V1.1 has no delete mechanism (FK RESTRICT prevents accidental deletion). This patch adds a CONTROLLED delete for trial cleanup only.

**This is NOT business cancellation. NOT production rollback. NOT a permanent feature.**

## 2. Safety Rules

| Rule | Condition | Enforcement |
|:----:|-----------|------------|
| F1 | Order status = completed | REJECTED |
| F2 | Order has completed nodes (status=done) | REJECTED |
| F3 | Order has exception records | REJECTED |
| F4 | Order created > 24 hours ago | REJECTED |
| F5 | Order has rework nodes (rework_pass > 0) | REJECTED |

**Only deletable: fresh orders with no production history.**

## 3. Implementation

### API: OrdersAPI.deleteOrder(orderId)

```
Step 1: DELETE exception_events WHERE node_id IN (order's node IDs)
Step 2: DELETE order_nodes WHERE order_id = ?
Step 3: DELETE orders WHERE id = ?
```

Manual order respects FK RESTRICT. No CASCADE. No schema changes.

### UI: Delete button on Order Detail

```
Order Detail header: [取消订单] [删除]
Delete button: red, small, next to cancel button.
Confirm dialog with warning about permanent removal.
```

## 4. Schema

```
New tables:      0
New columns:     0
ALTER TABLE:     0
FK changes:      0
CASCADE added:   NO (still 0)

Schema: UNCHANGED. V1.0 Freeze maintained.
```

## 5. Tests

| # | Test | Expected |
|:--|------|----------|
| T27 | Delete fresh order (in_production, waiting nodes only) | PASS |
| T28 | Delete paused order (no completed nodes) | PASS |
| T29 | Delete completed order | REJECTED (F1) |
| T30 | Delete order with exception | REJECTED (F3) |
| T31 | Delete order with rework | REJECTED (F5) |
| T32 | Delete order > 24 hours old | REJECTED (F4) |
| T33 | Verify no orphan data after delete | 0 exceptions, 0 nodes, 0 orders |

## 6. Removal Plan

```
This patch is TEMPORARY.

Remove when:
  - Phase 4 multi-user system is deployed
  - OR: trial is complete and production data exists
  
Removal:
  - Remove delete button from Order Detail
  - Remove OrdersAPI.deleteOrder()
  - Remove safety check code
```

---

> **Trial safety patch deployed. Delete available for trial cleanup only.**
