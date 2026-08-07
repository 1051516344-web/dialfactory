# Phase 3-D · Factory Trial Execution

> **Status:** 🔵 IN TRIAL
> **Start Date:** 2026-08-07
> **Target Duration:** 2–4 weeks
> **Trial User:** Product Supervisor (1 person)
> **System:** https://1051516344-web.github.io/dialfactory/
> **Principle:** Observe. Record. Do NOT develop.

---

## 1. Trial Objective

Validate that DialFactory V1.1 replaces paper-based order tracking in a real Guangzhou watch dial factory.

**The one-sentence test:**
> Does the supervisor choose DialFactory over their paper notebook?

Everything else — metrics, consistency scores, rework counts — feeds into answering that question.

---

## 2. Trial Baseline

| Dimension | State at Start |
|-----------|---------------|
| Database | 5 departments, 16 customers, 35 processes, 0 routes, 0 orders |
| Code | Commit `69a0c4f` — all 6 smoke tests pass |
| Schema | 8 tables, 58 fields, 0 CASCADE, frozen |
| Features | Order create, node advance/pause/resume, 3 rework types, undo, trial delete |
| User model | Single user (anon key), supervisor operates all departments |
| Known gaps | Node-level cancel (LOW), completed-order delete protection is UI-only (INFO) |

---

## 3. Trial Workflow

### 3.1 Daily Routine

```
MORNING (10 min)
  1. Open Dashboard (#/)
  2. Check stalled orders (active > 3 days)
  3. Check due warnings (due within 3 days)
  4. Create any new orders received overnight

MID-DAY (5 min)
  5. Advance nodes completed on the floor
  6. Record any exceptions found

END OF DAY (10 min)
  7. Complete all pending node advances
  8. Record exceptions (quality issues found today)
  9. Trigger rework if Dept-2 issues require it
 10. Verify completed orders show green status
```

### 3.2 Order Creation Flow

```
1. Supervisor receives customer order (email/WeChat/phone)
2. Opens DialFactory → #/orders/new
3. Fills basic info: order_no, customer, qty, due_date, specs
4. Builds route manually:
   - Reviews drawing requirements
   - Checks needed processes dept-by-dept
   - Skips departments not needed (e.g., no printing → skip 制三)
5. Clicks "创建订单"
6. System generates route_snapshot + order_nodes
7. First node auto-activated, order status = in_production
```

### 3.3 Node Advancement Flow

```
1. Supervisor opens Order Detail for an in_production order
2. Finds the active (blue) node
3. Clicks [Complete]:
   - Node turns green (done)
   - Next node auto-activates (same dept: direct; cross-dept: after all-dept-done check)
4. For 检验-type nodes: enters qty_out before completing
5. When all nodes done → order status = completed
```

### 3.4 Rework Flow

```
Type A (Single Node Redo):
  P16 color slightly off → Click [Rework] on P16
  → New P16 created, rework_pass+1, active

Type B (Rewash Segment):
  Surface contamination after P15 → Click [Segment Rework]
  → Select range: P21+P15+P16
  → Batch created: P21 active, P15/P16 waiting

Type C (Full Dept Restart):
  P16 plating completely failed → Click [Dept Rework]
  → System detects 制二 range: P12→P16
  → Batch created: P12 active, rest waiting

Rule: Always verify rework scope before confirming.
```

### 3.5 Error Recovery

| Situation | Action |
|-----------|--------|
| Clicked "done" by mistake | Undo within 5 minutes |
| Wrong pause reason | Resume → re-pause with correct reason |
| Wrong order created | Cancel order (status=cancelled) |
| Wrong process checked | Skip the node (leave it waiting forever) |
| Wrong rework triggered | Complete wrong nodes + trigger correct rework |

---

## 4. Metrics Tracking

### 4.1 Usage Metrics

| # | Metric | Source | Week 1 | Week 2 | Week 3 | Week 4 |
|:--|--------|--------|:------:|:------:|:------:|:------:|
| M1 | Orders created | `SELECT count(*) FROM orders` | | | | |
| M2 | Orders completed | `WHERE status='completed'` | | | | |
| M3 | Orders cancelled | `WHERE status='cancelled'` | | | | |
| M4 | Distinct customers used | `SELECT count(DISTINCT customer_id)` | | | | |
| M5 | Days system was used | Supervisor self-report | | | | |
| M6 | Avg route building time | Supervisor self-report (min) | | | | |

### 4.2 Route Data Metrics

| # | Metric | Source | Week 1 | Week 2 | Week 3 | Week 4 |
|:--|--------|--------|:------:|:------:|:------:|:------:|
| R1 | Unique route snapshots | Dedup by process set | | | | |
| R2 | Best spec combination | Most frequent process set | | | | |
| R3 | Best spec order count | Orders matching best spec | | | | |
| R4 | Route consistency (best spec) | % of orders with identical steps | | | | |
| R5 | Avg processes per order | Mean of step counts | | | | |

### 4.3 Production Tracking Metrics

| # | Metric | Source | Week 1 | Week 2 | Week 3 | Week 4 |
|:--|--------|--------|:------:|:------:|:------:|:------:|
| P1 | Total node advancements | Count of status='done' nodes | | | | |
| P2 | Exceptions recorded | `SELECT count(*) FROM exception_events` | | | | |
| P3 | Type A reworks | `WHERE rework_pass=1 AND note IS NULL` | | | | |
| P4 | Type B reworks | `WHERE note LIKE 'Segment rework%'` | | | | |
| P5 | Type C reworks | `WHERE note LIKE 'Full dept%'` | | | | |
| P6 | Undo actions used | Supervisor self-report count | | | | |
| P7 | Pause events | Count of pause_reason NOT NULL | | | | |

### 4.4 System Health Metrics

| # | Metric | Source | Status |
|:--|--------|--------|:------:|
| S1 | Page load errors | Supervisor report | |
| S2 | Data loss incidents | Any unexpected missing data | |
| S3 | Schema drift | `SELECT count(*) FROM information_schema.columns WHERE table_schema='public'` = 58 | |
| S4 | Orphan records | FK integrity check | |
| S5 | Critical bugs | Issues blocking order creation or node advancement | |

---

## 5. Weekly Review Template

### Week 1 Review — Date: ________

```
STATISTICS:
  Orders created: ___   Completed: ___   Cancelled: ___
  Exceptions recorded: ___   Reworks: ___ (A:__ B:__ C:__)
  Avg route time: ___ min

WHAT WORKED:
  1.
  2.
  3.

WHAT BLOCKED WORK:
  1.
  2.

WHAT USERS REQUESTED:
  1.
  2.

WHAT SHOULD NOT BE BUILT:
  1.
  2.

ROUTE PATTERNS OBSERVED:
  Most common spec: ___________
  Consistency: ___%

SUPERVISOR QUOTES:
  "___________________________________________"

ACTIONS FOR NEXT WEEK:
  [ ] 
  [ ] 
```

### Week 2 Review — Date: ________

```
STATISTICS:
  This week: ___ orders   Total: ___ orders
  Completed: ___   Cancelled: ___ (rate: ___%)
  Exceptions: ___   Reworks: ___ (A:__ B:__ C:__)
  Avg route time: ___ min (trend: ↑↓→)

WHAT WORKED:
  1.
  2.
  3.

WHAT BLOCKED WORK:
  1.
  2.

WHAT USERS REQUESTED:
  1.
  2.

WHAT SHOULD NOT BE BUILT:
  1.
  2.

ROUTE CONSISTENCY CHECK:
  Spec A (_________): ___ orders, ___% consistent
  Spec B (_________): ___ orders, ___% consistent
  Are routes becoming more consistent? Yes / No

SUPERVISOR QUOTES:
  "___________________________________________"

ACTIONS FOR NEXT WEEK:
  [ ] 
  [ ] 
```

### Week 3 Review — Date: ________

```
STATISTICS:
  This week: ___ orders   Total: ___ orders
  Completed: ___   Cancelled: ___ (rate: ___%)
  Exceptions: ___   Reworks: ___ (A:__ B:__ C:__)
  Avg route time: ___ min

WHAT WORKED:
  1.
  2.
  3.

WHAT BLOCKED WORK:
  1.
  2.

WHAT USERS REQUESTED:
  1.
  2.

WHAT SHOULD NOT BE BUILT:
  1.
  2.

TEMPLATE CANDIDATES:
  Spec ____________: ___ orders, ___% consistent → [ ] Candidate  [ ] Not ready
  Spec ____________: ___ orders, ___% consistent → [ ] Candidate  [ ] Not ready

SUPERVISOR QUOTES:
  "___________________________________________"

MID-TRIAL ASSESSMENT:
  On track for 20+ orders?  Yes / No
  On track for 70%+ consistency?  Yes / No
  Any blocking issues?  Yes / No
```

### Week 4 Review — Date: ________

```
STATISTICS:
  This week: ___ orders   TOTAL: ___ orders
  Completed: ___   Cancelled: ___ (rate: ___%)
  Total exceptions: ___   Total reworks: ___ (A:__ B:__ C:__)
  Avg route time: ___ min (start: ___ → now: ___)

WHAT WORKED:
  1.
  2.
  3.

WHAT BLOCKED WORK:
  1.
  2.

WHAT USERS REQUESTED:
  1.
  2.

WHAT SHOULD NOT BE BUILT:
  1.
  2.

FINAL ROUTE ANALYSIS:
  Best spec: ____________: ___ orders, ___% consistency
  2nd spec:  ____________: ___ orders, ___% consistency
  3rd spec:  ____________: ___ orders, ___% consistency

SUPERVISOR FINAL INTERVIEW:
  "Would you continue using this system?"  Yes / Yes-with-changes / No
  "What does DialFactory do better than paper?"  _______________
  "What does paper do better than DialFactory?"  _______________
  "Ready for multi-user?"  Yes / Not yet / No
```

---

## 6. Trial Success Criteria

### 6.1 Minimum (All Required for GO)

| # | Criterion | Target | Actual |
|:--|-----------|:------:|:------:|
| C1 | Real orders created | ≥ 20 | |
| C2 | Route consistency for repeated products | ≥ 70% | |
| C3 | Critical data loss incidents | 0 | |
| C4 | Supervisor confirms system reflects reality | Yes | |

### 6.2 Target (At Least 3 of 5 for GO)

| # | Criterion | Target | Actual |
|:--|-----------|:------:|:------:|
| T1 | Total orders | ≥ 40 | |
| T2 | Avg route building time | < 3 min | |
| T3 | Cancellation rate | < 5% | |
| T4 | Segment reworks executed | ≥ 5 | |
| T5 | Exception recording is habitual | > 1 per 5 orders | |

### 6.3 Stretch

| # | Criterion | Target | Actual |
|:--|-----------|:------:|:------:|
| S1 | Total orders | ≥ 60 | |
| S2 | Route consistency (best spec) | ≥ 90% | |
| S3 | Avg route building time | < 2 min | |
| S4 | Cancellation rate | < 2% | |
| S5 | Template candidates identified | ≥ 3 | |

---

## 7. End-of-Trial Decision Framework

### Decision Tree

```
C1-C4 ALL MET?
  │
  ├─ YES → T1-T5: ≥ 3 MET?
  │         │
  │         ├─ YES → 🟢 GO: Proceed to Phase 4
  │         │         Multi-user development.
  │         │         Template generation from accumulated snapshots.
  │         │
  │         └─ NO  → 🟡 CONDITIONAL GO
  │                   Extend trial 1-2 weeks.
  │                   Fix specific shortfalls.
  │                   Re-evaluate.
  │
  └─ NO  → Which criteria failed?
            │
            ├─ C1 failed (< 20 orders) →
            │     Supervisor not using the system.
            │     Root cause: avoidant? too hard? no time?
            │     🟡 EXTEND or 🔴 STOP depending on cause.
            │
            ├─ C2 failed (< 70% consistency) →
            │     Route builder may need reorganization.
            │     🟡 EXTEND. Collect more data. Adjust grouping.
            │
            ├─ C3 failed (data loss) →
            │     🔴 STOP. Investigate root cause before proceeding.
            │
            └─ C4 failed (supervisor rejects) →
                  🔴 STOP. System does not meet factory needs.
                  Return to design phase.
```

### Decision Record

```
Decision:  GO / CONDITIONAL GO / EXTEND / STOP
Date:      ________
Rationale: ________
Signed:    ________
```

---

## 8. Prohibited Actions During Trial

```
FORBIDDEN — DO NOT DO ANY OF THESE:

  ❌ Modify database schema
     No new tables. No new columns. No ALTER TABLE.
     If schema seems wrong: WRITE IT DOWN.

  ❌ Add new features
     Feature requests go in the weekly review log.
     Implemented AFTER trial, never during.

  ❌ Pre-create route templates
     Templates emerge from usage data.
     Pre-loading templates invalidates the route consistency metric.

  ❌ Change the UI
     UI changes mid-trial invalidate timing and consistency data.
     Suggestions → weekly review → implement after trial.

  ❌ Fix non-critical bugs
     If it doesn't block order creation or node advancement:
     WRITE IT DOWN. Fix after trial.

  ❌ Build routes for the supervisor
     The struggle of the first 5 orders reveals where the UI needs improvement.
     Let the supervisor build their own routes.

  ❌ Add MES/ERP features
     No scheduling. No inventory. No equipment integration.
     No financial tracking. No HR functions.
     DialFactory is a TRACKING tool.

PERMITTED — ALWAYS DO THESE:

  ✅ Record every issue, suggestion, and observation
  ✅ Backup the database weekly (Supabase Dashboard → Backups)
  ✅ Let the supervisor struggle with the first few orders
  ✅ Answer questions about how to use the system
  ✅ Fix CRITICAL bugs only (system crash, data loss, unable to create orders)
```

---

## 9. Trial Closeout

### At Trial End

1. **Collect all weekly reviews** into a single summary
2. **Run metrics queries** against the Supabase database
3. **Interview the supervisor** using the final interview template
4. **Generate** [54-Phase3D-Trial-Review.md](AI_CONTEXT/Phase3/54-Phase3D-Trial-Review.md) containing:
   - Final metrics vs. targets
   - Route pattern analysis
   - Consolidated feedback
   - Decision: GO / CONDITIONAL GO / EXTEND / STOP
   - Phase 4 scope adjustments based on findings

### Data Preservation

```
The trial database is the foundation of Phase 4:
  - All route_snapshots feed template generation
  - All rework_pass > 0 nodes validate the rework model
  - All exception_events inform quality analytics
  - All cancelled orders document error patterns

DO NOT reset the database after trial.
Trial data IS production data.
```

---

## 10. Phase 4 Preview (For Reference Only)

```
What comes after a GO decision:

  Schema:
    CREATE TABLE users (id, email, dept_id, role)
    ALTER TABLE order_nodes ADD COLUMN updated_by UUID
    ALTER TABLE orders ADD COLUMN created_by UUID
    RLS: department isolation policies

  Application:
    Supabase Auth (email/password login)
    Department queue per user (auto-filtered by dept_id)
    Operation attribution (who did what)
    Template generation from accumulated route_snapshots
    Route Editor page (CRUD for process_routes)

  Timeline: 2-3 weeks development → multi-user trial

DO NOT START PHASE 4 DEVELOPMENT DURING THIS TRIAL.
```

---

> **Trial begins 2026-08-07. First weekly review: 2026-08-14.**
> **No feature development. No schema changes. Record everything.**
