# DialFactory Phase 3 · Production Workflow Model Analysis

> **状态：** Analysis — Awaiting Review
> **触发：** 8 new factory facts about production workflow
> **影响：** Single-user → Multi-department collaborative model. Architecture-level change.

---

## 0. Factory Facts vs V1 Reality

| # | Fact | V1 Status | Gap |
|:--|------|-----------|:---:|
| F1 | Orders created by supervisor | Clerk creates | YELLOW |
| F2 | Supervisor enters process route | Route Builder planned | GREEN |
| F3 | Dept heads advance own dept nodes | ONE user advances ALL | **RED** |
| F4 | <10 users, full traceability | No user system | **RED** |
| F5 | Task flow, not active search | One user sees all | **RED** |
| F6 | Dept-2 rework is most frequent | Single-node rework OK | GREEN |
| F7 | Dept-2 rework: restart from first dept process | Only single-node rework | **RED** |
| F8 | Rework preserves full history | rework_pass correct | GREEN |


---

## 1. Node Model vs Department Responsibility

### Current
Single clerk advances ALL nodes. dept_id is display-only, not for access control.

### Factory Reality
Supervisor creates orders. Each department head advances only their department's nodes. Nodes FLOW from one department to the next.

### Compatibility
- Node has dept_id: COMPATIBLE
- Node has status: COMPATIBLE  
- One user sees everything: INCOMPATIBLE
- Active search by user: INCOMPATIBLE
- No user identity: INCOMPATIBLE

**Verdict: Node data model is compatible. View/permission model is not.**

---

## 2. Department Task Pool

Each department has a "task pool" — active nodes that belong to that department.

```
Dept-1 Pool: [Order#0088 P01 active]
Dept-2 Pool: [Order#0088 P15 active, Order#0090 P16 active]
Dept-3 Pool: [empty — waiting for Dept-2]
Dept-4 Pool: [Order#0085 P29 active]
QC Pool:    [Order#0083 P35 active]
```

### Flow Mechanism
```
Dept-1 finishes its last node
  -> System activates Dept-2's first waiting node
  -> Node appears in Dept-2's task pool
  -> Dept-2 head refreshes -> sees new task
```

This is "order flows to department", not "department searches for orders".

### V1 Dashboard already close
P1 Dashboard "dept queue" shows active count per dept. Needs enhancement:
- Click dept -> filtered list of that dept's active nodes
- Or: auto-filter by user's assigned dept after login

### Schema Impact: NONE
`order_nodes.dept_id + status='active'` is sufficient.

---

## 3. User Permission Model

### Current: No users
- Single anon key. RLS: USING(true). No operation attribution.

### Factory Needs
- <10 users. Each belongs to one department.
- Dept-1 person cannot advance Dept-2 nodes.
- Full traceability: who did what, when.

### Options

| Option | Complexity | Granularity | V1 Fit |
|--------|:----------:|:-----------:|:------:|
| A: Dept passwords | Very low | Dept-level | OK |
| B: Supabase Auth + dept mapping | Medium | User-level | BEST |
| C: Full RBAC | High | Operation-level | V2 only |

### Recommended: Option B (Phase 4)

```
New: users table (id, email, dept_id, role, created_at)
New: order_nodes.updated_by -> records operator
RLS: USING (dept_id = user.dept_id) for order_nodes
RLS: USING (true) for orders (all can view)
```

### Schema Impact: NEW TABLE + NEW COLUMNS
`users` table + `order_nodes.updated_by` + `orders.created_by`

---

## 4. Cross-Department Auto-Flow

### Current
advance() activates next node by seq — same API call. Works within single-user model.

### Department Model
Flow triggers when a department's ALL nodes are done:
- Check: current dept all nodes done?
- If yes: activate NEXT dept's first waiting node
- If no: stay within same dept (existing behavior)

### Activation Logic
```
1. Find all nodes for current dept
2. Check: all done?
3. YES -> find first waiting node in next dept -> activate
4. NO -> activate next seq in same dept (existing)
```

### Schema Impact: NONE
Application-layer logic change only.

---

## 5. Rework Model — Three Levels

### L1: Single Node (V1.0 EXISTS)
```
P16 plating failed -> redo P16 only -> rework_pass+1
```

### L2: Department Segment (NEW — Factory Need)
```
Scenario: P16 plating color mismatch
Not just redo P16 — restart from P12 (first Dept-2 process)

Dept-2 sequence: P12->P13->P15->P16->P17->P19->P20->QC
L1: redo P16 only
L2: redo P12 through QC (entire dept segment)

Implementation:
  Find dept's process range (from first dept process to failed node)
  Batch INSERT new nodes
  rework_pass = parent + 1 (all get same value)
  First new node = active, rest = waiting
  Seq: gap-based, inserted after failed node
```

### L3: Full Flow (NEW)
```
Entire batch scrapped -> redo from P01
Implementation: reuses L2 logic, range = all nodes.
```

### History Preservation (ALL LEVELS)
- Original nodes remain with status='done'
- New nodes have rework_pass+1
- Flow chart shows: original (green) + new (blue/orange)
- Full production trace preserved

### Schema Impact: NONE
`order_nodes` supports batch INSERT. `rework_pass` already exists.

---

## 6. Schema Changes — Full Assessment

### V1.0 -> V1.1 (Phase 3-B)

| # | Change | Type |
|:--|--------|:----:|
| 1 | orders.status + cancelled | ALTER CHECK |

### V1.1 -> Phase 4 (Multi-Department)

| # | Change | Type |
|:--|--------|:----:|
| 2 | CREATE TABLE users | NEW TABLE |
| 3 | order_nodes.updated_by | NEW COLUMN |
| 4 | orders.created_by | NEW COLUMN |
| 5 | RLS policies updated | POLICY UPDATE |

### Phase 4 Migration 003

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  dept_id UUID REFERENCES departments(id),
  role TEXT DEFAULT 'worker' CHECK (role IN ('admin','worker','viewer')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE order_nodes ADD COLUMN updated_by UUID REFERENCES users(id);
ALTER TABLE orders ADD COLUMN created_by UUID REFERENCES users(id);

-- RLS: department isolation
DROP POLICY "V1: full access" ON order_nodes;
CREATE POLICY "worker: dept nodes" ON order_nodes
  FOR ALL USING (dept_id = (SELECT dept_id FROM users WHERE id = auth.uid()));
```

---

## 7. V1.1 / Phase 4 / V2 Boundaries

```
V1.1 (Phase 3-B) — BLOCKING FIXES, factory trial
  Route Builder (3 modes)
  Undo (5min window)
  Cancelled orders
  Real data migration
  Users: SINGLE (anon key)
  Rework: L1 single-node only

Phase 4 — MULTI-DEPARTMENT
  User accounts (Supabase Auth)
  Department task pools
  Operation traceability (updated_by)
  Department segment rework (L2)
  RLS department isolation
  Users: <10, department-assigned

V2 — FULL SYSTEM
  Full flow rework (L3)
  Outsourcing management
  First-piece inspection
  Statistics & analytics
  Audit logs (audit_logs table)
  Full RBAC
  Users: multi-role
```

### Why V1.1 is single-user only

| Reason |
|--------|
| Goal: get factory to TRY the system first |
| One person (supervisor) can test all flows |
| Multi-dept needs user system = bigger schema change |
| Test routes and workflow first, THEN add users |
| V1.1 single-user trial validates: are routes correct? does status flow work? |

---

## 8. Recommendations

| # | Decision | Recommendation |
|:--|----------|:--------------|
| D1 | Multi-dept in V1.1? | **NO.** Single-user trial first |
| D2 | Segment rework? | Phase 4, with multi-dept |
| D3 | User system? | Phase 4, Supabase Auth |
| D4 | V1.1 schema changes? | Only Migration 002 (cancelled) |
| D5 | Phase 4 schema? | users table + updated_by + created_by + RLS |

---

> **Core conclusion: Node model compatible with department model. But V1.1 is single-user trial first. Multi-dept + segment rework in Phase 4.**
> **Schema: V1.0 = 0 changes. V1.1 = 1 ALTER. Phase 4 = 1 new table + 2 columns.**
