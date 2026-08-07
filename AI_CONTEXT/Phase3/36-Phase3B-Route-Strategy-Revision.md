# Phase 3-B · Route Strategy Revision

> **Status:** Design Revision
> **Trigger:** 确认无历史订单数据 (2015至今)
> **Impact:** Route Builder 的三种模式优先级完全改变
> **原则:** 系统从零积累。模板是输出，不是输入。

---

## 0. The Key Insight

```
BEFORE (wrong assumption):
  Factory has 15 years of route data -> we can analyze and build templates

AFTER (reality):
  Zero historical data. System starts from scratch.
  Templates must be EARNED, not pre-loaded.
  Manual Build is the ONLY viable mode on day one.
```

---

## 1. Route Builder — Revised Priority

### Old Design (33-Phase3B)

```
3 equal modes: Template | Historical Copy | Manual Build
Template first (default), Manual as fallback
```

### New Design

```
PRIMARY: Manual Build (always available, always works)
  |
  +-- Template mode (emerges after 20-30 orders)
  |     Templates are DERIVED from accumulated route_snapshots
  |     Not pre-loaded. Discovered from real usage patterns.
  |
  +-- Historical Copy (emerges after 5-10 orders)
        Copy route from a previously created order
        "Same as last time for this customer"
```

### Phase-based Availability

| Mode | Day 1 | After 10 orders | After 30 orders |
|------|:-----:|:--------------:|:--------------:|
| Manual Build | ✅ PRIMARY | ✅ | ✅ |
| Historical Copy | ❌ No history | ✅ Available | ✅ |
| Template | ❌ No templates | ❌ | ✅ Auto-generated |

---

## 2. Manual Build — The Foundation

### 2.1 Why Manual Build is the Core

```
1. Every order has a customized route (factory confirmed)
2. Supervisor knows the processes by heart (35 processes, 5 departments)
3. Building manually is FASTER than correcting a wrong template
4. Each manual build feeds the system with real route data
```

### 2.2 UI Design — Department-Grouped Checklist

```
Order Create > Step 2: Build Route

+--------------------------------------------------+
| Build Production Route                            |
|                                                   |
| Select processes for this order.                  |
| [is_required] processes are pre-selected.         |
|                                                   |
| --- Dept 1 (11 processes) ---                     |
| [x] P01 Punching         [ ] P04 Window Cut       |
| [x] P02 Hole Punch       [ ] P05 Flat Press       |
| [x] P03 Welding          [ ] P07 Ring Turning     |
| [x] P06 Glue Removal     [ ] P08 Window Turning   |
| [ ] P09 CD Pattern       [ ] P10 Horn Hole        |
| [ ] P11 Burr Removal                              |
|                                                   |
| --- Dept 2 (14 processes) ---                     |
| ... (collapsed by default, expands when Dept 1    |
|      processes are selected)                      |
|                                                   |
| --- Dept 3 (2 processes) ---                      |
| ...                                               |
|                                                   |
| --- Dept 4 (7 processes) ---                      |
| ...                                               |
|                                                   |
| --- QC ---                                        |
| [x] P35 Final QC [Required]                       |
|                                                   |
| Selected: 18 processes across 5 departments       |
| Order: Dept-1 -> Dept-2 -> Dept-3 -> Dept-4 -> QC |
|                                                   |
| [Auto-sort by department] [Manual reorder]        |
|                                                   |
|                    [Confirm Route -> Create Order] |
+--------------------------------------------------+
```

### 2.3 Smart Defaults

To speed up manual building:

| Rule | Behavior |
|------|----------|
| is_required=true | Pre-selected, locked |
| Same customer as previous order | Pre-select processes from last order for that customer |
| Same spec (texture+color) | Pre-select processes common to that spec |

These are hints, not constraints. Supervisor can override.

### 2.4 Saving the Route

```
On [Create Order]:
  1. Build route_snapshot with all selected processes
  2. source = "manual"
  3. INSERT order_nodes only for confirmed=true
  4. route_id = NULL (no template used)

This snapshot becomes:
  - The production prescription for this order
  - Future reference for Historical Copy
  - Input for template generation (after 30+ orders)
```

---

## 3. Template Mode — Redefined

### 3.1 Templates are OUTPUT, not INPUT

```
OLD:  Templates are pre-loaded -> Supervisor selects -> tweaks
NEW:  Supervisor builds manually -> System observes -> Templates emerge
```

### 3.2 Template Generation (Phase 4)

After 30+ orders with route_snapshots:

```
System analyzes accumulated snapshots:
  1. Group by spec combination (texture + color)
  2. Find most common process sequences per group
  3. Generate candidate templates
  4. Supervisor reviews and approves
  5. Approved templates saved to process_routes table
```

### 3.3 Template Quality

```
Template confidence increases with:
  - Number of orders with same spec
  - Consistency of process selection
  - Supervisor approval

Example:
  "太阳纹 + 银白" spec, 25 orders
  P01-P06 (Dept-1): 100% of orders include all
  P15 刷太阳纹:      100% of orders include
  P13 喷砂:          60% of orders include (optional)
  P16 电镀:          100% of orders include
  ...

  Generated template:
    [Required]: P01,P02,P03,P06,P15,P16,P17,P19,P20,P23,P24,P25,P35
    [Optional]: P13,P14,P18,P21,P22,P26,P27,P28,P29,P30,P31,P32,P33,P34
```

---

## 4. Historical Copy — Redefined

### 4.1 Day 1: Not Available

No orders exist yet. Nothing to copy.

### 4.2 After 5-10 Orders: Available

```
Supervisor creates order for Customer X.
Last time Customer X ordered:
  Order#0010, 太阳纹+银白, 18 processes

Supervisor clicks "Copy from Order#0010":
  -> Loads that order's route_snapshot.steps
  -> Pre-selects all previously confirmed processes
  -> Supervisor tweaks (add/remove) for this order's specifics
  -> Saves new snapshot with source="history", source_order_id=#0010
```

### 4.3 Smart Suggestions

When supervisor selects a customer who has previous orders:

```
"You've created 5 orders for this customer.
 Recent routes: [Order#0010: 18 processes] [Order#0008: 16 processes]
 [Start from Order#0010] [Start from scratch]"
```

---

## 5. AI Route Recommendation — Future Path

### 5.1 Current: Not Possible

```
Requirements for AI recommendation:
  - 50+ orders with complete route_snapshots
  - Multiple spec combinations
  - Multiple customers
  - Consistent process naming
  
Current: 0 orders. Cannot recommend anything.
```

### 5.2 Phase 4: Rule-Based Suggestions

After 30+ orders, simple frequency analysis:

```
Supervisor selects: Customer=ABC, Texture=太阳纹, Color=银白

System looks up:
  - All orders with Texture=太阳纹 AND Color=银白
  - Frequency of each process:
    P01: 100% (always included)
    P02: 100%
    P03: 100%
    P13: 60%  (optional - included in 12/20 orders)
    P14: 20%  (rare - included in 4/20 orders)
    ...

Pre-selects: processes with >80% frequency
Shows as optional: processes with 40-80% frequency
Hides: processes with <40% frequency (but expandable)
```

### 5.3 Phase 5: AI Learning

After 200+ orders:
- Pattern recognition across customers and specs
- Quality data correlation (which processes produce fewer exceptions)
- Customer preference learning
- Seasonal variation detection

---

## 6. Revised V1.1 Route Builder Scope

### What to Build NOW

| Feature | Priority | Rationale |
|---------|:--------:|-----------|
| Manual Build (dept-grouped checklist) | P0 | Only viable mode on day 1 |
| Smart defaults (required, same-customer) | P0 | Speed up manual building |
| Historical Copy (from existing orders) | P1 | Becomes useful after 5-10 orders |
| Route saving (snapshot + nodes) | P0 | Core functionality |

### What to DEFER

| Feature | When | Why |
|---------|:----:|-----|
| Template generation from snapshots | Phase 4 | Need 30+ orders first |
| Template approval workflow | Phase 4 | Need templates first |
| Frequency-based suggestions | Phase 4 | Need data first |
| AI pattern recognition | Phase 5 | Need 200+ orders |

### What to REMOVE from V1.1 plan

| Feature | Reason |
|---------|--------|
| Template mode as primary option | No templates exist yet |
| Historical Copy as equal mode | No history on day 1 |

---

## 7. Revised Phase Roadmap

```
Phase 3-B: V1.1 (NOW)
  PRIMARY: Manual Build route creation
  SECONDARY: Historical Copy (after first orders exist)
  DEFERRED: Template mode (emerges in Phase 4)
  + Undo, Cancelled, Real data migration

Phase 3-C: Factory Trial
  Supervisor creates orders manually
  System accumulates route_snapshots
  Zero AI, zero templates

Phase 4: Templates Emerge
  System analyzes accumulated snapshots
  Generates candidate templates
  Supervisor reviews and approves
  Template mode becomes available
  + Multi-department, Segment rework

Phase 5: AI Recommendations
  Frequency-based suggestions
  Customer preference learning
  Quality correlation analysis
```

---

## 8. Summary

```
Route Builder Design:
  Day 1:    Manual Build ONLY (dept-grouped checklist)
  Week 1:   + Historical Copy (copy from own previous orders)
  Month 1:  + Smart defaults (same-customer, same-spec hints)
  Month 3:  + Auto-generated templates (from 30+ snapshots)
  Month 6+: + AI recommendations (from 200+ orders)

Core principle:
  Templates are EARNED, not given.
  The system learns from the supervisor, not the other way around.
  Every manual build makes the system smarter.
```

---

> **Manual Build is the foundation. Templates emerge from usage. AI comes last.**
