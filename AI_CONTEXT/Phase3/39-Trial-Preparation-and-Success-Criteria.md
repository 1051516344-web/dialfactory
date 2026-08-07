# DialFactory V1.1 · Trial Preparation & Success Criteria

> **Status:** Trial Design
> **Target:** 广州表盘工厂真实试运行
> **Duration:** 2-4 weeks
> **User:** 产品主管 (single user)
> **Constraint:** No schema change. No development. Production reality only.

---

## 1. Data Initialization — First Real Launch

### 1.1 What Already Exists

```
departments (5 rows):
  制一, 制二, 制三, 制四, 总QC

customers (1 row):
  深圳时诺钟表有限公司 (SN) — DEMO DATA, REMOVE BEFORE TRIAL
```

### 1.2 What Must Be Seeded Before Trial

```
Step 1: DROP demo customer
  DELETE FROM customers WHERE code = 'SN';

Step 2: INSERT real customers (16 rows)
  ACC, ATT, FAF, REN, OW, 冠球, TSI, TEL, WEL, THA,
  GLB, PYX (inactive), APW, JIP, CES
  + 1 additional (total 16 confirmed from Phase 0-B)

Step 3: VERIFY processes (35 rows)
  P01-P35 already inserted in Phase 1-E.
  VERIFY all 35 exist with correct names, types, dept_ids.
  CORRECT P16 dept_id -> 制二 (not 制三).

Step 4: VERIFY departments (5 rows)
  Names correct. Seq correct. Type correct.

Step 5: CLEAR routes
  DELETE FROM route_steps;
  DELETE FROM process_routes;
  Routes will EMERGE from trial usage, not be pre-loaded.

Step 6: VERIFY system access
  Open https://1051516344-web.github.io/dialfactory/
  Check: Dashboard loads, Route List is empty, Order List is empty.
```

### 1.3 Initial State After Seeding

```
departments:     5 rows (verified)
customers:       16 rows (real)
processes:       35 rows (real, verified)
process_routes:  0 rows (templates emerge from usage)
route_steps:     0 rows
orders:          0 rows (fresh start)
order_nodes:     0 rows
exception_events: 0 rows
```

### 1.4 Why Zero Routes

```
Starting with zero templates is intentional:
  - Forces the supervisor to build routes manually
  - Every snapshot feeds the route沉淀 system
  - Templates that emerge are BASED ON REAL DATA, not guesses
  - Avoids the "wrong template" problem entirely
```

---

## 2. Supervisor Order Creation — Complete Flow

### 2.1 End-to-End Scenario

```
Supervisor receives customer order:
  Customer: ACC (ACCENDO HONG KONG LTD)
  Product: 500 pcs, Sunray texture, Silver-White plating, Light sandblast
  Due: 2026-09-15
  Drawing: attached (supervisor reviews paper/PDF)

Supervisor opens DialFactory:
  1. Navigate to Order Create (#/orders/new)
  2. Fill basic info:
     order_no: ACC-2026-0001
     customer: ACC (from dropdown)
     qty: 500
     due_date: 2026-09-15
     base_texture: 太阳纹
     plate_color: 银白60s
     sand_type: 轻砂

  3. Build Route (Manual Mode):
     Reviews drawing requirements:
       - Sunray -> P15 (刷太阳纹)
       - Silver-White -> P16 (电镀), P17 (打底)
       - Sandblast -> P13 (喷砂)
       - Standard forming -> P01,P02,P03,P06
       - Standard finishing -> P19,P20
       - QC required -> P23,P24,P25,P35

     Checks 18 checkboxes across 5 departments.

  4. Preview route flow:
     Visually verifies: 制一(4) -> 制二(10) -> 制三(0) -> 制四(0) -> QC(1)
     Notes: No printing (Dept-3) or assembly (Dept-4) for this order.

  5. Creates order.
     System generates route_snapshot + order_nodes.
     Redirects to Order Detail.

  6. Verifies:
     18 nodes created.
     First node (P01) is active.
     Progress bar shows 0/18.
```

### 2.2 Time Budget

```
Target: < 3 minutes per order

Breakdown:
  Basic info:        30 seconds
  Route building:    90 seconds (checking ~18 checkboxes)
  Preview & verify:  30 seconds
  Create & confirm:  30 seconds
  Total:            ~3 minutes

Acceptable for first-time use.
Expected to drop to ~90 seconds after 10 orders (muscle memory).
```

---

## 3. Manual Route Builder — Usage Flow

### 3.1 Supervisor's Mental Process

```
Step A: Read drawing/customer requirements
  "What surface treatment? What color? Any special requests?"

Step B: Mental mapping
  Sunray -> P15 in Dept-2
  Silver-White -> P16, P17 in Dept-2
  Sandblast -> P13 in Dept-2 (if requested)
  Always -> P01,P02,P03,P06 in Dept-1 (standard forming)
  Always -> P19,P20 in Dept-2 (standard finishing)
  Always -> P23,P24,P25 in Dept-2 (QC gates)
  Always -> P35 (final QC)

Step C: Check the checkboxes
  Scan dept-by-dept. Check what's needed.
  Skip what's not needed (no printing -> skip Dept-3 entirely).

Step D: Preview
  Quick visual scan of the flow.
  "Does this look right for this product?"

Step E: Create
  Commit. System records the decision.
```

### 3.2 Common Patterns (Expected to Emerge)

```
Pattern 1: "Standard Sunray + Silver-White" (most common)
  Dept-1: P01,P02,P03,P06 (4 processes)
  Dept-2: P12,P13,P15,P16,P17,P19,P20,P23,P24,P25 (10 processes)
  Dept-3: none
  Dept-4: none
  QC: P35 (1 process)
  Total: 15 processes

Pattern 2: "CD Pattern + Gold" (less common)
  Dept-1: P01,P02,P03,P06,P09 (5 processes, +CD pattern)
  Dept-2: P12,P16,P17,P19,P20,P23,P24,P25 (8 processes, no sandblast)
  Dept-3: none
  Dept-4: P29,P30,P31 (3 processes, stud insertion)
  QC: P35 (1 process)
  Total: 17 processes

Pattern 3: "Full Assembly" (complex products)
  All Dept-1 + All Dept-2 + Dept-4 assembly + QC
  Total: 25+ processes
```

### 3.3 Assistance (After 5+ Orders)

```
After supervisor has created 5+ orders:

Same-Customer Hint:
  "Last order for ACC used 15 processes. [Load last route]"
  -> Supervisor clicks to pre-select those 15.
  -> Adjusts for this order's specifics.

Same-Spec Hint:
  "Sunray + Silver-White orders typically include P15, P16, P19"
  -> Pre-checks those with a "(commonly used)" indicator.
  -> Supervisor can still uncheck.

Recently Used:
  "Your last 3 orders used these processes most frequently"
  -> Top 10 most-used processes highlighted at top.
```

---

## 4. Department Lead Simulation (Single-User Mode)

### 4.1 How the Supervisor Simulates Multi-Department

```
V1.1 has ONE user. The supervisor acts as ALL departments.

Morning routine (simulating Dept-1 lead):
  1. Open Dashboard
  2. See dept queue: 制一 has 3 active nodes
  3. Go to Order List, filter by status=active
  4. For each order with active Dept-1 node:
     - Open Order Detail
     - Complete the node
     - Next Dept-1 node auto-activates
  5. When all Dept-1 nodes for an order are done:
     - First Dept-2 node auto-activates
     - This simulates "flow to next department"

Afternoon routine (simulating Dept-2 lead):
  1. See dept queue: 制二 now has active nodes
  2. Process Dept-2 nodes same way
  3. When all Dept-2 nodes done -> Dept-3 activates

This simulation VALIDATES the flow model before adding real multi-user.
```

### 4.2 What This Proves

```
After 2 weeks of simulation:
  - Does the auto-activation between departments work correctly?
  - Do nodes appear in the right department at the right time?
  - Can one person manage all departments' nodes?
  - Where are the bottlenecks?

Answers feed directly into Phase 4 multi-user design.
```

---

## 5. Trial Metrics — What to Collect

### 5.1 System Usage Metrics

| Metric | How to Measure | Target |
|--------|---------------|:------:|
| Orders created per week | Count from orders table | > 10 |
| Avg route building time | Supervisor self-report | < 3 min |
| Processes per order (avg) | Count from route_snapshot | 15-20 |
| Route modification rate | Compare snapshots for same spec | < 20% variation |
| Exception events per week | Count from exception_events | Record baseline |
| Rework frequency (Dept-2) | Count rework_pass > 0 nodes | Record baseline |

### 5.2 Route Quality Metrics

| Metric | How to Measure | Meaning |
|--------|---------------|---------|
| Route consistency | Same spec -> same processes? | High consistency = good template candidate |
| Cancelled orders | Count status='cancelled' | > 5% indicates route builder issues |
| Undo frequency | Supervisor self-report | > 20% indicates UI confusion |
| Missing processes | "I forgot to check P13" incidents | > 10% indicates grouping issues |

### 5.3 Pain Point Log

```
Supervisor keeps a simple log during trial:

  Date | Order | Issue | Severity
  8/15 | ACC-0003 | Forgot to check P19 (消光) | Medium
  8/15 | ACC-0003 | Had to cancel and recreate | High
  8/16 | TEL-0001 | Route took 5 min (first complex order) | Low
  ...

This is a text file or notebook.
No need for a system feature.
Review weekly with developer.
```

---

## 6. Route Model Success Criteria

### 6.1 Success Indicators

```
Indicator 1: Supervisor can build routes WITHOUT referring to paper notes
  After 10 orders: supervisor knows where each process is in the checklist.
  Target: No external reference needed by order #10.

Indicator 2: Route consistency emerges naturally
  After 15+ orders with same spec: process selection > 80% consistent.
  Target: At least one spec combination achieves > 80% consistency.

Indicator 3: Cancelled orders are rare
  Cancellation rate < 3% of total orders.
  Most cancellations are business reasons (customer changes mind), not system errors.

Indicator 4: Segment rework is used correctly
  Dept-2 rework uses Type B or C (segment), not multiple Type A (single).
  Target: > 70% of Dept-2 reworks use segment mode.

Indicator 5: Exception recording becomes habitual
  At least 1 exception recorded per 5 orders.
  Target: Supervisor records exceptions without prompting.
```

### 6.2 Failure Indicators

```
Indicator 1: Supervisor avoids the system
  Creates < 5 orders in 2 weeks.
  Prefers paper notes.

Indicator 2: High undo rate
  > 30% of node advances are undone.
  UI is confusing or error-prone.

Indicator 3: Route building takes > 5 min
  Checklist organization doesn't match supervisor's mental model.

Indicator 4: High cancellation rate
  > 10% of orders cancelled.
  Route builder is producing wrong routes.

Indicator 5: Segment rework ignored
  Dept-2 rework uses Type A (single) for issues that need Type C (segment).
  Feature is undiscoverable or confusing.
```

### 6.3 Go/No-Go Decision After Trial

```
GO (proceed to Phase 4):
  - > 20 orders created
  - Route consistency > 80% for at least 1 spec
  - Cancellation rate < 5%
  - Supervisor reports system is "usable" or better
  - At least 1 segment rework successfully executed

NO-GO (revise before Phase 4):
  - < 10 orders created in 4 weeks
  - Cancellation rate > 15%
  - Supervisor reports system is "frustrating"
  - Segment rework never used or always fails
  - Core flow is broken
```

---

## 7. Segment Rework Test Scenarios

### 7.1 Scenario 1: Type A — Single Node Redo

```
Setup: Order with Dept-2 nodes active. P16 plating in progress.

Test:
  1. Complete P16 (active -> done)
  2. QC later finds P16 color is slightly off
  3. Supervisor clicks [Rework] on P16
  4. Verify: new P16 node created, rework_pass=1, active
  5. Verify: original P16 preserved (done, rework_pass=0)

Success: New P16 appears in flow. Original preserved.
```

### 7.2 Scenario 2: Type B — Rewash

```
Setup: Order with Dept-2 segment. P15 brushing done. Surface contaminated.

Test:
  1. Supervisor identifies contamination at P15
  2. Supervisor clicks [Segment Rework] on P15
  3. Selects restart range: P21 (wash) + P15 + P16
  4. Verify: 3 new nodes created (P21, P15, P16)
     - P21 active, P15 waiting, P16 waiting
     - All rework_pass incremented
  5. Verify: original P15, P16 preserved as done
  6. Complete P21 -> P15 auto-activates -> Complete P15 -> P16 auto-activates

Success: Segment rework creates correct batch. Auto-flow works within segment.
```

### 7.3 Scenario 3: Type C — Full Dept-2 Restart

```
Setup: Order with Dept-2 segment. P16 plating completely failed.

Test:
  1. Supervisor clicks [Dept Rework] on P16
  2. System detects Dept-2 first process: P12
  3. Range: P12 -> P13 -> P15 -> P16 (all before failed node)
  4. Verify: 4 new nodes created
     - P12 active, others waiting
     - All rework_pass incremented
  5. Verify: original P12-P16 preserved as done
  6. Verify: P17 onwards (after failed node) NOT recreated
  7. Complete P12 -> P13 activates -> ... -> P16 activates

Success: Full segment recreated. Processes after failed node untouched.
```

### 7.4 Scenario 4: Error — Wrong Rework Type

```
Setup: P16 plating failed (needs Type C full segment restart).
       Supervisor mistakenly uses Type A (single node redo).

Test:
  1. Supervisor does Type A rework on P16
  2. New P16 created, but underlying issues (P12-P15) not addressed
  3. Supervisor realizes error
  4. Supervisor does Type C rework on original P16
  5. Verify: BOTH rework attempts visible in flow
     - Type A result: new P16 (rework_pass=1)
     - Type C result: new P12-P16 (rework_pass=1)
  6. Supervisor completes Type C nodes, ignores Type A node

Success: Multiple rework generations coexist. History fully preserved.
```

---

## 8. Phase 4 Entry Conditions

### 8.1 Must-Have (All Required)

```
[ ] 20+ real orders created in V1.1
[ ] At least 2 spec combinations have 10+ orders each
[ ] Route consistency > 80% for at least 1 spec combination
[ ] Cancellation rate < 5%
[ ] At least 5 segment reworks executed (Types B or C)
[ ] Supervisor confirms system is ready for multi-user
[ ] Zero schema drift during trial
[ ] Zero critical bugs unresolved

All 8 must be met before Phase 4 development begins.
```

### 8.2 Should-Have (At Least 3 of 5)

```
[ ] 50+ orders created
[ ] Supervisor builds routes in < 2 minutes avg
[ ] At least 1 customer-specific pattern identified
[ ] Exception recording is habitual (> 1 per 5 orders)
[ ] Supervisor has NOT requested any schema changes

At least 3 should be met.
```

### 8.3 Phase 4 Trigger

```
When all Must-Have conditions are met:
  1. Review collected metrics with supervisor
  2. Document any requested changes
  3. Freeze V1.1 trial state
  4. Begin Phase 4 development:
     - users table + Supabase Auth
     - order_nodes.updated_by + orders.created_by
     - RLS department isolation
     - Department queue per user
     - Template generation from accumulated snapshots
     - Route Editor page
```

---

## Summary

```
Trial Duration: 2-4 weeks
User: Product Supervisor (single user)
Starting Data: 16 customers, 35 processes, 0 routes, 0 orders

Key Validation Points:
  1. Manual Route Builder is usable (< 3 min per order)
  2. Routes become consistent over time
  3. Segment rework (Types B/C) works correctly
  4. Department flow simulation validates the model
  5. Undo and cancelled order mechanisms are adequate

Go/No-Go: 8 Must-Have + 3/5 Should-Have -> Phase 4
```

---

> **Trial is designed. No development needed. System is ready for supervisor to create the first real order.**
