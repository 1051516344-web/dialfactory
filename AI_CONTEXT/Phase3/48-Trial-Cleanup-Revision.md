# Phase 3-B.3 · Trial Cleanup Rule Revision

> **Status:** Deployed
> **Commit:** c25e896
> **Revision:** 3-B.1/3-B.2 rules were too restrictive for trial use

---

## 1. Why Previous Rules Failed

```
3-B.1/3-B.2 rules blocked deletion if order had:
  - Any nodes (waiting/active/paused)
  - Any exceptions
  - Any rework nodes
  - Elapsed > 24 hours

Problem: During trial, supervisor creates real-like orders with nodes.
If they make a mistake (wrong route, wrong customer), they CANNOT clean it up.
The order has nodes -> deletion is blocked -> order is stuck forever.
```

## 2. New Principle

```
Trial Cleanup = Delete incorrect trial data.

It is NOT business cancellation.
It is NOT production rollback.
It is test data cleanup during the trial phase only.

Node existence is NOT a rejection condition.
Orders with waiting/active/paused nodes CAN be cleaned.
```

## 3. Revised Rules

| Condition | Before | After |
|-----------|:------:|:-----:|
| Order completed | REJECTED | **REJECTED** (unchanged) |
| Has waiting/active nodes | REJECTED | **ALLOWED** |
| Has paused nodes | REJECTED | **ALLOWED** |
| Has exceptions | REJECTED | **ALLOWED** |
| Has rework nodes | REJECTED | **ALLOWED** |
| > 24 hours old | REJECTED | **ALLOWED** |

**Only one rejection: order.status = 'completed'.**

## 4. Delete Sequence (unchanged)

```
exception_events -> order_nodes -> orders
Manual order. No CASCADE. FK RESTRICT respected.
```

## 5. Updated Confirm Dialog

```
Shows count of nodes and exceptions being deleted:
  "将同时删除 18 个工序节点。"
  "将同时删除 2 条异常记录。"
```

## 6. Updated Tests

| # | Test | Expected |
|:--|------|----------|
| T34 | Delete order with waiting nodes (fresh, no production) | PASS |
| T35 | Delete order with active nodes | PASS |
| T36 | Delete completed order | REJECTED |
| T37 | Delete order, verify no orphan data | PASS (0 nodes, 0 exceptions) |
| T38 | Delete cancelled order with nodes | PASS |

## 7. Freeze

```
Schema:    UNCHANGED (0 DDL)
FK:        UNCHANGED (0 CASCADE)
ADL:       No violation
ADP:       No violation
```

## 8. Removal Plan

```
TEMPORARY. Remove when trial ends or Phase 4 deploys.
Production system must NOT have unrestricted delete.
```

---

> **Trial cleanup revised. Only completed orders are protected. All test data can be cleaned.**
