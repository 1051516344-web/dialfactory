# Phase 3-C-0 · Runtime & Trial Data Audit

> **Status:** Audit Complete — 7 Issues Found
> **Constraint:** No fixes yet. Report only.

---

## Audit A — Frontend Runtime

### A1: Script Loading
```
Route registration: 6/6 registered (/, /orders, /orders/new, /orders/:id, /routes, /exceptions)
Script load order: Correct (20+ scripts chained via loadNext)
CONFIG object: Available
```

### A2: Console Errors
| Error | Location | Root Cause | Severity |
|-------|----------|-----------|:--------:|
| `routes.map is not a function` | order-create.js old line 55 | Browser cache serving old JS | LOW |

**Note:** Code is fixed in commit 2363ace. User's browser caching old version. Clear cache resolves.

### A3: Button Binding
```
"New Order" button:  <a href="#/orders/new" class="btn btn-primary">+ 新建订单</a>
Router handler:      Router.on('/orders/new', async () => { await OrderCreatePage.render(); })
Verdict:             Correct. Cache issue causing stale JS.
```

---

## Audit B — Database Trial Baseline

### B1: Current State vs Expected

| Table | Current | Expected | Status |
|-------|:------:|:------:|:------:|
| departments | **5** | 5 | ✅ |
| customers | **1** (SN demo) | 16 real | 🔴 FAIL |
| processes | **5** (P01/P03/P05/P07/P09) | 35 real (P01-P35) | 🔴 FAIL |
| process_routes | **1** (demo route) | 0 | 🔴 FAIL |
| route_steps | **5** (demo steps) | 0 | 🔴 FAIL |
| orders | 0 | 0 | ✅ |
| order_nodes | 0 | 0 | ✅ |
| exception_events | 0 | 0 | ✅ |

### B2: Demo Data Details

```
customers:   "深圳时诺钟表有限公司 (SN)" — FICTIONAL, NOT in real factory list
processes:   P01 冲压成型, P03 太阳纹加工, P05 银白电镀, P07 移印, P09 总QC检验
             — These are V1 DEMO NAMES, not factory terminology
             — P16 电镀 is MISSING (should be in 制二, not 制三)
             — Only 5 of 35 processes present
route:       "标准太阳纹+银白路线" — DEMO ROUTE, not factory-validated
```

### B3: Root Cause

Phase 1-E demo seeding was never replaced with real factory data.
The seed script (tools/seed_demo_data.py) inserted 5 demo processes and 1 demo customer.
Real factory data (16 customers, 35 processes) was designed in Phase 3-A but never applied.

---

## Audit C — Residual Demo Logic

### C1: Frontend References to Demo Concepts

| File | Line | Content | Severity |
|------|:----:|---------|:--------:|
| `js/pages/route-list.js` | 85-86 | `step.is_required` + "必修" badge | MEDIUM |
| `js/data/processes.js` | 32 | `process:processes!inner(code, name, type, is_required)` | LOW |
| `js/data/processes.js` | 61 | `is_required: s.process.is_required` | LOW |
| `js/data/processes.js` | 81 | `code, name, type, is_required` | LOW |
| `js/data/processes.js` | 103 | `is_required: s.process.is_required` | LOW |
| `js/data/processes.js` | 116 | `.select('id, code, name, type, is_required, is_active')` | LOW |

### C2: Analysis

```
route-list.js: Still renders "必修" badge based on is_required field.
  Impact: Supervisor sees "必修" label on P01/P09 but the concept was removed.
  Fix: Remove is_required rendering from route-list.js. Show all processes equally.

processes.js API: Still fetches is_required field from DB.
  Impact: No functional issue (column exists). But misleading.
  Fix: Remove is_required from SELECT statements. Column stays in DB.
```

### C3: Database Demo Artifacts

```
customer "时诺(SN)":    DELETE before trial
processes P01-P09 demo: DELETE before trial (names are wrong anyway)
route "标准太阳纹":       DELETE before trial
route_steps (5 rows):    DELETE before trial
```

---

## Audit D — Time Tracking Model

### D1: Current order_nodes Time Columns

| Column | Type | Populated When | Available |
|--------|------|---------------|:--------:|
| `created_at` | TIMESTAMPTZ | Node created (auto) | ✅ |
| `updated_at` | TIMESTAMPTZ | Last status change (app updates) | ✅ |
| started_at | — | NOT EXISTS | ❌ |
| completed_at | — | NOT EXISTS | ❌ |

### D2: What Can Be Calculated (No Schema Change)

```
Stalled time:
  For active nodes: now() - updated_at
  "P16 电镀 active for 5 days" → CALCULABLE ✅

Creation-to-completion:
  For done nodes: updated_at - created_at
  APPROXIMATE only (updated_at changes on every status change, not just completion)
  "P01 took about 2 days" → APPROXIMATE ⚠️

Duration between status changes:
  NOT possible without history
  "How long was P01 in 'active' before 'done'?" → NOT CALCULABLE ❌

Process start time:
  NOT possible. No started_at column.
  Use created_at as proxy (when node was generated, not when work started).
```

### D3: Visibility Assessment

```
Current model can answer:
  ✅ "Where is the order?" (current active node)
  ✅ "How long has it been stuck?" (now - updated_at for active nodes)
  ⚠️ "How long did each process take?" (approximate only, no started_at)
  ❌ "When did P01 actually start?" (no started_at)
  ❌ "What's the average time for P16?" (no accurate duration data)

For factory trial: APPROXIMATE is sufficient. Supervisor cares about "stuck" more than "duration."
For Phase 4: Consider adding started_at/ended_at to order_nodes.
```

---

## 5. Issue Summary

| # | Issue | Audit | Severity | Fix Order |
|:--|-------|:-----:|:--------:|:---------:|
| I-1 | Browser cache serving old JS | A | LOW | Clear cache |
| I-2 | Demo customer still in DB | B | **HIGH** | 1st |
| I-3 | Demo processes (5 of 35) | B | **HIGH** | 1st |
| I-4 | Demo route + steps still in DB | B | **HIGH** | 1st |
| I-5 | route-list.js shows "必修" badge | C | MEDIUM | 2nd |
| I-6 | processes.js still fetches is_required | C | LOW | 3rd |
| I-7 | No started_at/completed_at for time tracking | D | LOW | Phase 4 |

## 6. Recommended Fix Order

```
1. DATABASE: Replace demo data with real factory data
   - DELETE demo customer (SN)
   - DELETE demo processes (P01/P03/P05/P07/P09)
   - DELETE demo route + route_steps
   - INSERT 16 real customers
   - INSERT 35 real processes (P01-P35, factory names, correct dept_ids)

2. FRONTEND: Remove residual is_required UI
   - route-list.js: remove "必修" badge rendering
   - processes.js: remove is_required from SELECT (optional, low priority)

3. BROWSER: User clears cache (Ctrl+Shift+R)
```

## 7. Freeze Compliance

```
All fixes are DATA-ONLY or FRONTEND-ONLY.
No schema changes. No migration. No FK changes.
```

---

> **7 issues found. 4 HIGH (data), 2 MEDIUM/LOW (frontend), 1 LOW (cache). Fix order: Database → Frontend → Browser.**
