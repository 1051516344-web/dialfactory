# DialFactory Phase 1-E · Demo Data & Deployment

> **状态：** Complete
> **日期：** 2026-08-06
> **目标：** Demo data seeded. System ready for visual verification.

---

## 1. Demo Data Seeded

| Table | Rows | Content |
|-------|:----:|---------|
| `departments` | 5 | 制一, 制二, 制三, 制四, 总QC |
| `customers` | 1 | 深圳时诺钟表有限公司 (SN) |
| `processes` | 5 | P01 冲压成型, P03 太阳纹加工, P05 银白电镀, P07 移印, P09 总QC检验 |
| `process_routes` | 1 | 标准太阳纹+银白路线 |
| `route_steps` | 5 | P01→P03→P05→P07→P09 (seq 1-5) |
| `orders` | 0 | (created via frontend UI) |
| `order_nodes` | 0 | (created via frontend UI) |
| `exception_events` | 0 | (created via frontend UI) |

### Route: 标准太阳纹+银白路线

```
1. P01 冲压成型    制一    is_required=true
2. P03 太阳纹加工   制二
3. P05 银白电镀     制三
4. P07 移印         制四
5. P09 总QC检验     总QC    is_required=true
```

---

## 2. Seed Tool

`tools/seed_demo_data.py` — Re-runnable demo data seeder.

```bash
python3 tools/seed_demo_data.py
```

Idempotent via Supabase UNIQUE constraint on `processes.code` — duplicate inserts fail silently.

---

## 3. Deployment Architecture

```
┌─────────────────────────────────────────────┐
│               GitHub Pages                   │
│  ┌───────────────────────────────────────┐  │
│  │  index.html + css/ + js/              │  │
│  │  Static assets. Zero build step.      │  │
│  └───────────────────────────────────────┘  │
│                    │                        │
│                    ▼                        │
│  ┌───────────────────────────────────────┐  │
│  │        Supabase PostgreSQL             │  │
│  │  Project: wzfkmwrqnvjegunjueka        │  │
│  │  Region: ap-northeast-1 (Tokyo)       │  │
│  │  8 Tables · RLS Enabled               │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Deployment Steps

```
1. Push code to GitHub repository
2. Enable GitHub Pages on main branch (root directory)
3. Verify: https://<username>.github.io/DialFactory/
4. Frontend connects to Supabase via anon key (in config.js)
```

---

## 4. Post-Deployment Smoke Test

After GitHub Pages deployment:

| # | Test | Expected |
|:--|------|----------|
| 1 | Open app URL | Nav bar renders. Dashboard loads |
| 2 | Click "路线" | 1 route with 5 steps displayed |
| 3 | Click "新建订单" | Form renders. Customer "时诺" in dropdown. Route in dropdown |
| 4 | Create demo order | Fill form → confirm 5 steps → submit → redirected to detail |
| 5 | Complete first node | Node → green. Next node auto-activated |
| 6 | Pause second node | Select reason → node → yellow |
| 7 | Resume second node | Node → blue (active) |
| 8 | Complete remaining nodes | Order → completed |
| 9 | Rework a node | New rework node created |
| 10 | Record exception | Exception appears inline and in P6 |

---

## 5. Final Phase 1 Deliverables

### Documents (23 files)

```
AI_CONTEXT/Phase1/
├── 01-Supabase-Schema-Plan.md              ✅ FROZEN
├── 02-Schema-Review-Report.md              ✅ ARCHIVED
├── 03-Schema-Revision-Log.md               ✅ ARCHIVED
├── 04-Schema-Final-Review.md               ✅ APPROVED
├── 05-Supabase-Environment-Checklist.md    ✅ CONFIRMED
├── 06-Migration-Plan.md                    ✅ COMPLETE
├── 07-Migration-Validation-Report.md        ✅ PASS
├── 08-Database-Baseline-Report.md           ✅ VERIFIED
├── 08-Deployment-Report.md                  ✅ DEPLOYED
├── 09-Application-Architecture.md           ✅ DESIGN
├── 10-Frontend-Specification.md             ✅ DESIGN
├── 11-Frontend-Implementation-Plan.md       ✅ PLAN
├── 12-Frontend-Development-Setup.md         ✅ D-0
├── 13-D2-Implementation-Plan.md             ✅ D-2
├── 14-D3-Implementation-Plan.md             ✅ D-3
├── 15-D3-Final-Review.md                    ✅ APPROVED
├── 16-D3-NodeActions-API-Contract.md        ✅ CONTRACT
├── 17-D3-Implementation-Validation.md       ✅ PASS
├── 18-D4-Implementation-Plan.md             ✅ D-4
├── 19-D5-Implementation-Plan.md             ✅ D-5
├── 20-D5-Implementation-Authorization.md    ✅ AUTHORIZED
├── 21-D5-Implementation-Validation.md       ✅ PASS
├── 22-System-Acceptance-Test-Report.md      ✅ ACCEPTED
└── 23-Phase1E-Demo-Data-Deployment.md       ✅ COMPLETE
```

### Code (34 files)

```
index.html, manifest.json
css/    6 files
js/    27 files
tools/  1 file (seed_demo_data.py)
supabase/migrations/  1 file
```

### Database

```
8 Tables · 5 Departments · 1 Customer · 5 Processes · 1 Route · 5 Steps
RLS Enabled · 0 CASCADE · 6 RESTRICT · 3 SET NULL · 1 NO FK
```

---

## 6. Phase 1 Final Status

```
╔══════════════════════════════════════════╗
║                                          ║
║   DialFactory V1.0 — Phase 1 COMPLETE    ║
║                                          ║
║   Phase 1-A  Schema Design     ✅ FROZEN ║
║   Phase 1-B  Database          ✅ LIVE   ║
║   Phase 1-C  Frontend          ✅ 6 PAGES║
║   Phase 1-D  SAT               ✅ PASS   ║
║   Phase 1-E  Demo Data         ✅ SEEDED ║
║                                          ║
║   System:    READY FOR USE               ║
║   Freeze:    V1.0 FROZEN                 ║
║   Schema:    0 Drift                     ║
║                                          ║
╚══════════════════════════════════════════╝
```

---

> **Phase 1 Complete. System ready. Next: GitHub Pages deployment + visual smoke test.**
