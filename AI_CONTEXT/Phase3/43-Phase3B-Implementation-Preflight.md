# Phase 3-B · Implementation Preflight

> **Status:** PREFLIGHT COMPLETE — Ready for Implementation
> **Checked:** Schema · Undo · Rework · Route Builder · Freeze · Testing

---

## 1. Schema Compatibility

| Table | Columns Used by V1.1 | New Columns Needed | Compatible |
|-------|---------------------|:-----------------:|:----------:|
| `orders` | status, route_snapshot, customer_id, order_qty, due_date, specs, note | 0 | YES |
| `order_nodes` | process_id, dept_id, status, seq, rework_pass, qty_out, pause_reason, note | 0 | YES |
| `processes` | code, name, type, default_dept_id, is_active, is_required (ignored) | 0 | YES |
| `departments` | name, seq, type | 0 | YES |

```
Schema change:      0
ALTER TABLE:        0
New columns:        0
Migration files:    0
Data migration:     NONE (is_required column stays, ignored in code)

V1.0 Schema SUPPORTS all V1.1 features.
```

---

## 2. Undo Boundary

| Rule | Status |
|------|:------:|
| 5-minute window (UNDO_WINDOW_MINUTES = 5) | CONFIRMED |
| F1: > 5 min elapsed -> forbidden | CONFIRMED |
| F2: Completed order -> forbidden | CONFIRMED |
| F3: Cancelled order -> forbidden | CONFIRMED |
| F4: Downstream manually advanced -> forbidden | CONFIRMED |
| F5: Part of segment rework batch -> forbidden | CONFIRMED |
| F6: Cross-dept with downstream work started -> forbidden | CONFIRMED |
| No historical deletion (status reverted, not deleted) | CONFIRMED |

---

## 3. Rework

| Type | Scope | Preserves History | rework_pass | Status |
|:----:|-------|:----------------:|:-----------:|:------:|
| A | 1 node | YES | parent+1 | CONFIRMED |
| B | Partial segment | YES | parent+1 (all same) | CONFIRMED |
| C | Full segment | YES | parent+1 (all same) | CONFIRMED |
| No node deletion | All types | — | — | CONFIRMED |
| Current state = MAX(rework_pass) per process_id | — | — | CONFIRMED |

---

## 4. Route Builder

| Requirement | Status |
|-------------|:------:|
| Manual-first (Day 1 default) | CONFIRMED |
| History Copy (after 5+ orders) | CONFIRMED |
| Template mode (Phase 4 only, disabled in V1.1) | CONFIRMED |
| Snapshot immutable after creation | CONFIRMED |
| No template dependency (route_id can be NULL) | CONFIRMED |
| is_required IGNORED in all Route Builder logic | CONFIRMED |

---

## 5. Freeze Check

```
New tables:      0  PASS
New columns:     0  PASS
ALTER TABLE:     0  PASS
FK changes:      0  PASS
Migration:       0  PASS
RLS changes:     0  PASS
ADL-001:         Snapshot as truth, preserved                PASS
ADL-002:         Rework human-triggered, no auto-routing     PASS
ADL-003:         States: waiting/active/done/paused only     PASS
ADP-001~005:     No violation                                PASS

Freeze: MAINTAINED. V1.0 baseline intact.
```

---

## 6. Testing

```
T1-T6:    Route creation     6 tests
T7-T11:   Cancellation       5 tests
T12-T15:  Undo               4 tests
T16-T20:  Rework A/B/C       5 tests
T21-T24:  Dept handoff       4 tests
T25-T26:  Route validation   2 tests
─────────────────────────────────
Total:   26 tests
```

---

## Final Status

```
╔═══════════════════════════════════════╗
║                                       ║
║   PREFLIGHT: ALL CHECKS PASSED        ║
║                                       ║
║   Schema:     COMPATIBLE (0 changes)  ║
║   Undo:       6 boundaries defined    ║
║   Rework:     3 types, all safe       ║
║   Route:      Manual-first confirmed  ║
║   Freeze:     MAINTAINED              ║
║   Tests:      26 defined              ║
║                                       ║
║   READY FOR IMPLEMENTATION            ║
║                                       ║
╚═══════════════════════════════════════╝
```

---

> **Preflight complete. 0 blockers. Proceed to Phase 3-B development.**
