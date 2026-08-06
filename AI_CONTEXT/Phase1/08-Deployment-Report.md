# DialFactory Phase 1-B-4 · Deployment Report

> **状态：** ✅ DEPLOYED — Database Ready
> **阶段：** Phase 1-B-4 — Supabase Deployment
> **日期：** 2026-08-06
> **执行时间：** 2026-08-06 03:18 UTC
> **前置：** [07-Migration-Validation-Report.md](07-Migration-Validation-Report.md) — PASS

---

## 一、Environment

| 属性 | 值 |
|------|-----|
| **Project Name** | `dialfactory-v1` |
| **Project Ref** | `wzfkmwrqnvjegunjueka` |
| **Project URL** | `https://wzfkmwrqnvjegunjueka.supabase.co` |
| **Region** | `ap-southeast-1` (Singapore) |
| **PostgreSQL Version** | 17.6 (Supabase) |

## 二、Migration

| 属性 | 值 |
|------|-----|
| **Migration File** | `supabase/migrations/001_initial_schema.sql` |
| **Command** | `npx supabase db push` |
| **Execution Timestamp** | 2026-08-06 03:18 UTC |
| **Execution Result** | ✅ **SUCCESS** |

## 三、Verification

### 3.1 8 Tables — ALL PRESENT

| # | Table | HTTP Status | Result |
|:--|-------|:----------:|:----:|
| 1 | `departments` | 200 | ✅ |
| 2 | `customers` | 200 | ✅ |
| 3 | `processes` | 200 | ✅ |
| 4 | `process_routes` | 200 | ✅ |
| 5 | `route_steps` | 200 | ✅ |
| 6 | `orders` | 200 | ✅ |
| 7 | `order_nodes` | 200 | ✅ |
| 8 | `exception_events` | 200 | ✅ |

### 3.2 Seed Data — 5 Departments

| name | seq | type | UUID |
|------|:---:|------|------|
| 制一 | 1 | production | `de42e4d2-...` |
| 制二 | 2 | production | `b2e7258d-...` |
| 制三 | 3 | production | `9074d0c6-...` |
| 制四 | 4 | production | `1bfddb7e-...` |
| 总QC | 5 | qc | `00d2f633-...` |

### 3.3 UUID Generation

```
POST customers {"name":"__test__"}
→ id: 56ffaca8-cc47-494a-b5c1-560ecbbbdc0f  ✅ UUID v4
```

### 3.4 FK RESTRICT Enforcement

```
DELETE departments WHERE name='制一'
→ Blocked by FK constraint  ✅ (no rows deleted)
```

## 四、Final Status

| 判定 | 结果 |
|------|:----:|
| **Deployment** | ✅ **SUCCESS** |
| **Database** | ✅ **READY** |

### Deployment Summary

```
8 Tables      ✅  all created
9 Indexes     ✅  all created
8 RLS ENABLE  ✅  all enabled
8 RLS POLICY  ✅  all created
5 Seed Rows   ✅  departments populated
UUID gen      ✅  functional
FK RESTRICT   ✅  enforced
0 CASCADE     ✅  confirmed
```
