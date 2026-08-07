# Phase 3-B · Implementation Authorization

> **Status:** AUTHORIZED — Ready for Implementation
> **Review:** 41-Phase3B-Implementation-Plan.md
> **Date:** 2026-08-06

---

## 0. Mandatory Confirmations

### Schema Freeze

```
New tables:      0  ✓
New columns:     0  ✓
ALTER TABLE:     0  ✓
FK changes:      0  ✓
Migration files: 0  ✓
RLS changes:     0  ✓

V1.0 Freeze MAINTAINED.
All changes are application-layer (JS only).
```

### File Impact

```
Modified: 8 JS files
New:      0 files
Deleted:  0 files
CSS:      0 changes
HTML:     0 changes
```

---

## 1. Undo Boundary — Mandatory Rules

### 1.1 Allowed Undo Window

```
Rule 1: UNDO_WINDOW = 5 minutes from node.updated_at
Rule 2: Only the MOST RECENT status change can be undone
Rule 3: Undo is single-step only (no chained undo)
Rule 4: No confirmation dialog (undo is for correcting mistakes)
```

### 1.2 Allowed Undo Transitions

| Current Status | Undo To | Condition |
|:-------------:|:------:|-----------|
| `done` | `active` | Within 5 min. Downstream auto-activated node also deactivated |
| `paused` | `active` | Within 5 min. pause_reason cleared |
| `active` | `waiting` | Within 5 min. Only if activated by auto-flow (not manual) |

### 1.3 FORBIDDEN Undo Situations

```
F1: Node was completed > 5 minutes ago
    Reason: Production reality has moved on. Undo would be misleading.

F2: Node is part of a COMPLETED ORDER (order.status = 'completed')
    Reason: Completed orders are immutable audit records.

F3: Node is part of a CANCELLED ORDER (order.status = 'cancelled')
    Reason: Cancelled is terminal.

F4: Node has downstream nodes that were MANUALLY advanced
    (not auto-activated by the system)
    Reason: Cannot undo if someone independently acted on subsequent nodes.

F5: Node is a REWORK node (rework_pass > 0) that was created by segment rework
    Reason: Segment rework creates a batch. Undo one node would break the batch.

F6: Undoing across department boundary when downstream dept has already
    started working on their nodes
    Reason: Cross-department undo requires coordination. Not supported in V1.1.
```

### 1.4 Cross-Department Restriction

```
If Dept-1 completed its last node, and Dept-2's first node was auto-activated:
  Undoing Dept-1's last node:
    ALLOWED if Dept-2's first node is still 'waiting' (was deactivated together)
    FORBIDDEN if Dept-2 has already advanced any node beyond 'waiting'
    
  Reason: Dept-2 has already started real work. Undo would create confusion.
```

### 1.5 Downstream Activation Restriction

```
When undoing 'done' -> 'active':
  Find downstream node that was auto-activated by THIS completion.
  If downstream node is still 'active' (not yet advanced):
    Deactivate it too (active -> waiting).
  If downstream node has been advanced (done/paused):
    FORBIDDEN. Cannot undo. Message: "下游节点已开始处理, 无法撤销。"
```

---

## 2. Rework Safety — Mandatory Confirmations

### 2.1 No Deletion Rule

```
ABSOLUTE RULE: Rework NEVER deletes nodes.

Type A: Original node preserved (status='done'). New node created.
Type B: Original nodes preserved (status='done'). New batch created.
Type C: Original nodes preserved (status='done'). New batch created.

All original production records remain in the database.
All rework generations are additive only.
```

### 2.2 rework_pass Tracking

```
Generation 0: rework_pass = 0 (original production)
Generation 1: rework_pass = 1 (first rework of any type)
Generation 2: rework_pass = 2 (rework of a rework)
...

Same generation = same rework_pass value.
Type A: single node gets parent_pass + 1.
Type B/C: all nodes in batch get parent_pass + 1 (same value).

Visual distinction:
  rework_pass=0: normal
  rework_pass=1: light orange bg
  rework_pass=2: medium orange bg
  rework_pass>=3: dark orange bg
```

### 2.3 History Preservation Across Types

```
Example: P16 plating failed, then segment rework triggered.

Timeline:
  T1: P16 original created (rework_pass=0)
  T2: P16 completed (status='done')
  T3: QC finds issue. Supervisor does Type A on P16.
      -> P16-R1 created (rework_pass=1, status='active')
  T4: P16-R1 also fails. Supervisor does Type C (segment restart).
      -> P12-R1, P13-R1, P15-R1, P16-R2 created (rework_pass=2)

Database state:
  P16 (orig):    done, rework_pass=0  ← preserved
  P16-R1:        done, rework_pass=1  ← preserved (Type A result)
  P16-R2:        active, rework_pass=2 ← current (Type C result)
  P12-R1..P15-R1: active/waiting, rework_pass=2

Flow visualization:
  [P16 done] -> [P16-R1 done] -> [P12-R2 active] -> [P13-R2 wait] -> [P15-R2 wait] -> [P16-R2 wait] -> [P17 wait]

All history visible. Current state traceable.
```

### 2.4 Current Production State

```
At any point, the "current state" of production is:
  - For processes NOT in rework range: the original node
  - For processes IN rework range: the HIGHEST rework_pass node

Determining current state:
  SELECT DISTINCT ON (process_id) *
  FROM order_nodes
  WHERE order_id = X
  ORDER BY process_id, rework_pass DESC

This is a QUERY, not stored data. No additional column needed.
Current state is always derivable from existing columns.
```

---

## 3. Route Builder — Additional Tests

### T25: Same Customer, Different Route Snapshots

```
Setup: Customer ACC. Two orders, different specs.

Order A: Sunray+Silver, 15 processes.
Order B: CD+Gold, 17 processes.

Test:
  1. Create Order A. Build route with 15 processes. Save.
  2. Create Order B. Build route with 17 processes. Save.
  3. Verify: Order A snapshot has 15 steps. Order B snapshot has 17 steps.
  4. Verify: Both snapshots correctly reference the same customer.
  5. Verify: History Copy for ACC shows BOTH orders as options.
  6. Verify: Copying from Order A pre-selects 15 processes.
             Copying from Order B pre-selects 17 processes.

Expected: Same customer, different routes. History Copy shows both.
          Snapshot correctly records which route was for which spec.
```

### T26: Remove Optional Process — Seq Continuity

```
Setup: Order with 18 processes selected. Supervisor removes P13 (喷砂).

Initial selection (18 processes): seq 10,20,30,...,180
After removing P13: 17 processes.

Test:
  1. Uncheck P13 in Route Builder.
  2. Create order.
  3. Verify: 17 nodes generated (P13 excluded).
  4. Verify: seq values: 10,20,30,40,50,60,80,90,... (gap where P13 was).
             NO renumbering of subsequent nodes.
  5. Verify: route_snapshot.steps has 18 entries.
             P13 entry: selected=false.
             All others: selected=true.
  6. Verify: Order flow shows 17 nodes with correct seq gaps.

Expected: Snapshot records the decision (P13 not selected).
          Nodes correctly skip P13. Seq has gap but remains ordered.
          No renumbering needed (gap-based seq handles this).
```

---

## 4. Final Authorization

```
╔══════════════════════════════════════════╗
║                                          ║
║   Phase 3-B: AUTHORIZED                  ║
║                                          ║
║   Schema:     0 changes (Freeze intact)  ║
║   Files:      8 modified, 0 new          ║
║   Lines:      ~320 added, ~50 removed    ║
║   Tests:      26 (24 original + 2 new)   ║
║   Undo rules: 6 forbidden situations     ║
║   Rework:     3 types, all preserve      ║
║   History:    never deleted              ║
║                                          ║
║   IMPLEMENTATION ORDER:                  ║
║   config -> domain -> pages              ║
║                                          ║
║   Proceed with Phase 3-B development.    ║
║                                          ║
╚══════════════════════════════════════════╝
```

---

> **Authorization complete. All mandatory clarifications documented. 26 tests defined. 0 schema changes. Proceed to implementation.**
