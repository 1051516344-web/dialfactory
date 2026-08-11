# Phase 3-D · Factory Trial Start Report

> **Date:** 2026-08-07
> **Status:** Trial Execution Phase — Development FROZEN
> **Predecessor:** [63-Drawing-Attachment-Smoke-Test.md](AI_CONTEXT/Phase3/63-Drawing-Attachment-Smoke-Test.md) (PASS)
> **Next:** Weekly reviews at Trial Day 7, 14, 21, 28

---

## 1. Baseline System State

### 1.1 Deployment

| Item | Value |
|------|-------|
| Supabase Project | `wzfkmwrqnvjegunjueka` (ap-northeast-1) |
| App Entry | `index.html` — vanilla SPA, hash router, IIFE modules |
| Authentication | None — V1 intranet, anon key `USING (true)` RLS |
| Storage | `drawings` bucket — private, 10 MiB, PDF/PNG/JPEG, RLS applied |

### 1.2 Database — 8 Tables, 59 Fields

| # | Table | Rows | Purpose |
|:--:|-------|:----:|---------|
| 1 | `departments` | 5 | 制一~总QC, pre-seeded |
| 2 | `customers` | 16 | All active, short_name populated |
| 3 | `processes` | 35 | Factory process catalog (P01~P21) |
| 4 | `process_routes` | 0 | Route templates (not used in trial) |
| 5 | `route_steps` | 0 | Template steps (not used) |
| 6 | `orders` | 1* | TEST-SMOKE-001 preserved as reference |
| 7 | `order_nodes` | 10* | 10-node rework state from smoke test |
| 8 | `exception_events` | 0 | No exceptions yet |

*\* TEST-SMOKE-001 preserved for trial reference. All other test orders cleaned up.*

### 1.3 FK Policy — Unchanged Since Phase 1

```
6 RESTRICT · 3 SET NULL · 1 NO FK · 0 CASCADE
```

### 1.4 Uncommitted Changes (Phase 3-D Field Adjustments)

| File | Change |
|------|--------|
| `js/config.js` | `SAND_TYPES` removed, `TEXTURE_SUGGESTIONS` added, `BASE_TEXTURES` removed |
| `js/pages/order-create.js` | sand_type dropdown → base_plate_color text + texture datalist + drawing file input |
| `js/domain/order-create.js` | `sand_type` → `specs: { base_plate_color }` |
| `js/pages/order-list.js` | specText includes `order.specs?.base_plate_color` |
| `js/pages/order-detail.js` | specText + drawing display section |
| `js/components/toast.js` | Added `warning()` method |
| `index.html` | Added `storage.js` to script chain |
| `js/data/storage.js` | **NEW** — Supabase Storage upload/signed URL wrapper |

### 1.5 Feature Inventory — What Is Live

| Feature | Status | Notes |
|---------|:------:|-------|
| Dashboard (P1) | ✅ | Order counts, dept breakdown, stalled alerts |
| Order List (P2) | ✅ | Filter by status/dept, search, pagination |
| Order Create (P3) | ✅ | 2-step wizard: info + manual route builder |
| Order Detail (P4) | ✅ | Flow view, node actions, exceptions, drawing display |
| Route List (P5) | ✅ | Read-only process reference by department |
| Exception List (P6) | ✅ | Filter by type, grouped by node |
| Node advance / pause / resume | ✅ | 4-state: waiting→active→done / paused |
| Rework: Type A (single node) | ✅ | Gap-seq insertion, auto-activation |
| Rework: Type B (segment) | ✅ | Rewash target dept segment |
| Rework: Type C (full dept) | ✅ | Deactivate current, restart target dept |
| Undo (5-min window) | ✅ | Hard delete node, seq cleanup |
| Order cancel | ✅ | Set all nodes to done, order→cancelled |
| Trial cleanup | ✅ | Delete orders + nodes + exceptions |
| Trial recording log | ✅ | CSV with UTF-8 BOM for Excel |
| Drawing attachment | ✅ | Upload at creation, signed URL display |
| Customer short_name | ✅ | All 16 populated, displayName() helper |

### 1.6 Feature Inventory — What Is NOT Live (by Design)

| Feature | Reason |
|---------|--------|
| Route templates | Trial uses manual Route Builder only |
| User authentication | V1 intranet — all users share anon key |
| Node re-ordering | No drag-drop. Seq fixed after creation. |
| Bulk operations | One order at a time |
| Statistics dashboard | Weekly review done manually via SQL |
| Email / notification | No alerting system |
| Mobile app | Desktop/tablet only |
| Multi-file drawings | Single file per order |
| Drawing replacement | Upsert disabled — one drawing per order lifetime |

---

## 2. Trial Users

### 2.1 Primary User

| Role | Responsibility |
|------|---------------|
| **跟单员 (Supervisor)** | Create orders, build routes, advance nodes, record exceptions, manage rework |

The supervisor is the sole V1 user. No department-level logins. No worker-level interaction. One person tracks production across all 5 departments.

### 2.2 Secondary Observer

| Role | Responsibility |
|------|---------------|
| **Factory Owner / Manager** | Weekly review of trial data, decision-making for Phase 4 scope |

### 2.3 System Observer

| Role | Responsibility |
|------|---------------|
| **Claude (this session)** | Weekly review participation. Analyze recorded data. Recommend Phase 4 scope. Do NOT modify code. |

---

## 3. Trial Rules

### 3.1 Development Freeze

```
Effective immediately. No new features. No schema changes. No workflow redesign.

Allowed exceptions (require explicit authorization):
  - Bug fixes that block trial execution
  - SQL queries for weekly review analysis (read-only)
  - Trial recording log updates (add observation columns)
```

### 3.2 Order Creation Rules

1. **Manual route building only.** Supervisor selects processes from checklist. No route templates.
2. **Order number format:** Free text. Suggest `{CUST-CODE}-{YYYY}-{NNNN}` but do not enforce.
3. **Spec fields are free text.** base_texture uses datalist suggestions but accepts any value.
4. **Drawing is optional.** Attach at creation only. Cannot add later. Cannot replace.
5. **Customer selection from dropdown.** All 16 customers have short_name for display.

### 3.3 Production Tracking Rules

1. **Advance nodes in sequence.** System auto-activates next node, auto-handles dept handoff.
2. **Pause with reason.** Select from predefined pause reasons. Resume when resolved.
3. **Rework uses the 3-type model.** Type A (single node), Type B (segment), Type C (full dept).
4. **Record exceptions at node level.** Type + quantity + resolution. Exceptions preserved even if node deleted.
5. **Undo within 5 minutes.** System-enforced window. After 5 min, use rework instead.

### 3.4 Data Rules

1. **Never delete real orders.** Trial cleanup button is for test data only.
2. **All route variations are data.** No "wrong" route — just record what happened.
3. **Wrong inputs are data.** If supervisor enters wrong value and corrects, record both in observation log.
4. **Missing information is data.** If a field is often empty or "—", that's a finding for Phase 4.

---

## 4. Observation Items

### 4.1 Route Variations (Critical for Phase 4)

Record every unique route built by the supervisor.

```
Observation format:
  Route: [工序列表, 逗号分隔]
  订单数: N
  首次出现: YYYY-MM-DD
  是否常规: 是 / 否

Example:
  Route: P01冲压, P02车边, P03磨板, P05电镀, P06移印, P10QC
  订单数: 5
  首次出现: 2026-08-07
  是否常规: 是
```

**Purpose:** After 2-4 weeks, analyze which routes repeat. If ≥3 orders share the same route → candidate for route template in V1.1.

### 4.2 Specification Field Usage

Monitor how the 4 spec fields are used:

| Field | What to Watch |
|-------|---------------|
| `base_texture` | What custom values are entered (beyond the 3 suggestions)? |
| `plate_color` | What formats/patterns emerge? Is "60s" suffix common? |
| `base_plate_color` | How often is this filled? What values appear? |
| `note` | Is spec info leaking into notes? (indicates missing spec field) |

### 4.3 Wrong Input Cases

```
Observation format:
  日期:
  订单号:
  错误类型: [规格写错 / 工序选错 / 数量修改 / 客户选错 / 其他]
  错误内容:
  发现方式: [跟单员自己发现 / 后续工序发现 / 客户反馈]
  修正方式: [重建订单 / 备注说明 / 未修正]
```

### 4.4 Rework Events

```
Observation format:
  日期:
  订单号:
  返工类型: [A单节点 / B段返工 / C部门重启]
  触发工序:
  返工节点数/段:
  原因:
  是否与客户有关:
```

### 4.5 Missing Information

```
Observation format:
  日期:
  订单号:
  缺失内容: [规格字段不够用 / 工序不在目录 / 客户信息缺失 / 其他]
  临时处理方式:
  是否影响生产:
```

### 4.6 User Behavior

| Behavior | What to Record |
|----------|---------------|
| Navigation patterns | Which pages are visited most? Any confusing flows? |
| Error corrections | How often is Undo used? How often are orders recreated? |
| Search habits | Search by order_no? By customer? By date? |
| Filter usage | Which status/dept filters are used most? |
| Abandoned actions | Start create but cancel? Start rework but don't complete? |

---

## 5. Weekly Review Structure

### 5.1 Schedule

| Review | Trial Day | Focus |
|:------:|:---------:|-------|
| **Week 1** | Day 7 | Onboarding issues. Basic workflow smoothness. |
| **Week 2** | Day 14 | Route patterns emerging. Spec field usage. |
| **Week 3** | Day 21 | Rework frequency. Exception types. Search/filter patterns. |
| **Week 4** | Day 28 | Final review. Phase 4 recommendations. |

### 5.2 Weekly Review Template

```markdown
## Week N Review — YYYY-MM-DD

### Metrics
| Metric | Value |
|--------|-------|
| Total orders created | |
| Orders in production | |
| Orders completed | |
| Total nodes executed | |
| Avg nodes per order | |
| Rework events (A/B/C) | / / |
| Exception events | |
| Unique routes used | |
| Drawing attachments | |

### New Route Patterns
[Routes that appeared ≥2 times this week]

### Spec Field Observations
[Custom base_texture values, plate_color patterns, etc.]

### Issues Encountered
[Any workflow friction, missing features, wrong inputs]

### Phase 4 Signals
[Evidence for/against Phase 4 features]

### Decision Items
[Questions for factory owner/manager]
```

### 5.3 SQL Queries for Weekly Review

```sql
-- Orders created this week
SELECT order_no, customer_id, order_qty, base_texture, plate_color,
       specs, status, created_at
FROM orders
WHERE created_at >= '2026-08-07'
ORDER BY created_at DESC;

-- Route snapshot analysis
SELECT order_no, route_snapshot->'steps' as steps, created_at
FROM orders
WHERE created_at >= '2026-08-07';

-- Rework nodes (rework_pass > 0)
SELECT onode.order_id, o.order_no, onode.process_name, onode.rework_pass, onode.seq
FROM order_nodes onode
JOIN orders o ON o.id = onode.order_id
WHERE onode.rework_pass > 0 AND o.created_at >= '2026-08-07'
ORDER BY o.created_at DESC;

-- Exception events this week
SELECT e.type, e.qty, e.resolution, e.created_at, onode.process_name, o.order_no
FROM exception_events e
JOIN order_nodes onode ON onode.id = e.node_id
JOIN orders o ON o.id = onode.order_id
WHERE e.created_at >= '2026-08-07'
ORDER BY e.created_at DESC;

-- Spec field distribution
SELECT base_texture, COUNT(*) as n FROM orders
WHERE created_at >= '2026-08-07' AND base_texture IS NOT NULL
GROUP BY base_texture ORDER BY n DESC;

-- Custom textures (not in suggestion list)
SELECT order_no, base_texture FROM orders
WHERE created_at >= '2026-08-07'
  AND base_texture NOT IN ('无底纹', '太阳纹', '直线纹')
  AND base_texture IS NOT NULL;

-- Stalled nodes (>3 days)
SELECT o.order_no, onode.process_name, onode.dept_name, onode.updated_at,
       EXTRACT(DAY FROM now() - onode.updated_at) AS days_stalled
FROM order_nodes onode
JOIN orders o ON o.id = onode.order_id
WHERE onode.status = 'active'
  AND onode.updated_at < now() - INTERVAL '3 days'
ORDER BY onode.updated_at;
```

---

## 6. Trial Success Criteria

From [39-Trial-Preparation-and-Success-Criteria.md](AI_CONTEXT/Phase3/39-Trial-Preparation-and-Success-Criteria.md):

| # | Criterion | Threshold |
|:--:|-----------|:---------:|
| S1 | Orders created | ≥ 10 real orders in 2 weeks |
| S2 | Route completion | ≥ 50% of orders reach completed |
| S3 | Rework recorded | ≥ 3 rework events of any type |
| S4 | Exception recorded | ≥ 5 exception events |
| S5 | Supervisor autonomy | Creates orders without assistance by Week 2 |
| S6 | Data quality | ≥ 80% of spec fields filled (non-null, non-empty) |
| S7 | No data loss | 0 lost orders, 0 corrupted nodes |

### Go/No-Go for Phase 4

| Decision | Condition |
|----------|-----------|
| ✅ **Go** | ≥ 5 of 7 criteria met. Sufficient evidence for Phase 4 scope decisions. |
| ⚠️ **Extend** | 3-4 criteria met. Extend trial 2 more weeks. |
| ❌ **Rethink** | ≤ 2 criteria met. Fundamental workflow mismatch. Re-evaluate approach. |

---

## 7. Related Documents

| Document | Content |
|----------|---------|
| [53-Phase3D-Factory-Trial-Execution.md](AI_CONTEXT/Phase3/53-Phase3D-Factory-Trial-Execution.md) | Daily workflow, 22 metrics, decision framework |
| [55-Phase3D-Trial-Observation-Framework.md](AI_CONTEXT/Phase3/55-Phase3D-Trial-Observation-Framework.md) | 5 observation categories, structured templates |
| [56-Phase3D-Trial-Recording-Log.md](AI_CONTEXT/Phase3/56-Phase3D-Trial-Recording-Log.md) | Simplified recording log (Chinese) |
| [tools/试运行记录表-Trial-Log.csv](tools/试运行记录表-Trial-Log.csv) | Printable CSV for Excel |
| [59-Order-Specification-Audit.md](AI_CONTEXT/Phase3/59-Order-Specification-Audit.md) | All 14 order fields classified A/B/C |
| [63-Drawing-Attachment-Smoke-Test.md](AI_CONTEXT/Phase3/63-Drawing-Attachment-Smoke-Test.md) | Drawing upload validated PASS |

---

> **Development is frozen. Trial begins. First weekly review: 2026-08-14.**
