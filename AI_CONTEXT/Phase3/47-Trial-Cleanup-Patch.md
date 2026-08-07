# Phase 3-B.2 · Trial Cleanup Patch

> **Status:** Deployed (aligned with 3-B.1)
> **Commit:** 0c85d0a
> **Purpose:** Remove mistaken test orders during trial. Not business cancellation.

---

## 1. Feature Confirmation

| Requirement | Status |
|-------------|:------:|
| No schema changes | ✅ 0 DDL |
| No migration | ✅ |
| No FK changes | ✅ RESTRICT maintained, manual delete order |
| Cancelled business logic untouched | ✅ Separate feature |
| Delete mistaken test orders | ✅ |

## 2. Safety Rules (F1-F5)

| Rule | Condition | Result |
|:----:|-----------|:------:|
| F1 | Order has completed nodes (status=done) | REJECTED |
| F2 | Order has exception_events | REJECTED |
| F3 | Order has rework_pass > 0 | REJECTED |
| F4 | Order status = completed | REJECTED |
| F5 | Order created > 24 hours ago | REJECTED |

## 3. Delete Sequence

```
Step 1: DELETE exception_events WHERE node_id IN (order's node IDs)
Step 2: DELETE order_nodes WHERE order_id = ?
Step 3: DELETE orders WHERE id = ?
```

Manual order respects FK RESTRICT. No CASCADE.

## 4. UI

```
Order Detail header:
  [取消订单]  [试运行清理]

Confirm dialog:
  "该功能仅用于删除试运行阶段错误录入的数据。
   真实生产订单请使用取消订单。
   确认清理？"
```

## 5. Validation Tests

| # | Test | Expected |
|:--|------|----------|
| T34 | Delete order with nodes, no production history | PASS |
| T35 | Delete completed order | REJECTED (F4) |
| T36 | Delete order with exception | REJECTED (F2) |
| T37 | Delete order with rework | REJECTED (F3) |

## 6. Freeze

```
Schema:    UNCHANGED
Tables:    8 (unchanged)
Fields:    58 (unchanged)
FK:        6 RESTRICT, 3 SET NULL, 1 NO FK, 0 CASCADE
ADL:       No violation
ADP:       No violation
```

## 7. Removal Plan

```
This is a TEMPORARY trial feature.
Remove when Phase 4 multi-user system is deployed
or trial is complete with production data.
```

---

> **Trial cleanup deployed. Button labeled "试运行清理". Safety rules enforced in page layer. 0 schema changes.**
