# DialFactory V1.1 · Factory Trial Operating Model

> **Status:** Business Model Design
> **Phase:** Pre-Implementation Concept Validation
> **Constraint:** No code. No schema change. Production tracking + route沉淀 system.

---

## Section 1: Critical Concept Change — Remove is_required

### 1.1 Why is_required is Wrong

```
V1.0 assumption:
  Some processes are "required" — every order MUST go through them.
  Factory reality:
  No process is universally required.
  Same department, same product type — different customers, different
  drawings, different surface effects = DIFFERENT routes.
```

### 1.2 What Replaces It

```
OLD: process.is_required = true/false
     "System decides this process cannot be skipped"

NEW: process = factory capability
     "Factory CAN do this process"
     
     Order route selection:
     selected = true/false
     "Supervisor decides THIS order needs THIS process"
```

### 1.3 Data Impact

| Aspect | Before | After |
|--------|--------|-------|
| processes table | has `is_required` column | Column becomes unused. Kept for backward compatibility |
| Route Builder | Required processes locked | All processes are toggle-able |
| route_snapshot | steps[].is_required | Field removed from snapshot. Only `selected` matters |
| Supervisor experience | "Why can't I uncheck this?" | Full control over every process |

### 1.4 Migration Path

```
V1.1: is_required IGNORED in Route Builder UI
       All processes freely selectable
       Column stays in DB (no DDL change)

V2.0: ALTER TABLE processes DROP COLUMN is_required
       Clean removal after confirming factory never uses it
```

---

## Section 2: Process as Factory Capability Library

### 2.1 Redefinition

```
processes table = "What this factory CAN do"

Not: "What every order MUST do"
Not: "Standard operating procedure"
Not: "Default workflow"

It is a CATALOG of capabilities.
The supervisor consults this catalog when building a route.
```

### 2.2 Process Attributes (Revised)

| Attribute | Meaning | Example |
|-----------|---------|---------|
| code | Factory identifier | P16 |
| name | What the process does | 电镀 |
| type |加工/检验/辅助 | 加工 |
| default_dept_id | Which department owns this capability | 制二 |
| is_active | Is this process still available | true |

`is_required` — IGNORED in V1.1. Removed in V2.0.

### 2.3 Organization

```
Factory Capability Library (35 processes):

制一 (Forming):
  P01 冲板        P02 冲孔        P03 焊脚
  P04 允窗        P05 平压        P06 撕胶纸
  P07 车圈        P08 车窗        P09 车唱片纹
  P10 倒喇叭孔    P11 磨毛刺

制二 (Surface Treatment):
  P12 磨板        P13 喷砂        P14 刷直线纹
  P15 刷太阳纹    P16 电镀        P17 打底
  P18 喷漆        P19 消光        P20 烤板
  P21 洗板        P22 抛光
  P23 QC板面      P24 QC排版移交  P25 QC接板移交

制三 (Printing):
  P26 网印        P27 球印

制四 (Assembly):
  P28 穴修        P29 装钉        P30 打胶
  P31 调钉        P32 点夜光      P33 贴UP
  P34 组装配件

总QC (Final Inspection):
  P35 总QC
```

This is the supervisor's palette. They paint each order's route from these colors.

---

## Section 3: Route Builder — Final Business Model

### 3.1 Core Principle

```
Route = Supervisor Decision, not System Prescription.

The system presents the palette.
The supervisor builds the route.
The snapshot records the decision.
Templates emerge from accumulated decisions.
```

### 3.2 Order Creation Flow

```
Step 1: Basic Info
  order_no, customer, qty, due_date
  base_texture, plate_color, sand_type

Step 2: Build Route
  +---------------------------------------------------+
  | Build Production Route                             |
  |                                                    |
  | Customer: ABC Co.   Spec: Sunray + Silver-White    |
  |                                                    |
  | Factory Capability Library (35 processes):          |
  |                                                    |
  | [Search by name or code...]                        |
  |                                                    |
  | [By Department] [Recent Orders] [Spec Patterns]    |
  |                                                    |
  | --- 制一 Forming (11) ---                          |
  | [x] P01 冲板      [x] P02 冲孔     [x] P03 焊脚   |
  | [ ] P04 允窗      [ ] P05 平压     [x] P06 撕胶纸 |
  | [ ] P07 车圈      [ ] P08 车窗     [ ] P09 车唱片纹|
  | [ ] P10 倒喇叭孔  [ ] P11 磨毛刺                   |
  |                                                    |
  | --- 制二 Surface (14) ---                          |
  | [x] P12 磨板      [x] P13 喷砂     [ ] P14 直线纹 |
  | [x] P15 太阳纹    [x] P16 电镀     [x] P17 打底   |
  | [ ] P18 喷漆      [x] P19 消光     [x] P20 烤板   |
  | [ ] P21 洗板      [ ] P22 抛光                    |
  | [x] P23 QC板面    [x] P24 QC移交   [x] P25 QC接板 |
  |                                                    |
  | ... (Dept 3, Dept 4, QC similarly)                 |
  |                                                    |
  | Selected: 20 processes across 5 departments        |
  | Order: D1 -> D2 -> D3 -> D4 -> QC                  |
  |                                                    |
  | [Preview Route Flow] [Create Order]                |
  +---------------------------------------------------+

Step 3: Preview (optional)
  Vertical flow diagram of selected processes.
  Supervisor verifies sequence before committing.

Step 4: Create
  Generates route_snapshot + order_nodes.
  Navigates to Order Detail.
```

### 3.3 Selection Assistance (Not Constraints)

| Assistance | How It Helps | Supervisor Control |
|------------|-------------|-------------------|
| Same-customer hint | "Last order for ABC Co. used 18 processes. [Load]" | Can ignore, modify freely |
| Same-spec pattern | "Sunray+Silver usually includes P15, P16, P19" | Can override any selection |
| Recent orders | "Your last 5 orders used these processes most" | Full freedom |
| Department grouping | Processes organized by dept for easy scanning | Can reorder within dept |

All assistance is SUGGESTION only. Final route is always supervisor decision.

---

## Section 4: Route沉淀 Logic (Template Emergence)

### 4.1 The沉淀 Cycle

```
Supervisor builds route manually
        |
        v
Order enters production
        |
        v
route_snapshot saved with order
        |
        v
System accumulates snapshots (30+ per spec combination)
        |
        v
Frequency analysis:
  - Process occurrence rate
  - Customer patterns
  - Spec correlations
  - Route stability (how often does supervisor change this route?)
        |
        v
Candidate template generated with confidence score
        |
        v
Supervisor reviews: "System detected a pattern. Review?"
        |
        v
Approved -> saved to process_routes as official template
```

### 4.2 Template Confidence Factors

| Factor | Weight | Meaning |
|--------|:------:|---------|
| Usage count | 30% | How many orders use this pattern |
| Process consistency | 30% | Same processes selected across orders |
| Recency | 20% | Are recent orders still using this pattern |
| Customer diversity | 10% | Used by multiple customers (not just one) |
| Modification rate | 10% | Low modification = stable pattern |

### 4.3 When Templates Are NOT Generated

```
- Less than 30 orders for a spec combination
- High modification rate (supervisor changes route each time)
- Only one customer uses this pattern
- Confidence score < 50
```

Template generation is CONSERVATIVE. False templates are worse than no templates.

---

## Section 5: Department Queue Design

### 5.1 The Concept

```
Department Queue = All active nodes belonging to this department.

制二 Queue:
  Order#0088 P16 电镀 (active, 2 hours ago)
  Order#0090 P15 太阳纹 (active, 5 hours ago)
  Order#0091 P12 磨板 (active, just now)

How it fills:
  Dept-1 finishes its last node
    -> System activates Dept-2's first waiting node
    -> Node appears in Dept-2 queue
    -> Dept-2 lead sees it on next refresh
```

### 5.2 Query (No Schema Change)

```
Dept-X Queue =
  SELECT * FROM order_nodes
  WHERE dept_id = X
    AND status = 'active'
  ORDER BY updated_at ASC
```

That is it. One query. No new tables. No new columns.

### 5.3 Cross-Department Flow

```
Dept-1 last node completed
        |
        v
System checks: all Dept-1 nodes done?
        |
    YES -+
        | NO -> activate next Dept-1 waiting node (same dept)
        v
Find first waiting node in Dept-2 (by seq)
        |
        v
Activate: waiting -> active
        |
        v
Node appears in Dept-2 queue
```

---

## Section 6: Node Advancement Responsibility

### 6.1 Who Does What (V1.1 Single-User Trial)

```
Supervisor (single user in V1.1):
  Creates orders
  Builds routes
  Advances ALL nodes (simulating all departments)
  Records exceptions
  Triggers rework

This validates the route model and flow logic before
adding multi-user complexity.
```

### 6.2 Future Multi-User Model (Phase 4)

```
Supervisor:
  Creates orders + builds routes (unchanged)

Dept-1 Lead:
  Sees Dept-1 queue
  Advances Dept-1 nodes: waiting -> active -> done
  Records Dept-1 exceptions

Dept-2 Lead:
  Sees Dept-2 queue (populated after Dept-1 finishes)
  Advances Dept-2 nodes
  Triggers Dept-2 segment rework
  Records Dept-2 exceptions

... (Dept-3, Dept-4 similarly)

QC:
  Sees QC queue
  Final inspection
  Records exceptions
  Completes order
```

---

## Section 7: Rework Model (Dept-2 Focus)

### 7.1 Three Types Confirmed

| Type | Factory Term | When | Scope |
|:----:|-------------|------|:-----:|
| A | 重做 | Single process failure (e.g. plating color off) | 1 node |
| B | 重洗 | Surface contamination after processing | Partial segment (wash + affected processes) |
| C | 部门段返工 | Major failure in Dept-2 | Full segment from P12 |

### 7.2 Type A: 重做 (V1.0)

```
P16 plating has slight color deviation.
-> Rework P16 only.
-> INSERT new P16, rework_pass+1, status=active
-> Original P16 preserved as done
```

### 7.3 Type B: 重洗 (V1.1 NEW)

```
After P15 brushing, surface is contaminated.
Supervisor determines: wash (P21) + redo P15 + redo P16.

Action: [Segment Rework] on P15.
  Range: P21 -> P15 -> P16 (supervisor selects restart point)
  INSERT batch:
    P21 (wash):      rework_pass+1, active
    P15 (sunray):    rework_pass+1, waiting
    P16 (plating):   rework_pass+1, waiting
  Original nodes remain: done
  Seq: gap-based insertion after original segment
```

### 7.4 Type C: 部门段返工 (V1.1 NEW)

```
P16 plating completely failed (wrong color, peeling).
Supervisor determines: restart from P12.

Action: [Dept Rework] on P16.
  System detects Dept-2 first process: P12
  Range: P12 -> P13 -> P15 -> P16 (up to and including failed node)
  INSERT batch:
    P12 (grinding):   rework_pass+1, active
    P13 (sandblast):  rework_pass+1, waiting
    P15 (sunray):     rework_pass+1, waiting
    P16 (plating):    rework_pass+1, waiting
  P17 onwards: NOT recreated (already done correctly)
  Original P12-P16: status=done preserved
```

### 7.5 Node Model Support

```
Segment rework requires:              Supported by:
  Batch INSERT multiple nodes          order_nodes INSERT (existing)
  Same rework_pass for batch           rework_pass column (existing)
  Original nodes preserved             status='done' (existing)
  Multiple nodes, same process_id      differentiated by seq + rework_pass
  Segment boundary detection           dept_id grouping (existing)
  Gap-based seq insertion              SeqCalc.gapInsertion (existing)
  Order status recalculation           OrderState.derive (existing)

Schema change needed: NONE.
All three rework types supported by V1.0 data model.
```

### 7.6 制一 Special Case

```
制一 problems: usually cannot rework individual processes.
  -> Full restart from P01.
  -> Same as Type C, range = entire order.
  -> Supported by L3 full-flow rework (Phase 4).
```

---

## Section 8: Error Recovery Model

### 8.1 Order Creation Error

| Error | Recovery | V1.1 |
|-------|----------|:----:|
| Wrong customer | Cannot fix after creation | Cancelled status (V1.1 NEW) |
| Wrong process selected | Cannot fix after nodes created | Cancelled + recreate |
| Duplicate order | Second order created | Cancel the duplicate |

**V1.1: Use cancelled status. Do NOT delete orders.**
Production records, even wrong ones, are preserved.

### 8.2 Node Advancement Error

| Error | Recovery | V1.1 |
|-------|----------|:----:|
| Clicked "done" too early | Undo within 5 minutes | Undo (V1.1 NEW) |
| Clicked "done" >5 min ago | Cannot undo | Rework to compensate |
| Wrong pause reason | Resume + re-pause with correct reason | Existing flow |

**Undo rule: 5-minute window. Single-step only. No confirmation dialog.**

### 8.3 Rework Error

| Error | Recovery |
|-------|----------|
| Wrongly triggered rework | New nodes created. Cannot undo the creation. Complete the rework nodes to clear them, or ignore (they are just extra nodes in the flow) |
| Wrong rework scope | If Type A when Type C was needed: do another rework with correct scope |

**Rework creates NEW nodes. It does not modify existing ones. There is no "undo rework" — the new nodes are legitimate production records. Complete them or ignore them.**

---

## Section 9: V1.1 Trial Scope

### 9.1 Included

```
Core:
  Manual Route Builder (dept-grouped checklist)
  Order creation with route_snapshot
  Node advancement (active/done/paused)
  Exception recording
  Single-node rework (Type A)
  Segment rework (Types B, C) — NEW
  Undo (5-minute window) — NEW
  Cancelled order status — NEW

Data:
  16 real customers
  35 real processes
  0 templates (emerge from usage)

User Model:
  SINGLE user (supervisor operates all departments)
  Anon key authentication
  No department isolation
```

### 9.2 Excluded (Phase 4)

```
  Multi-user accounts
  Department task pools per user
  RLS department isolation
  Operation traceability (updated_by)
  Route Editor page
  Template generation UI
```

### 9.3 Excluded (Phase 5)

```
  AI route recommendations
  Full-flow rework (L3)
  Outsourcing management
  First-piece inspection
  Statistics & analytics
  Audit logs
```

---

## Section 10: Phase 4 Multi-User Evolution Path

### 10.1 What Phase 4 Adds

```
Schema:
  CREATE TABLE users (id, email, dept_id, role)
  ALTER TABLE order_nodes ADD COLUMN updated_by
  ALTER TABLE orders ADD COLUMN created_by
  RLS: department isolation policies

Application:
  User login (Supabase Auth)
  Department queue per user (auto-filtered by user.dept_id)
  Operation attribution (every update records who did it)
  Route Editor page (CRUD for process_routes)
  Template generation UI
```

### 10.2 Transition Path

```
V1.1 (single user):
  Supervisor uses system for 2-4 weeks
  Creates 20-50 real orders
  Validates route model
  Feedback collected

       |
       v
Phase 4 (multi-user):
  Deploy user system
  Assign department leads to accounts
  Each sees only their department queue
  Segment rework fully operational
  Templates begin emerging
```

---

## Summary

```
DialFactory V1.1 Positioning:
  "Production Tracking + Route沉淀 System"

Core changes from V1.0:
  is_required REMOVED from business logic
  Process = Factory Capability (not prescription)
  Route = Supervisor Decision (not template-filling)
  Templates = OUTPUT of system (not INPUT)
  Segment rework = Supported by existing node model
  Undo + Cancelled = Error recovery baseline

Schema changes: NONE for V1.1
Phase 4 schema: users table + 2 columns + RLS update
```

---

> **Factory trial ready. Supervisor builds routes. System learns. Templates emerge.**
