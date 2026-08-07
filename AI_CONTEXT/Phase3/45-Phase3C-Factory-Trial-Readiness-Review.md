# Phase 3-C · Factory Trial Readiness Review

> **Status:** Operational Validation
> **Purpose:** Verify V1.1 can survive real production before trial begins
> **Constraint:** No code. No schema changes. Reality check only.

---

## 1. Department Handoff — How Work Arrives

### 1.1 Current Mechanism

```
Dept lead discovers work by:
  Opening Dashboard -> seeing dept queue count
  Opening Order List -> filtering by status=active
  Opening individual orders -> finding active nodes in their dept

This is ACTIVE SEARCH, not PASSIVE NOTIFICATION.
```

### 1.2 The Real Question

```
制二负责人每天来上班。他怎么知道：
  - 有哪些制一的订单流转过来了？
  - 有没有紧急的返工需要处理？
  - 今天要做几个订单？

答案：他需要打开系统，看 Dashboard 的部门待办数量。
      然后点进去看具体是哪些订单。
```

### 1.3 Is This Sufficient for Trial?

```
Single-user trial (supervisor simulates all depts):
  YES. One person already sees everything.
  Department queue counts on Dashboard are enough.

Multi-user future (Phase 4):
  NEEDS department queue as the DEFAULT VIEW.
  Each user logs in -> sees only their dept's active nodes.
  No need to "find" work. Work finds them.
```

### 1.4 Phase 4 Requirement

```
Minimum:
  - User login with dept assignment
  - Dashboard auto-filtered by user.dept_id
  - Order List auto-filtered by user.dept_id
  - "My Tasks" as the default view

Not needed for single-user trial.
```

### 1.5 Verdict

```
Trial: SUFFICIENT. Supervisor sees all depts on one screen.
Phase 4: NEEDS dept-filtered default views.
```

---

## 2. Rework Reality — Can Our Model Handle Real Scenarios?

### 2.1 Scenario Walkthrough

```
Real Scenario A: P16 plating color slightly off (Delta-E < 1)
  Factory action: "重镀一次就行"
  Our model: Type A (single node rework on P16)
  Data: rework_pass = parent+1, 1 new node
  Verdict: CORRECT. Model matches reality.

Real Scenario B: After P15 brushing, surface contaminated
  Factory action: "洗一下，重新刷纹，重新电镀"
  Our model: Type B (segment rework: P21 wash + P15 + P16)
  Data: rework_pass = parent+1, 3 new nodes batch
  Verdict: CORRECT. Model matches reality.

Real Scenario C: P16 plating completely failed (wrong color, peeling)
  Factory action: "从磨板开始全部重做"
  Our model: Type C (segment rework: P12-P16)
  Data: rework_pass = parent+1, 4 new nodes batch
  Verdict: CORRECT. Model matches reality.

Real Scenario D: 制一冲板出现问题
  Factory action: "制一没法局部重做，只能全部重新开始"
  Our model: Type C but scope = entire order (P01-P35)
  Data: rework_pass = parent+1, 30+ new nodes
  Verdict: CORRECT but EXTREME. Supported by model. Rare in practice.
```

### 2.2 Data Model Stress Test

```
Can dept_id + seq + rework_pass represent all scenarios?

Scenario: P16 fails, Type C restart. Then new P15 also fails. Another Type C.
  Nodes in DB:
    P12 (orig, done, rp=0)
    P13 (orig, done, rp=0)
    P15 (orig, done, rp=0)
    P16 (orig, done, rp=0)
    P12 (R1, done, rp=1)     <- 1st segment rework
    P13 (R1, done, rp=1)
    P15 (R1, done, rp=1)
    P16 (R1, done, rp=1)
    P12 (R2, active, rp=2)   <- 2nd segment rework
    P13 (R2, waiting, rp=2)
    P15 (R2, waiting, rp=2)
    P16 (R2, waiting, rp=2)
    P17 (orig, waiting, rp=0) <- unchanged

  Current state: P12 R2 (active), ready to process.
  History: Fully preserved. All 12 nodes visible.
  Query for current: MAX(rework_pass) per process_id.

  Verdict: MODEL HANDLES NESTED REWORK. dept_id groups, seq orders, rework_pass tracks.
```

### 2.3 Missing Cases?

```
Case: Rework Type B (rewash) on P15, but supervisor selects wrong range.
  Recovery: Do another rework with correct range.
  Model: Both rework attempts visible. Supervisor completes correct one.
  Issue: Visual clutter from wrong rework nodes.
  Mitigation: Acceptable. Wrong rework nodes are legitimate production records.

Case: Segment rework where P17 (after failed node) also has a defect.
  Recovery: Complete the segment rework first. Then handle P17 separately (Type A).
  Model: Two independent rework operations. Seq handles ordering.
  Verdict: HANDLED.

No missing cases found. Three-level model is complete.
```

### 2.4 Verdict

```
dept_id + seq + rework_pass: SUFFICIENT for all real scenarios.
No new columns needed. No schema changes needed.
```

---

## 3. Error Correction — What Happens When Things Go Wrong

### 3.1 Error Types and Responses

| Error | Mechanism | Preserves History? | V1.1 |
|-------|----------|:-----------------:|:----:|
| Wrong order created (customer, spec) | Cancel order | YES (cancelled status) | ✅ |
| Wrong route (forgot P19) | Dynamic append | YES (new node added) | ✅ |
| Wrong route (extra process included) | Cannot remove after creation | — | ❌ GAP |
| Wrong node advanced (clicked done) | Undo (5min window) | YES (status reverted) | ✅ |
| Wrong node paused | Resume + re-pause | YES | ✅ |
| Wrong rework triggered | Complete wrong rework nodes + trigger correct one | YES | ✅ |
| Wrong rework scope | Trigger correct scope separately | YES | ✅ |

### 3.2 Identified Gap: Cannot Remove Extra Process After Creation

```
Scenario: Supervisor creates order, later realizes P13 (喷砂) should not have been included.
  P13 is already an order_node with status='waiting'.
  Options:
    A: Leave P13 as 'waiting' forever. Skip it during advancement. (Current)
    B: Mark P13 as 'cancelled' at node level. (New feature)
    C: Cancel entire order and recreate. (Heavy)

  Recommendation: Option A for V1.1 (acceptable). Option B for Phase 4.
  Node-level cancel would be useful but is not blocking for trial.
```

### 3.3 Verdict

```
Error coverage: 6/7 scenarios handled. 1 gap (node-level cancel).
Gap severity: LOW. Workaround exists (skip the node or cancel order).
Not blocking for trial.
```

---

## 4. Route Evolution — When Do Templates Emerge?

### 4.1 Data Accumulation Projection

```
Week 1:  10 orders across 5 customers, ~3 distinct spec combinations
  Each spec has 2-4 orders. Not enough for patterns.
  History Copy becomes useful around order #5 (same customer).

Week 2:  25 orders. ~5 distinct spec combinations.
  Best spec (e.g., Sunray+Silver) has 10+ orders.
  Process frequency: P15 100%, P16 100%, P13 60%.
  Pattern: "P13 is usually included but not always."
  Template quality: LOW. 10 orders is not enough.

Week 4:  50 orders. Best spec has 20+ orders.
  Process frequency stabilizes. P13 at 65%, P14 at 15%.
  Pattern: Clear "core" processes (>90%) vs "optional" (40-70%) vs "rare" (<20%).
  Template quality: MEDIUM. Supervisor could review and approve.

Month 3: 150 orders. Best spec has 60+ orders.
  Process frequency very stable.
  Customer-specific patterns emerge.
  Template quality: HIGH. Ready for auto-generation.
```

### 4.2 Template Readiness Thresholds

| Orders per spec | Template Quality | Action |
|:--------------:|:----------------:|--------|
| < 10 | Too low | Do not generate |
| 10-30 | Emerging | Generate as "draft". Supervisor reviews. |
| 30-60 | Stable | Generate as "suggested". High confidence. |
| 60+ | Mature | Auto-suggest. Supervisor confirms. |

### 4.3 When Is History Copy Most Useful?

```
After 5+ orders: History Copy saves time for repeat specs.
  Supervisor picks same customer -> loads last route -> adjusts.
  Most useful when: same customer orders same product repeatedly.

After 10+ orders: Cross-customer patterns visible.
  "Sunray+Silver for ACC uses same processes as for FAF."
  History Copy could suggest: "This is similar to Order #0012. Load?"
```

### 4.4 Verdict

```
Trial (2-4 weeks, ~50 orders): Templates begin to emerge but not ready.
Phase 4 (3 months, ~150 orders): Templates ready for auto-generation.
History Copy is useful starting at order #5.
No changes needed for trial. System will accumulate data passively.
```

---

## 5. Multi-User Future — Phase 4 Minimum

### 5.1 What Changes

| Dimension | V1.1 (Trial) | Phase 4 (Multi-User) |
|-----------|-------------|---------------------|
| Users | 1 (anon key) | <10 (Supabase Auth) |
| View | All departments | Filtered by user.dept_id |
| Operations | All nodes | Only own dept nodes |
| Traceability | None | updated_by on every change |
| RLS | USING(true) | Dept-based policy |

### 5.2 Phase 4 Minimum Schema

```
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  dept_id UUID REFERENCES departments(id),
  role TEXT DEFAULT 'worker' CHECK (role IN ('admin','worker'))
);

ALTER TABLE order_nodes ADD COLUMN updated_by UUID REFERENCES users(id);
ALTER TABLE orders ADD COLUMN created_by UUID REFERENCES users(id);

-- RLS: department isolation
CREATE POLICY "dept_nodes" ON order_nodes
  FOR ALL USING (dept_id = (SELECT dept_id FROM users WHERE id = auth.uid())
                 OR (SELECT role FROM users WHERE id = auth.uid()) = 'admin');
```

### 5.3 Phase 4 Minimum Application Changes

```
- Login page (Supabase Auth UI)
- Auto-filter Dashboard by user.dept_id
- Auto-filter Order List by user.dept_id
- Record auth.uid() on every updateNode/insertNode
- Admin override: supervisor sees all departments
```

### 5.4 Verdict

```
Phase 4 changes are well-defined. No architectural surprises.
Current model cleanly extends to multi-user.
Schema changes: 1 new table + 2 new columns + RLS update.
```

---

## 6. Trial Success Criteria

### 6.1 Quantitative Targets

| Metric | Minimum | Target | Stretch |
|--------|:------:|:------:|:------:|
| Orders created | 20 | 40 | 60 |
| Distinct customers used | 5 | 10 | 15 |
| Route consistency (best spec) | 70% | 80% | 90% |
| Cancelled orders | < 10% | < 5% | < 2% |
| Segment reworks recorded | 3 | 5 | 10 |
| Exceptions recorded | 5 | 15 | 30 |
| Undo actions used | — | Record | — |
| Avg route building time | < 5 min | < 3 min | < 2 min |

### 6.2 Qualitative Targets

```
Supervisor feedback:
  [ ] "I can build routes faster than writing them on paper"
  [ ] "I trust the system to remember what I did"
  [ ] "I would continue using this after the trial"
  [ ] "Segment rework makes sense for our Dept-2 issues"
  [ ] "Undo has saved me at least once"

System behavior:
  [ ] Zero data loss incidents
  [ ] Zero schema drift
  [ ] Zero critical bugs unresolved
  [ ] Page load < 3 seconds on factory WiFi
  [ ] No "where is my order?" confusion
```

### 6.3 Go/No-Go for Phase 4

```
GO if:
  >= 20 orders created
  >= 70% route consistency for at least 1 spec
  < 10% cancellation rate
  Supervisor says "I would continue using this"

CONDITIONAL GO if:
  15-19 orders but all other criteria met
  Extend trial 1-2 weeks

NO-GO if:
  < 10 orders in 4 weeks (supervisor avoids system)
  > 15% cancellation rate (route builder is confusing)
  Supervisor says "paper is better"
  Data loss or corruption occurs
```

---

## 7. Overall Readiness

```
╔══════════════════════════════════════════╗
║                                          ║
║   V1.1 FACTORY TRIAL: READY              ║
║                                          ║
║   Dept Handoff:   Sufficient for trial   ║
║   Rework Model:   Complete (3 types)     ║
║   Error Recovery: 6/7 scenarios covered  ║
║   Route Evolution:Data accumulating      ║
║   Multi-User:     Phase 4 planned        ║
║   Trial Criteria: Defined                ║
║                                          ║
║   BLOCKERS: NONE                         ║
║   GAPS: 1 (node-level cancel, LOW)      ║
║                                          ║
║   PROCEED TO FACTORY TRIAL               ║
║                                          ║
╚══════════════════════════════════════════╝
```

---

> **V1.1 is ready for real factory operation. System is deployed. Supervisor is prepared. Trial can begin.**
