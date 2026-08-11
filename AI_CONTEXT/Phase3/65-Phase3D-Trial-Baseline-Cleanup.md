# Phase 3-D · Trial Baseline Cleanup

> **Date:** 2026-08-07
> **Predecessor:** [64-Phase3D-Trial-Start-Report.md](AI_CONTEXT/Phase3/64-Phase3D-Trial-Start-Report.md)
> **Purpose:** Remove all test data before factory trial

---

## 1. Pre-Cleanup State

| Table | Count | Detail |
|-------|:-----:|--------|
| orders | 1 | TEST-SMOKE-001 (in_production, 10 nodes, 0 exceptions) |
| order_nodes | 10 | Smoke test rework scenario nodes |
| exception_events | 0 | None |
| customers | 15 | Unchanged |
| processes | 35 | Unchanged |
| departments | 5 | Unchanged |

---

## 2. Deletion Order (FK Compliance)

Following FK RESTRICT chain:

```
Step 1: exception_events  → DELETE WHERE node_id IN (10 node IDs)  → 10 × HTTP 204
Step 2: order_nodes       → DELETE WHERE order_id = {ORDER_ID}     → HTTP 204
Step 3: orders             → DELETE WHERE id = {ORDER_ID}           → HTTP 204
```

No FK violations. All deletions clean.

---

## 3. Post-Cleanup Verification

| Table | Count | Expected | Status |
|-------|:-----:|:--------:|:------:|
| orders | **0** | 0 | ✅ |
| order_nodes | **0** | 0 | ✅ |
| exception_events | **0** | 0 | ✅ |
| customers | 15 | ≥ 15 | ✅ Unchanged |
| processes | 35 | 35 | ✅ Unchanged |
| departments | 5 | 5 | ✅ Unchanged |
| process_routes | 0 | 0 | ✅ Unchanged |
| route_steps | 0 | 0 | ✅ Unchanged |

---

## 4. Unaffected Data

| Data | Protection |
|------|-----------|
| 15 active customers | Not touched — FK RESTRICT, only test order deleted |
| 35 processes | Not touched — no FK from orders to processes |
| 5 departments | Not touched — no FK from orders to departments |
| `drawings` Storage bucket | Not touched — no files uploaded during test |
| Schema (8 tables, 59 fields) | Not touched — no DDL executed |
| RLS policies | Not touched |
| FK policy (6R·3SN·1NF·0C) | Not touched |

---

## 5. Trial Ready

```
Production tables:  0 orders · 0 nodes · 0 exceptions
Reference tables:   15 customers · 35 processes · 5 departments
Storage:            drawings bucket ready (0 files)
Schema:             Frozen — 8 tables · 59 fields
Code:               All Phase 3-D changes complete (uncommitted)
```

**Baseline is clean. Trial can start.**
