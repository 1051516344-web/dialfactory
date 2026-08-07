# Phase 3-B · Trial Workflow

> **Status:** Supervisor Operating Procedure
> **User:** 产品主管 (single user, simulates all departments)
> **Duration:** 2-4 weeks

---

## 1. Daily Routine

### Morning (10 min)
```
1. Open Dashboard (#/).
   Check stalled orders (active > 3 days).
   Check due warnings (due within 3 days).

2. Create new orders from overnight requests.
   #/orders/new -> fill info -> build route -> create.

3. Advance any nodes completed on the floor.
   Open relevant order -> click [Complete] on done nodes.
```

### Mid-Day (5 min)
```
1. Open Order List (#/orders).
   Filter: 生产中.
   Check for paused orders. Resume if resolved.

2. Record any exceptions found.
   Open order -> find node -> [Record Exception].
```

### End of Day (10 min)
```
1. Complete all pending advances.
2. Record all exceptions.
3. Trigger rework if needed.
4. Verify completed orders: status = "completed".
```

## 2. Order Creation Flow

```
1. Receive order + drawing from customer.
2. Open #/orders/new.
3. Fill: order_no, customer, qty, due_date, specs.
4. Build Route:
   a. Review drawing requirements.
   b. Mentally map: "This product needs..."
   c. Check processes across 5 departments.
   d. Preview route flow.
   e. Create order.
5. Verify: nodes generated. First node active.
```

## 3. Node Advancement (Simulating All Departments)

```
For each active node in any order:
  1. Click [Complete].
     Node -> green. Next node auto-activates.
  2. If 检验 type: enter qty_out.
  3. When last node in dept done:
     First node in next dept auto-activates.
     (Simulates "flow to next department")
```

## 4. Exception Recording

```
When quality issue found:
  1. Open order. Find node where discovered.
  2. Click [Record Exception].
  3. Fill: type, qty, resolution.
  4. Submit. (< 20 seconds)
```

## 5. Rework Triggering

```
Dept-2 rework (most common):

  Type A (single): [Rework] on failed node.
  Type B (rewash): [Segment Rework] -> select range.
  Type C (dept restart): [Dept Rework] -> auto-range.

Verify rework scope before confirming.
Process new nodes in order.
```

## 6. Weekly Review

```
Every Friday:
  Count: orders created, completed, cancelled.
  Count: exceptions, reworks by type.
  Check: route consistency for common specs.
  Record: any issues, confusion, suggestions.
  Do NOT modify system during trial.
```

## 7. Trial End Decision

```
After 2-4 weeks:

  GO to Phase 4 if:
    20+ orders, 80%+ route consistency, < 5% cancellation,
    5+ segment reworks, supervisor confirms usable,
    zero schema drift, zero critical bugs.

  NO-GO if:
    < 10 orders, > 15% cancellation,
    supervisor finds system frustrating.
```
