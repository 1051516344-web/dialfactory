# Phase 3-B · Revised Architecture

> **Status:** Design Baseline for V1.1 Implementation
> **Principle:** Order-driven, not template-driven.

---

## 1. Architecture Shift

| Dimension | V1.0 (Old) | V1.1 (Revised) |
|-----------|-----------|-----------------|
| Route source | Template library | Supervisor decision |
| Process selection | Template pre-fills, required locked | All freely selectable |
| Template role | INPUT (pre-loaded) | OUTPUT (emerges from usage) |
| is_required | System enforces | **Removed** |
| Route truth | process_routes table | route_snapshot JSONB |
| Rework | Single node only | Three levels (A/B/C) |
| User model | Single clerk | Supervisor (single-user trial) |

## 2. Core Data Flow

```
Supervisor receives order + drawing
           |
           v
Manual Route Builder (checks processes from catalog)
           |
           v
route_snapshot recorded (the prescription)
           |
           v
order_nodes generated (the execution)
           |
           v
Production tracking (advance/pause/rework/exception)
           |
           v
Completed order + snapshot preserved
           |
           v
System accumulates snapshots (30+ per spec)
           |
           v
Templates EMERGE (Phase 4)
```

## 3. Process Redefined

```
processes = Factory Capability Catalog

Each row = "This factory CAN do this"
NOT = "Every order MUST do this"
NOT = "This is the standard sequence"

Attributes: code, name, type, default_dept_id, is_active
is_required: IGNORED in V1.1. Removed in V2.0.
```

## 4. Order Model

```
Order = Basic Info + Route Snapshot + Nodes + Exceptions

Route Snapshot (JSONB):
  source: "manual" | "history" | "template"
  steps: [{process_code, process_name, dept_name, seq, selected}]

Nodes:
  Generated only for selected=true steps
  Gap-based seq (10, 20, 30...)
  First node active, rest waiting
```

## 5. Department Model (Future)

```
V1.1: Single user operates all departments (trial mode)

Phase 4: Department Queue per user
  Dept lead sees only: WHERE dept_id = X AND status = 'active'
  Cross-dept flow: dept done -> auto-activate next dept
  RLS: USING (dept_id = user.dept_id)
```

## 6. Schema Impact

```
V1.1: NONE (is_required column ignored, not removed)
Phase 4: +users table, +updated_by, +created_by, RLS update
```
