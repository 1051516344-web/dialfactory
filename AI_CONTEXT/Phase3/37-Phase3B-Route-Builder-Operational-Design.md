# Phase 3-B · Route Builder Operational Design

> **Status:** Business Model Design
> **Focus:** 手工路线构建 + 制二返工场景分析
> **Constraint:** No code. No schema change. Business logic only.

---

## 1. Supervisor Route Building — UI Flow

### 1.1 The Mental Model

```
Supervisor receives customer order:
  "500 pcs, sunray pattern, silver-white plating, light sandblasting"

Supervisor thinks:
  Sunray -> need brushing (P15), matting (P19)
  Silver-white -> need plating (P16), base coat (P17)
  Sandblasting -> need sandblast (P13)
  Standard -> need punching (P01-P06), baking (P20), QC

Supervisor builds route by selecting from known 35 processes.
This is KNOWLEDGE work, not template-filling.
```

### 1.2 Step-by-Step Flow

```
Step 1: Order Basic Info (unchanged)
  order_no, customer, qty, due_date, specs

Step 2: Build Route (REDESIGNED)

  Phase A: Quick-Select by Department
  +---------------------------------------------------+
  | Route Builder                                      |
  |                                                    |
  | Customer: ABC Co.   Spec: Sunray + Silver-White    |
  |                                                    |
  | [Search process...]  [Recently Used] [By Dept]     |
  |                                                    |
  | --- Dept 1: Forming (11) ---          [Expand All] |
  | [x] P01 Punching [Req]  [x] P02 Hole Punch        |
  | [x] P03 Welding [Req]   [ ] P04 Window Cut        |
  | [ ] P05 Flat Press       [x] P06 Glue Removal     |
  | [ ] P07 Ring Turn        [ ] P08 Window Turn       |
  | [ ] P09 CD Pattern       [ ] P10 Horn Hole         |
  | [ ] P11 Burr Remove                                |
  |                                                    |
  | --- Dept 2: Surface Treatment (14) --- [Expand All]|
  | [x] P12 Grinding        [ ] P13 Sandblast          |
  | [ ] P14 Linear Brush    [x] P15 Sunray Brush       |
  | [x] P16 Plating [Req]   [x] P17 Base Coat [Req]   |
  | [ ] P18 Spray Paint     [x] P19 Matting [Req]      |
  | [x] P20 Baking [Req]    [ ] P21 Wash               |
  | [ ] P22 Polish          [x] P23 QC Surface [Req]   |
  | [x] P24 QC Transfer [Req] [x] P25 QC Receive [Req] |
  |                                                    |
  | --- Dept 3: Printing (2) ---                       |
  | [ ] P26 Screen Print    [ ] P27 Pad Print          |
  |                                                    |
  | --- Dept 4: Assembly (7) ---                       |
  | [ ] P28 Hole Repair     [ ] P29 Stud Insert        |
  | [ ] P30 Glue Apply      [ ] P31 Stud Adjust        |
  | [ ] P32 Luminous Fill   [ ] P33 UP Attach          |
  | [ ] P34 Assembly                                   |
  |                                                    |
  | --- QC ---                                         |
  | [x] P35 Final QC [Req]                             |
  |                                                    |
  | Selected: 18 processes | Order: D1->D2->D3->D4->QC |
  | [Auto-sort by dept sequence] [Manual adjust order] |
  |                                                    |
  |                    [Preview Route] [Create Order]   |
  +---------------------------------------------------+

  Phase B: Preview (optional)
  Shows the built route as a vertical flow diagram.
  Supervisor visually verifies the sequence.
  Can drag to reorder within same department.
  Can remove processes (except required ones).
  Can insert additional processes.

  Phase C: Confirm & Create
  Creates route_snapshot + order_nodes.
  Navigates to Order Detail.
```

### 1.3 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Checkboxes, not dropdowns | 35 processes is too many for a dropdown. Visual grid is faster |
| Grouped by department | Matches supervisor's mental model ("制一的工序, 制二的工序...") |
| Required auto-selected | Reduces clicks. Supervisor only needs to ADD optional processes |
| Same-spec pre-selection | After 5+ orders, system hints based on spec combination |
| Preview before create | Supervisor can verify the full flow visually |

---

## 2. Process Display & Selection

### 2.1 Three View Modes

```
Mode 1: By Department (default, always available)
  Processes grouped under: 制一, 制二, 制三, 制四, 总QC
  Each group shows process count.
  Collapsed by default except 制一 (first department).
  Auto-expand next department when previous has selections.

Mode 2: Recently Used (after 5+ orders)
  Shows processes ordered by: how recently the supervisor used them.
  Top 10 most frequently used processes highlighted.
  "You selected these in your last 3 orders..."

Mode 3: Search (always available)
  Type "电镀" -> filters to P16 only.
  Type "QC" -> filters to P23, P24, P25, P35.
  Supports Chinese and process codes (P16).
```

### 2.2 Smart Pre-Selection Rules

```
Rule 1: is_required = true
  Always pre-selected and locked.
  11 processes are required: P01,P03,P06,P16,P17,P19,P20,P23,P24,P25,P35

Rule 2: Same customer, previous order
  If Customer X has a previous order:
    Pre-select the processes from that order's route_snapshot.
    Supervisor can uncheck any non-required ones.

Rule 3: Same spec combination
  If "Sunray + Silver-White" has been used before:
    Pre-select processes common to that spec (>80% frequency).
    Marks them with "(commonly used)" hint.

Rule 4: Department continuity
  If Dept-2 processes are selected, auto-select Dept-1 required processes.
  Ensures the route is complete (no gaps between departments).
```

### 2.3 Auto-Sort Logic

```
Default sort: by department sequence, then by process code within dept.

Dept-1 (seq=1): P01, P02, P03, P04, P05, P06, P07, P08, P09, P10, P11
Dept-2 (seq=2): P12, P13, P14, P15, P16, P17, P18, P19, P20, P21, P22, P23, P24, P25
Dept-3 (seq=3): P26, P27
Dept-4 (seq=4): P28, P29, P30, P31, P32, P33, P34
QC (seq=5):     P35

Node seq assignment (gap-based):
  Dept-1 processes: seq = 10, 20, 30, ... (GAP_STEP=10)
  Dept-2 processes: seq = 70, 80, 90, ... (start at previous dept max + GAP_STEP)
  ...
```

---

## 3. route_snapshot as Future Template Source

### 3.1 What Gets Saved

Every order creation saves a complete route_snapshot:

```json
{
  "source": "manual",
  "snapshot_at": "2026-08-15T10:30:00+08:00",
  "created_by": "supervisor name",
  "specs": {
    "base_texture": "太阳纹",
    "plate_color": "银白60s",
    "sand_type": "轻砂"
  },
  "customer_id": "uuid-of-customer",
  "steps": [
    {"seq":1, "process_code":"P01", "process_name":"冲板", "dept_name":"制一",
     "is_required":true, "confirmed":true},
    {"seq":2, "process_code":"P02", "process_name":"冲孔", "dept_name":"制一",
     "is_required":false, "confirmed":true},
    ...
    {"seq":18, "process_code":"P35", "process_name":"总QC", "dept_name":"总QC",
     "is_required":true, "confirmed":true}
  ]
}
```

### 3.2 Accumulation Over Time

```
Week 1:  5 orders  -> 5 snapshots
Week 2:  12 orders -> 12 snapshots
Month 1: 30 orders -> 30 snapshots (template generation threshold)
Month 3: 90 orders -> 90 snapshots (frequency analysis possible)
Month 6: 180 orders -> 180 snapshots (AI recommendation viable)
```

### 3.3 Data Structure for Analysis

The `route_snapshot` JSONB contains everything needed for pattern analysis:

| Analysis | Data Used |
|----------|-----------|
| Process frequency | `steps[].process_code` across all snapshots |
| Spec->Process mapping | `specs` + `steps[].process_code` |
| Customer preferences | `customer_id` + `steps[].process_code` |
| Required vs optional patterns | `steps[].is_required` + `steps[].confirmed` |
| Department sequence | `steps[].dept_name` + `steps[].seq` |

### 3.4 From Snapshot to Template (Phase 4)

```
Step 1: GROUP BY specs (base_texture + plate_color)
Step 2: For each group, COUNT frequency of each process_code
Step 3: Classify:
  freq >= 80% -> "commonly included" (suggest as default)
  40% <= freq < 80% -> "sometimes included" (suggest as optional)
  freq < 40% -> "rarely included" (hide, but expandable)
Step 4: Generate candidate template
Step 5: Supervisor reviews, adjusts, approves
Step 6: Saved to process_routes as an official template
```

---

## 4. Template Generation Logic (Phase 4)

### 4.1 When to Generate

```
Trigger: 30+ snapshots exist for a spec combination
Example: 30 orders with "太阳纹 + 银白"

System notification:
  "30 orders with Sunray + Silver-White have been created.
   A route pattern has been detected. [Review Template]"
```

### 4.2 Template Quality Score

```
Template confidence = weighted score:
  - Number of orders:         weight 40%
  - Process consistency:      weight 40%
  - Recency:                  weight 20%

Score >= 80: High confidence -> auto-suggest
Score 50-79: Medium -> suggest with caveat
Score < 50: Low -> do not suggest, need more data
```

### 4.3 Template Maintenance

```
Template evolves over time:
  - Every 30 new orders for that spec -> re-evaluate template
  - If new orders consistently include a previously-optional process
    -> suggest upgrading it to "commonly included"
  - If a previously-required process starts being excluded
    -> flag for supervisor review
```

---

## 5. Dept-2 Rework Scenarios — Deep Analysis

### 5.1 Three Real Rework Types

Factory confirmed three types of rework in Dept-2:

| Type | Factory Term | Scenario | Scope |
|------|-------------|----------|:-----:|
| A | 重做 (Redo) | P16 plating color mismatch -> redo P16 only | Single node |
| B | 重洗 (Rewash) | Surface contamination after P15 -> wash (P21) + redo from P15 | Partial segment |
| C | 部门起点重做 | Major plating failure -> restart from P12 (first Dept-2 process) | Full segment |

### 5.2 Type A: 重做 (Single Node Rework) — V1.0 SUPPORTS

```
Scenario: P16 plating has slight color deviation.

Action: Supervisor clicks [Rework] on P16.

System:
  INSERT new P16 node
  rework_pass = parent.rework_pass + 1
  status = 'active'
  seq = gap-based insertion after current P16

History:
  Original P16: status='done', rework_pass=0 (preserved)
  New P16:      status='active', rework_pass=1
```

### 5.3 Type B: 重洗 (Partial Segment Rework) — REQUIRES L2

```
Scenario: After P15 brushing, surface is contaminated.
  Must wash (P21) then redo from P15.

Current nodes:
  ... P14(linear brush, done) -> P15(sunray, done) -> P16(plating, active) ...

Action: Supervisor identifies the issue at P15.
  Clicks [Segment Rework] on P15.
  Selects range: P15 -> P16 (or: "from P15 to end of dept-2")

System:
  Determine Dept-2 segment start: P12 (first Dept-2 process after previous dept)
  Supervisor's selected restart point: P15
  New nodes to create: P21(wash) + P15 + P16
    (P21 is inserted because "wash before redo" is standard for contamination)
  
  INSERT batch:
    P21(wash):      rework_pass=parent+1, status='active'
    P15(sunray):    rework_pass=parent+1, status='waiting'
    P16(plating):   rework_pass=parent+1, status='waiting'
  
  seq: gap-based insertion after current segment

History:
  Original P15, P16: status='done' (preserved)
  New P21, P15, P16: status varies, rework_pass incremented
```

### 5.4 Type C: 部门起点重做 (Full Segment Rework) — REQUIRES L2

```
Scenario: P16 plating completely failed (wrong color, peeling).
  Must restart from P12 grinding.

Current nodes:
  Dept-2 segment: P12(done) -> P13(done) -> P15(done) -> P16(done) -> P17(active)...

Action: Supervisor clicks [Dept Rework] on P16.
  System auto-detects: rework from P12 (first Dept-2 process).

System:
  Find Dept-2 segment boundary: P12 (first) to P25 (last)
  Current position: P16
  Recreate range: P12 -> P16 (all processes before and including failed node)
  
  INSERT batch (all Dept-2 processes from P12 to P16):
    P12(grinding):      rework_pass=parent+1, status='active'
    P13(sandblast):     rework_pass=parent+1, status='waiting'
    P15(sunray):        rework_pass=parent+1, status='waiting'
    P16(plating):       rework_pass=parent+1, status='waiting'
  
  P17 and beyond (after failed node, already OK): NOT recreated
  seq: gap-based insertion after P16

History:
  Original P12-P16: status='done' (preserved in flow)
  New P12-P16:      status varies, rework_pass incremented
  P17 onwards:      unchanged (already done correctly)
```

### 5.5 Segment Rework Rules

```
Rule 1: Segment boundary = first process of the SAME dept_id in this order
Rule 2: Only recreate processes BEFORE and INCLUDING the failed node
Rule 3: Processes AFTER the failed node are NOT recreated (already OK)
Rule 4: All recreated nodes share the SAME rework_pass value
Rule 5: Original nodes preserved with status='done'
Rule 6: First recreated node = 'active', rest = 'waiting'
Rule 7: Seq uses gap-based insertion after the original segment
Rule 8: Supervisor can adjust the restart point (earlier or later)
```

---

## 6. Node Model Compatibility with Segment Rework

### 6.1 Current order_nodes Structure

```
order_nodes columns:
  id, order_id, process_id, process_name, process_code,
  dept_id, dept_name,
  status (waiting/active/done/paused),
  seq, rework_pass, qty_out, note
```

### 6.2 What Segment Rework Requires

| Requirement | Supported? | How |
|------------|:----------:|-----|
| Batch INSERT multiple nodes | YES | OrdersAPI.insertNode called in loop, or single batch INSERT |
| Same rework_pass for all recreated nodes | YES | Set rework_pass = parent_pass + 1 for all |
| Preserve original nodes | YES | Original nodes untouched (status='done') |
| Multiple nodes with same process_id in one order | YES | Differentiated by rework_pass and seq |
| Gap-based seq insertion for batch | YES | SeqCalc computes insertion point, bump if needed |
| Identify segment boundary (first dept process) | YES | Query order_nodes WHERE dept_id=X, MIN(seq) |
| Track rework reason | YES | Store in note field ("segment rework: plating failure") |
| Audit trail of original vs rework | YES | rework_pass=0 vs >0 clearly distinguishes |
| Order status recalculation after batch | YES | OrderState.derive handles mixed done/active/waiting |

### 6.3 What is NOT Needed (No Schema Change)

```
NOT needed:
  - New table for rework tracking
  - New column for "segment_id"
  - New column for "rework_type"
  - DAG/graph structure for segment relationships

Everything is derivable from:
  - dept_id (segment grouping)
  - seq (order within and across segments)
  - rework_pass (which generation this node belongs to)
  - status (where in the flow this node is)
```

### 6.4 Flow Visualization After Segment Rework

```
Original flow:
  [P12 done] -> [P13 done] -> [P15 done] -> [P16 done] -> [P17 active] -> ...

After Type C rework (restart from P12):
  [P12 done] -> [P13 done] -> [P15 done] -> [P16 done] ->
  [P12 REWORK active] -> [P13 REWORK waiting] -> 
  [P15 REWORK waiting] -> [P16 REWORK waiting] ->
  [P17 active] -> ...

Visual distinction:
  Original: green border, rework_pass=0
  Rework:   orange border, rework_pass=1
  Current:  blue border (active)
```

---

## 7. Summary

### Route Builder

```
Day 1: Manual Build with dept-grouped checklist
  - 35 checkboxes, grouped by 5 departments
  - Required processes pre-selected and locked
  - Auto-sort by dept sequence
  - Search by name or code
  - Preview before create

Week 1: Historical Copy becomes available
  - Copy from own previous orders for same customer

Month 1: Smart defaults emerge
  - Same-spec pre-selection based on frequency

Month 3: Templates auto-generated
  - System proposes templates from accumulated snapshots
```

### Dept-2 Rework

```
3 types, all supported by current node model:
  Type A (Redo):         Single node -> rework_pass+1 (V1.0)
  Type B (Rewash):       Partial segment -> batch INSERT (V1.1)
  Type C (Dept restart): Full segment -> batch INSERT (V1.1)

Node model: FULLY COMPATIBLE.
  dept_id -> segment boundary
  rework_pass -> generation tracking
  seq -> order within and across segments
  status -> flow position

Schema change needed: NONE.
```

---

> **Manual Build is the foundation. Segment rework is fully supported by existing node model. Zero schema changes required for either feature.**
