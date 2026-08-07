# DialFactory Phase 3-B · Factory Reassessment

> **Status:** Strategic Architecture Review
> **Trigger:** Factory reality overturns V1 core assumptions
> **Finding:** Routes are not templates. Departments are operation boundaries. Rework is segment-level.

---

## 0. What Changed

| V1 Assumption | Factory Reality | Impact |
|--------------|-----------------|:------:|
| Routes are standard templates (3-5) | Supervisor customizes route per order | CORE |
| One clerk advances all nodes | Dept heads advance own dept only | CORE |
| Rework is single-node | Rework is department-segment | CORE |
| 1-2 users | <10 users | MEDIUM |
| No traceability needed | Operation traceability required | MEDIUM |

**3 of 5 core assumptions overturned. But the data model skeleton does NOT need rebuilding.**

---

## 1. Revised Production Data Model

### 1.1 Entity Relationship

```
Supervisor
    |
    v
Order ---- Order Route Snapshot (JSONB, the REAL route)
    |          |
    |          +-- source: "manual" | "template" | "history"
    |          +-- steps[{process, dept, seq, confirmed}]
    |
    v
Order Nodes -- grouped by -- Department Segments
    |                            |
    | seq: 10,20,30...           | Dept-1: P01..P06
    | status: waiting/active     | Dept-2: P12..P25
    |         /done/paused       | Dept-3: P26..P27
    | rework_pass                | Dept-4: P28..P34
    | dept_id                    | QC:     P35
    |                            |
    v                            v
Rework Segments            Department Queues
  L1: single node            Dept-1 queue: [active nodes]
  L2: dept segment           Dept-2 queue: [active nodes]
  L3: full flow              ...
```

### 1.2 Order Route Snapshot (The Prescription)

```
route_snapshot = {
  source: "manual" | "template" | "history",
  snapshot_at: "ISO timestamp",
  created_by: "supervisor",
  steps: [
    {seq, process_code, process_name, dept_id, dept_name, is_required, confirmed},
    ...
  ]
}
```

Supervisor writes the prescription. Departments execute it.

### 1.3 Department Segment

A segment is all nodes with the same dept_id, ordered by seq. This is DERIVED at application layer -- no schema change needed.

```
Order#0088 segments:
  Dept-1: seq 10-60   (6 nodes)
  Dept-2: seq 70-220  (14 nodes)
  Dept-3: seq 230-240 (2 nodes)
  Dept-4: seq 250-310 (7 nodes)
  QC:     seq 320     (1 node)
```

### 1.4 Department Queue

Each department sees only its active nodes:

```
Dept-2 Queue:
  Order#0088 P16 Plating (active, rework_pass=1)
  Order#0091 P15 Brushing (active)
```

Data source: `SELECT * FROM order_nodes WHERE dept_id=X AND status='active'`

No new table needed. It is a query/view.

### 1.5 Three-Level Rework

| Level | Scope | Trigger | Implementation |
|:-----:|-------|---------|---------------|
| L1 | Single node | One process fails | INSERT 1 node, rework_pass+1 |
| L2 | Dept segment | Dept-2 plating fails -> restart from P12 | Batch INSERT all dept nodes |
| L3 | Full flow | Entire batch scrapped | Batch INSERT all order nodes |

L2 is the factory's actual need. L1 exists in V1.0. L3 is rare.

---

## 2. Architecture Evolution Assessment

| Requirement | V1 Supports? | What's Needed | Layer |
|------------|:-----------:|---------------|:-----:|
| Supervisor custom route | YES (route_snapshot) | Route Builder (3 modes) | App |
| Dept task pool | YES (dept_id+status) | Dept-filtered view | App |
| Dept-to-dept flow | YES (seq+dept_id) | Cross-segment activation | App |
| <10 users | NO | users table + Supabase Auth | Schema |
| Traceability | NO | updated_by column | Schema |
| Segment rework (L2) | YES (batch INSERT) | reworkSegment() method | App |
| History route learning | YES (route_snapshot) | Analyze accumulated snapshots | App |
| RLS dept isolation | NO (USING true) | Dept policy replacement | RLS |

**Verdict: V1 architecture CAN evolve. No redesign needed.**

---

## 3. Schema Change Inventory

### Phase 3-B (V1.1)

| # | Change | Type |
|:--|--------|:----:|
| S1 | orders.status + cancelled | ALTER CHECK |

### Phase 4 (Multi-Department)

| # | Change | Type |
|:--|--------|:----:|
| S2 | CREATE TABLE users | NEW TABLE |
| S3 | order_nodes.updated_by | NEW COLUMN |
| S4 | orders.created_by | NEW COLUMN |
| S5 | RLS policy update | POLICY UPDATE |

### Phase 5 (V2)

| # | Change | Type |
|:--|--------|:----:|
| S6 | CREATE TABLE audit_logs | NEW TABLE |
| S7 | suppliers, handoffs (already designed) | NEW TABLES |

### Freeze Impact

```
V1.0 Freeze: 8 tables, 58 fields, 0 CASCADE
V1.1:       +1 CHECK (no structural change)
Phase 4:    +1 table, +2 columns (Freeze update -> V1.2)
V2:         +2 tables (Freeze update -> V2.0)
```

---

## 4. Revised Phase Roadmap

```
BEFORE:
  Phase 3-B: Route Builder + Undo + Cancel
  V1.5: Route Editor + Dept linkage
  V2: Outsourcing + First piece + Stats

AFTER:
  Phase 3-B: V1.1 MINIMUM VIABLE
    Route Builder (3 modes: manual / template / history)
    Undo (5min window)
    Cancelled orders
    Real data: 16 customers + 35 processes
    SINGLE USER (supervisor trial only)

  Phase 3-C: FACTORY TRIAL (2-4 weeks)
    Supervisor creates 10-20 real orders
    Validates route accuracy, status flow, usability
    NO code changes -- observe and collect feedback

  Phase 4: MULTI-DEPARTMENT (V1.5)
    User accounts (Supabase Auth)
    Department task pools
    Segment rework (L2)
    Operation traceability (updated_by)
    RLS department isolation
    Route Editor page

  Phase 5: FULL SYSTEM (V2)
    Full flow rework (L3)
    Outsourcing management
    First piece inspection
    Statistics and analytics
    Audit logs
    Historical route learning
```

---

## 5. Should We Continue or Redesign?

```
RECOMMENDATION: CONTINUE with Phase 3-B (V1.1).

Reasons:
  1. V1 data model is compatible with new requirements
  2. V1.1 Route Builder is exactly what factory needs now
  3. Single-user trial validates core flow before multi-dept investment
  4. Schema changes are incremental, not destructive
  5. 6 pages + 28 JS modules are a maintainable foundation

Risk:
  - Multi-dept model may reveal new needs during trial
  - Segment rework logic needs real data validation
  - User feedback may change Phase 4 priorities

Mitigation:
  - Phase 3-C is observation-only, no development
  - Collect all feedback before planning Phase 4 details
  - Freeze mechanism ensures controlled changes
```

### Immediate Next Step

```
1. APPROVE this reassessment
2. Execute Phase 3-B: V1.1 development
3. Deploy V1.1
4. Hand to supervisor for trial (Phase 3-C)
5. Collect feedback -> Plan Phase 4
```

---

> **V1 architecture CAN evolve. No redesign needed. Continue Phase 3-B. Plan Phase 4 after trial.**
