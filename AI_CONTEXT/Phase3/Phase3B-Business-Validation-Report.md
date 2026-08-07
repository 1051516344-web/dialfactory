# Phase 3-B · Business Validation Report

> **Status:** Simulation Complete
> **Method:** Walk through 6 real factory scenarios against V1.1 model
> **Goal:** Find gaps BEFORE writing code

---

## Scenario 1: Supervisor Creates 20 Orders in One Day

### Setup
Morning. 5 customers sent orders overnight. Supervisor processes all.

### Walkthrough

```
Order batch:
  ACC:  3 orders (Sunray+Silver, CD+Gold, Plain+Silver)
  FAF:  2 orders (Sunray+Silver, Sunray+Silver)
  TSI:  1 order  (CD+Rose Gold w/ assembly)
  WEL:  2 orders (Plain+Silver, Plain+Gold)
  GLB:  1 order  (Sunray+Silver w/ printing)
  THA:  1 order  (Sunray+Silver)
  -- 10 distinct orders from 6 customers --

Supervisor flow:
  Order 1-3 (ACC): Build routes from scratch.
    ACC-Sunray-Silver:   15 processes (standard Sunray+Silver)
    ACC-CD-Gold:         17 processes (+P09 CD, +P29-P31 studs)
    ACC-Plain-Silver:    12 processes (no P15 sunray, no P13 sandblast)

  Order 4-5 (FAF): Same spec as Order 1.
    Uses History Copy: copies from Order 1's snapshot.
    Adjusts: Order 5 adds P13 sandblast.
    Time: ~30 sec each (vs. 2-3 min for manual).

  Order 6 (TSI): CD+Rose Gold, complex.
    Manual build. 22 processes.
    Time: ~3 min.

  Order 7-8 (WEL): Plain+Silver/Gold.
    Manual. 12-13 processes each.
    Time: ~2 min each.

  Order 9 (GLB): Sunray+Silver + printing.
    History Copy from Order 1 + adds P26 (screen print).
    Time: ~45 sec.

  Order 10 (THA): Sunray+Silver.
    History Copy from Order 1. No changes.
    Time: ~15 sec.
```

### Findings

| Observation | Verdict |
|-------------|:------:|
| History Copy dramatically reduces time for repeat specs | Model works |
| Manual build still needed for new spec combinations | Acceptable |
| 10 orders in ~15 minutes is realistic after first few | Feasible |
| 20 orders/day = ~30 minutes of system time | Supervisor can handle |

**Verdict: PASS. Model supports realistic daily volume.**

---

## Scenario 2: Route Variation Across Orders

### Setup
Three orders, all "Sunray + Silver-White" spec, but different customers.

### Walkthrough

```
Order A (ACC):  Standard Sunray+Silver.
  P01,P02,P03,P06 | P12,P13,P15,P16,P17,P19,P20,P23,P24,P25 | P35
  15 processes.

Order B (FAF):  Same spec, but customer requires NO sandblast.
  P01,P02,P03,P06 | P12,P15,P16,P17,P19,P20,P23,P24,P25 | P35
  14 processes (P13 removed).

Order C (GLB):  Same spec, customer wants extra QC documentation.
  P01,P02,P03,P06 | P12,P13,P15,P16,P17,P19,P20,P23,P24,P25 | P35
  15 processes + supervisor adds note: "Extra QC photos required"
  Same selection as Order A, different note.

Snapshots differ correctly:
  Order A: P13 selected
  Order B: P13 NOT selected
  Order C: P13 selected, note added
```

### Findings

| Observation | Verdict |
|-------------|:------:|
| Same spec, different customer = different route | Model captures this |
| No "required" processes blocking flexibility | is_required removal correct |
| route_snapshot preserves the actual decision per order | Snapshot-first correct |
| System learns: "P13 is selected 67% of time for Sunray+Silver" | Template quality improves with data |

**Verdict: PASS. Route variation is the norm, not the exception.**

---

## Scenario 3: Dept-2 Rework — All Three Types

### Setup
Order #0088. Dept-2 segment: P12->P13->P15->P16->P17->P19->P20->QC.

### Walkthrough

```
Type A (Single Node):
  P16 plating done. QC finds color slightly off (Delta-E < 1).
  Supervisor: [Rework] on P16.
  Result: New P16 created (rework_pass=1). Original P16 preserved.
  Flow: ...P15(done)->P16(done)->[P16-R1(active)]->P17(waiting)...
  Verdict: Works.

Type B (Rewash):
  P15 brushing done. Inspector finds surface contamination.
  Must wash (P21) then redo P15 and P16.
  Supervisor: [Segment Rework] on P15. Selects P21->P15->P16.
  Result: 3 new nodes. P21(active), P15(waiting), P16(waiting).
  Flow: ...P15(done)->P16(done)->[P21-R1(active)->P15-R1->P16-R1]->P17(waiting)...
  Verdict: Works. Correct scope.

Type C (Dept Restart):
  P16 plating completely failed (wrong color, peeling, entire rack).
  Must restart from P12 (grinding).
  Supervisor: [Dept Rework] on P16. System auto-detects P12 as first.
  Result: 4 new nodes. P12(active), P13(waiting), P15(waiting), P16(waiting).
  P17 onwards: UNCHANGED (already done correctly).
  Flow: ...P12(done)...P16(done)->[P12-R1(active)->P13-R1->P15-R1->P16-R1]->P17(waiting)...
  Verdict: Works. Correct segment boundary.
```

### Node Model Verification

```
Batch INSERT:  order_nodes supports multiple rows in one insert. PASS.
Same rework_pass: All batch nodes get parent_pass+1. PASS.
Original preservation: status='done' remains. PASS.
Segment detection: dept_id grouping finds P12 as min(seq) for dept-2. PASS.
Gap seq: SeqCalc inserts batch in gap after original segment. PASS.
Order status: OrderState.derive handles mixed done/active/waiting. PASS.
```

**Verdict: PASS. Three-level rework fully supported by existing node model.**

---

## Scenario 4: Order Cancellation

### Setup
Three orders need cancellation for different reasons.

### Walkthrough

```
Order #0095 (ACC):  Customer cancelled the order.
  Status: in_production, 5 of 18 nodes done.
  Supervisor: [Cancel Order] -> confirm.
  Result:
    All active/waiting nodes -> paused.
    orders.status = 'cancelled'.
    All action buttons hidden on Order Detail.
    Dashboard shows: cancelled count +1.
  Irreversible: cancelled cannot go back to in_production.
  Verdict: Works.

Order #0096 (FAF):  Created with wrong customer.
  Status: in_production, 0 nodes advanced (all waiting).
  Supervisor cannot change customer after creation.
  Solution: [Cancel Order] -> create new order with correct customer.
  Old order stays as 'cancelled' (audit trail).
  Verdict: Works. Audit trail preserved.

Order #0097 (TSI):  Created with wrong process (forgot P19).
  Status: in_production, 3 nodes done. Missing P19 discovered.
  Solution: Use [Append] to insert P19 at correct position.
  No cancellation needed.
  Verdict: Dynamic append resolves this. Cancel not needed.
```

### Findings

| Observation | Verdict |
|-------------|:------:|
| Cancelled orders preserved as audit trail | Correct design |
| Cannot modify order after creation -> cancel + recreate | Acceptable for V1.1 |
| Dynamic append handles missing processes | Existing feature covers this |
| cancelled state irreversible | Correct (prevents abuse) |

**Verdict: PASS. Cancelled state covers all scenarios. Dynamic append reduces cancellation need.**

---

## Scenario 5: Department Handoff Simulation

### Setup
Single supervisor simulating all departments. Order flows through 5 depts.

### Walkthrough

```
Morning (simulating Dept-1 lead):
  Open Dashboard. Dept-1 queue: 3 active nodes across 3 orders.
  Open Order#0088. Complete P01,P02,P03,P06 (4 Dept-1 nodes).
  When P06 done -> all Dept-1 nodes done.
  System: activates P12 (first Dept-2 node).
  Dept-1 queue now: 2 active nodes (other orders).

Afternoon (simulating Dept-2 lead):
  Open Dashboard. Dept-2 queue: P12 active on Order#0088.
  Process Dept-2 nodes (10 nodes).
  When P25 done -> all Dept-2 nodes done.
  System: activates P26 (first Dept-3 node).
  Dept-3 has 0 selected processes -> skip to Dept-4.
  Dept-4 has 0 selected processes -> skip to QC.
  System: activates P35 (QC node).

Evening (simulating QC):
  Open Dashboard. QC queue: P35 active.
  Complete P35 (检验 type -> enter qty_out=470).
  All nodes done -> order status = 'completed'.
```

### Flow Validation

```
Dept-1 done -> auto-activate Dept-2:  PASS
Dept-2 done -> skip empty Depts -> QC: PASS
Empty dept (Dept-3, Dept-4):           PASS (no nodes to activate, skip)
QC done -> order completed:            PASS
```

### Findings

| Observation | Verdict |
|-------------|:------:|
| Cross-dept activation works for full dept completion | Works |
| Empty depts (no processes selected) skip correctly | Works, but needs explicit check |
| One person can simulate all depts | Feasible for trial |
| Future: each dept lead sees only their queue | Phase 4 RLS needed |

**Verdict: PASS. Cross-department flow model is correct. Empty dept handling needs explicit skip logic.**

---

## Scenario 6: Multi-User Future Extension

### Setup
Phase 4: 5 department leads, each with their own login.

### Walkthrough (Future State)

```
Dept-1 Lead (Wang):
  Login -> sees only Dept-1 active nodes.
  Completes P01-P06 for Order#0088.
  System auto-activates P12 (Dept-2).
  Wang cannot see or modify Dept-2 nodes.
  RLS: WHERE dept_id = (SELECT dept_id FROM users WHERE id = auth.uid())

Dept-2 Lead (Li):
  Login -> sees P12 active (just activated by Wang's completion).
  Processes Dept-2 nodes. Triggers segment rework when P16 fails.
  RLS: same dept filter. Li cannot see Dept-1 or Dept-3 nodes.

Supervisor:
  Login -> sees ALL departments (role='admin').
  Creates orders. Builds routes.
  Can view any order but delegates node advancement to dept leads.

QC Lead:
  Login -> sees QC queue only.
  Completes P35. Records final qty_out.
```

### What Phase 4 Needs

```
Schema:
  CREATE TABLE users (id, email, dept_id, role)
  ALTER TABLE order_nodes ADD updated_by UUID
  ALTER TABLE orders ADD created_by UUID

RLS:
  order_nodes: USING (dept_id = user.dept_id OR user.role = 'admin')
  orders: USING (true) -- all can view order info

Application:
  Login page (Supabase Auth)
  Auto-filter Dashboard + Order List by user.dept_id
  Operation attribution: every updateNode records auth.uid()
```

### Findings

| Observation | Verdict |
|-------------|:------:|
| Current data model supports dept filtering | dept_id already exists |
| RLS policy is simple (dept_id match) | 1 policy per table |
| Admin override needed (supervisor sees all) | role='admin' bypass |
| No structural model change needed | Phase 4 = users table + RLS |

**Verdict: PASS. V1.1 model extends cleanly to multi-user. No redesign needed.**

---

## Overall Validation

| Scenario | Result | Issues Found |
|----------|:------:|-------------|
| 1. 20 orders/day | PASS | None |
| 2. Route variation | PASS | None |
| 3. Dept-2 rework | PASS | None |
| 4. Order cancellation | PASS | None |
| 5. Dept handoff | PASS | Empty dept skip needs explicit check |
| 6. Multi-user future | PASS | None |

### Issues to Address Before Implementation

| # | Issue | Severity | Fix |
|:--|-------|:--------:|-----|
| I-1 | Empty department skip in cross-dept flow | Low | Add check: if next dept has 0 nodes, skip to following dept |
| I-2 | History Copy needs 5+ orders to be useful | Info | Acceptable. Day 1 = manual only |

### Model Confirmed

```
The Revised V1.1 model is VALIDATED for factory use.

Core strengths:
  - Manual Route Builder handles route variation
  - Snapshot-first preserves every decision
  - Three-level rework covers Dept-2 reality
  - Cancelled state handles errors without data loss
  - Cross-dept flow model extends to multi-user cleanly

No schema changes needed.
No model redesign needed.
Ready for implementation.
```

---

> **6 scenarios. 6 passes. 2 minor issues identified (neither blocking). Proceed to Phase 3-B implementation.**
