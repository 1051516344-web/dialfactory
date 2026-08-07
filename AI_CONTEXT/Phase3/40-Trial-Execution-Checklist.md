# DialFactory V1.1 · Factory Trial Execution Checklist

> **Status:** Ready for Trial
> **Duration:** 2-4 weeks
> **User:** 产品主管 (1 person)
> **System:** https://1051516344-web.github.io/dialfactory/
> **Principle:** Observe, collect, validate. Do NOT develop during trial.

---

## Phase 0: Day 0 — System Preparation

### 0.1 Data Verification

```
[ ] Open Dashboard. Verify it loads without errors.

[ ] Check Customers:
    Navigate to: Supabase Dashboard -> Table Editor -> customers
    Verify: 16 real customers exist.
    Verify: Demo customer "时诺 (SN)" is DELETED.

[ ] Check Processes:
    Navigate to: Supabase Dashboard -> Table Editor -> processes
    Verify: 35 rows (P01-P35).
    Verify: P16 电镀 has dept_id = 制二 (NOT 制三).
    Verify: Process names match factory terminology.

[ ] Check Departments:
    Navigate to: Supabase Dashboard -> Table Editor -> departments
    Verify: 5 rows. 制一(seq=1), 制二(2), 制三(3), 制四(4), 总QC(5).

[ ] Check Routes:
    Open Route List page (#/routes).
    Verify: "暂无工艺路线" (empty state).
    Routes will emerge from trial usage.

[ ] Check Orders:
    Open Order List page (#/orders).
    Verify: "暂无订单" (empty state).
    Fresh start.
```

### 0.2 System Access Test

```
[ ] Open https://1051516344-web.github.io/dialfactory/ on tablet browser.

[ ] Test navigation:
    Click 首页 -> Dashboard loads.
    Click 订单 -> Order List loads (empty).
    Click 新建 -> Order Create form loads.
    Click 路线 -> Route List loads (empty).
    Click 异常 -> Exception List loads (empty).

[ ] Verify all 5 pages accessible.
[ ] Verify no console errors (F12 -> Console, should be clean).
[ ] Verify page loads in < 3 seconds on factory WiFi.
```

### 0.3 Supervisor Orientation

```
[ ] Explain: "This is a production tracking tool, not a full MES."

[ ] Explain the 5 questions it answers:
    Q1: Where is each order right now?
    Q2: How long has it been stuck?
    Q3: Why is it stopped?
    Q4: What happened before?
    Q5: What patterns emerge from our routes?

[ ] Explain: "There are no pre-loaded routes. You will build each route
    manually. The system will learn from your decisions."

[ ] Explain: "For this trial, you will operate ALL departments yourself.
    This simulates how each department lead will use the system later."

[ ] Explain: "If something goes wrong:
    - Wrong process checked: undo within 5 minutes.
    - Wrong order created: cancel the order.
    - Node advanced by mistake: undo within 5 minutes.
    - Major issue: tell the developer. Do NOT try to fix the database."
```

---

## Phase 1: First Orders (Week 1, Days 1-3)

### 1.1 Order #1 — Supervisor's First Build

```
Goal: Create the first real order. Take your time. No rush.

[ ] Step 1: Gather order information.
    Customer: ___________
    Product specs: texture _____, color _____, sandblast _____
    Quantity: _____ pcs
    Due date: _____
    Drawing reference: _____

[ ] Step 2: Open Order Create (#/orders/new).

[ ] Step 3: Fill Basic Info.
    Order number: _____ (use format: CUST-YYYY-NNNN)
    Customer: select from dropdown.
    Quantity: enter number.
    Due date: select from calendar.
    Texture: select from dropdown.
    Color: type in (free text).
    Sandblast: select from dropdown.

[ ] Step 4: Build Route.
    Review the drawing and customer requirements.
    Mentally map: "This product needs these processes..."

    Go through each department:
      制一: Which forming processes does this product need?
      制二: Which surface treatment processes?
      制三: Any printing?
      制四: Any assembly?
      QC: Always P35.

    Check the boxes for needed processes.
    Leave unchecked what's not needed.

    This should take 2-4 minutes for the first order.

[ ] Step 5: Preview.
    Click [Preview Route Flow].
    Visually scan: "Does this sequence look right?"
    If wrong: go back and adjust checkboxes.
    If right: proceed.

[ ] Step 6: Create Order.
    Click [Create Order].
    System redirects to Order Detail.
    Verify: nodes appear as a vertical flow.
    Verify: first node (P01 or similar) is blue (active).

[ ] Step 7: Record your experience.
    Time taken: _____ minutes.
    Any confusion? _____
    Any processes you couldn't find? _____
```

### 1.2 Orders #2-#5 — Building Familiarity

```
Create 4 more orders. Try to use different customers and specs.

Order #2: Customer _____, Spec _____, Time _____ min.
Order #3: Customer _____, Spec _____, Time _____ min.
Order #4: Customer _____, Spec _____, Time _____ min.
Order #5: Customer _____, Spec _____, Time _____ min.

Goal: Time should decrease as you learn where processes are in the list.
Target: < 3 minutes per order by Order #5.
```

### 1.3 Advancing Nodes — Simulating Production

```
For each order with active nodes:

[ ] Open Order Detail.

[ ] Find the active (blue) node.

[ ] Click [Complete].
    Node turns green (done).
    Next node auto-activates (turns blue).

[ ] If the node is a 检验 (QC) type:
    System prompts for output quantity.
    Enter the actual qualified quantity.
    Confirm.

[ ] Continue completing nodes until:
    - All nodes done -> order status = "completed" (green).
    - Or: issue found -> see exception/rework section below.
```

---

## Phase 2: Daily Routine (Weeks 1-4)

### 2.1 Morning (10 minutes)

```
[ ] Open Dashboard (#/).
    Check: any stalled orders (active > 3 days)?
    Check: any due date warnings (due within 3 days)?
    Check: department queue counts.

[ ] For each stalled order:
    Click to open Order Detail.
    Why is it stalled? Consider: pause the node with a reason.
    Or: advance it if it was forgotten.

[ ] Create any new orders received overnight:
    Customer emails/WeChat with new orders -> create in system.
```

### 2.2 Mid-Day (5 minutes)

```
[ ] Open Order List (#/orders).
    Filter by status = 生产中.
    Scan: any orders with all nodes paused?
    If yes: is the pause still valid? Resume if resolved.

[ ] For active orders:
    Advance any nodes that were completed on the floor.
    Record any exceptions found.
```

### 2.3 End of Day (10 minutes)

```
[ ] Complete all pending node advances.
    Catch up: any work done today that should be recorded?

[ ] Record exceptions:
    Any quality issues found today?
    Record them on the relevant node.

[ ] Trigger rework if needed:
    Dept-2 issues requiring rework?
    Use [Segment Rework] for dept-level issues.
    Use [Rework] for single-process issues.

[ ] Quick scan: any orders completed today?
    Verify: status = "completed" (green checkmark).
    Check: 总QC output quantity recorded.
```

### 2.4 Exception Recording Habit

```
When you find a quality issue on the floor:

[ ] Open the order in DialFactory.
[ ] Find the node where the issue was discovered.
[ ] Click [Record Exception].
[ ] Fill: type, quantity, resolution.
[ ] Submit.

This takes < 20 seconds.
Do this immediately, not at end of day.
Memory is unreliable. The system is reliable.
```

### 2.5 Rework Triggering

```
When Dept-2 needs rework:

[ ] Type A (Single node): plating color slightly off.
    Click [Rework] on the failed node.
    New node created. Complete it as normal.

[ ] Type B (Rewash): surface contamination.
    Click [Segment Rework] on the affected node.
    Select range: P21 (wash) + affected processes.
    New batch created. Process them in order.

[ ] Type C (Dept restart): major plating failure.
    Click [Dept Rework] on the failed node.
    System auto-detects range from P12.
    New batch created. Process from P12.

Important: Always verify the rework scope before confirming.
```

---

## Phase 3: Weekly Review (Every Friday)

### 3.1 Week 1 Review

```
Statistics:
  Orders created: _____
  Orders completed: _____
  Orders cancelled: _____
  Exceptions recorded: _____
  Reworks triggered: _____ (Type A: __, Type B: __, Type C: __)

Questions for supervisor:
  1. Can you build routes without referring to paper notes?
  2. What was the hardest part this week?
  3. Any processes missing from the library?
  4. Any processes you never use?
  5. Any UI confusion?

Actions:
  [ ] Record all answers.
  [ ] Fix any wrong process names or department assignments.
  [ ] Note any feature requests (do NOT implement during trial).
```

### 3.2 Week 2 Review

```
Statistics:
  Orders created this week: _____
  Total orders to date: _____
  Avg route building time: _____ min
  Route patterns emerging? Yes / No
  Which spec combination appears most? _____

Route consistency check:
  For the most common spec combination:
    Order #A: processes selected: _____
    Order #B: processes selected: _____
    Order #C: processes selected: _____
    Are they the same? > 80% match? Yes / No

Questions for supervisor:
  1. Are you getting faster at building routes?
  2. Have you used "copy from previous order" yet?
  3. Any customers order the same thing every time?
  4. Is the system saving you time vs. paper notes?

Actions:
  [ ] If > 10 orders for one spec: note as "template candidate".
  [ ] If route consistency > 80%: flag for Phase 4 template generation.
```

### 3.3 Week 3-4 Review

```
Statistics:
  Total orders: _____
  Orders completed: _____
  Cancelled orders: _____ (rate: __%)
  Total exceptions: _____
  Total reworks: _____
  Undo actions used: _____ times

Route pattern analysis:
  Spec combination 1: _____, _____ orders, consistency ___%
  Spec combination 2: _____, _____ orders, consistency ___%
  Spec combination 3: _____, _____ orders, consistency ___%

Decision point:
  [ ] At least 20 total orders?
  [ ] At least 1 spec with > 80% consistency?
  [ ] Cancellation rate < 5%?
  [ ] Supervisor confirms system is usable?

  If ALL YES -> Recommend: PROCEED TO PHASE 4.
  If any NO  -> Recommend: EXTEND TRIAL or REVISE.
```

---

## Phase 4: Prohibited Actions During Trial

### 4.1 NEVER Do These

```
[ ] DO NOT modify database schema.
    No new tables. No new columns. No ALTER TABLE.
    If you think the schema is wrong: WRITE IT DOWN. Do not change it.

[ ] DO NOT force template usage.
    If the supervisor builds similar routes, let the system record it.
    Do NOT pre-create templates. Templates emerge from usage.

[ ] DO NOT add MES features.
    No equipment integration. No automatic data collection.
    No scheduling. No capacity planning.
    DialFactory is a TRACKING tool, not an MES.

[ ] DO NOT add ERP features.
    No financial tracking. No inventory management.
    No procurement. No HR functions.

[ ] DO NOT optimize UI during trial.
    If the supervisor suggests a UI change: WRITE IT DOWN.
    Implement AFTER trial, not during.
    Changing UI mid-trial invalidates the consistency data.

[ ] DO NOT fix non-critical bugs during trial.
    If a bug does not block order creation or node advancement:
    WRITE IT DOWN. Fix after trial.
    Critical bugs only: system crash, data loss, unable to create orders.

[ ] DO NOT add new features.
    Feature requests: WRITE THEM DOWN. Prioritize after trial.
```

### 4.2 ALWAYS Do These

```
[ ] Record every issue, suggestion, and observation.
    Keep a running text file or notebook.
    Date, description, severity (low/medium/high).

[ ] Let the supervisor struggle a bit.
    First 5 orders will be slow. That's expected.
    Do NOT intervene by building routes for them.
    The struggle reveals where the UI needs improvement.

[ ] Backup the database weekly.
    Supabase Dashboard -> Database -> Backups.
    Or: export via Supabase CLI.

[ ] Keep the trial running.
    Even if it's imperfect. Even if there are complaints.
    A working system with flaws is better than a perfect system that was never tried.
```

---

## Phase 5: Trial End — Go/No-Go Evaluation

### 5.1 Quantitative Check

```
Must-Have (all required):
  [ ] Orders created: _____ (target: 20+)
  [ ] Spec combinations with 10+ orders: _____ (target: 2+)
  [ ] Route consistency (best spec): _____% (target: > 80%)
  [ ] Cancellation rate: _____% (target: < 5%)
  [ ] Segment reworks executed: _____ (target: 5+)
  [ ] Supervisor confirms: "system is usable" (Yes/No)
  [ ] Schema drift: _____ (target: 0 changes)
  [ ] Critical bugs unresolved: _____ (target: 0)

  ALL 8 MUST BE "YES" OR ABOVE TARGET.

Should-Have (at least 3 of 5):
  [ ] Total orders: _____ (target: 50+)
  [ ] Avg route time: _____ min (target: < 2 min)
  [ ] Customer-specific pattern identified: (Yes/No)
  [ ] Exception recording is habitual: (Yes/No)
  [ ] Zero schema change requests: (Yes/No)

  AT LEAST 3 SHOULD BE MET.
```

### 5.2 Qualitative Check

```
Supervisor interview:

  1. "Would you continue using this system if the trial ended today?"
     [ ] Yes, without changes
     [ ] Yes, but with minor changes (list: __________)
     [ ] Yes, but with major changes (list: __________)
     [ ] No, because __________

  2. "What does DialFactory do better than your paper notebook?"
     __________

  3. "What does your paper notebook do better than DialFactory?"
     __________

  4. "If we add multi-user support (each dept lead sees their own tasks),
      would that make the system more useful?"
     [ ] Yes, significantly
     [ ] Yes, somewhat
     [ ] No difference
     [ ] Not sure

  5. "Any other feedback?"
     __________
```

### 5.3 Decision

```
[ ] GO: Proceed to Phase 4 (Multi-User Development)
    All 8 Must-Have met.
    At least 3 Should-Have met.
    Supervisor interview positive.

[ ] CONDITIONAL GO: Proceed with specific fixes first.
    Some Must-Have not met.
    Fix identified issues in 1-2 weeks.
    Re-evaluate.

[ ] NO-GO: Revise V1.1 before Phase 4.
    Multiple Must-Have not met.
    Supervisor interview negative.
    Route model fundamentally wrong.
    Return to design phase.

Decision: __________
Date: __________
Signed off by: __________
```

---

## Summary

```
Week 1:  Build first orders. Get comfortable. ~10 orders.
Week 2:  Establish daily routine. Record exceptions and reworks.
Week 3:  Observe patterns. Check route consistency.
Week 4:  Evaluate. Decide Go/No-Go for Phase 4.

Key numbers:
  Target: 20+ orders, 80%+ consistency, < 5% cancellation
  Trial succeeds when supervisor CHOOSES the system over paper.
```

---

> **Checklist ready. Hand to supervisor. Observe. Record. Decide.**
