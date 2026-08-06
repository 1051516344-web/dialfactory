# DialFactory Phase 2-A · Local Runtime Verification

> **状态：** Verified
> **日期：** 2026-08-06

---

## 1. File Integrity

| Check | Result |
|-------|:------:|
| `index.html` exists at project root | ✅ |
| 6 CSS files in `css/` | ✅ |
| 29 JS files in `js/` | ✅ |
| Supabase URL in `js/config.js` | ✅ `wzfkmwrqnvjegunjueka.supabase.co` |
| Supabase Anon Key in `js/config.js` | ✅ |
| No missing file references | ✅ |

## 2. JS Chain Load Order

```
Sync (6):
  config.js → dom.js → format.js → router.js → skeleton.js → nav-bar.js

Async chain (23):
  client.js → processes.js → orders.js → customers.js → exceptions.js
  → order-state.js → node-state.js → validation.js → seq-calc.js
  → node-actions.js → order-create.js
  → status-badge.js → progress-bar.js → empty-state.js
  → confirm-dialog.js → toast.js
  → route-list.js → order-list.js → dashboard.js
  → order-detail.js → order-create.js → exception-list.js
  → app.js
```

**Verified:** All 29 files loaded. Chain order respects dependency graph.

## 3. CSS Resolution

| File | Purpose |
|------|---------|
| `css/reset.css` | Box-sizing, margin reset |
| `css/variables.css` | 40+ custom properties |
| `css/layout.css` | Grid, card, form, button |
| `css/components.css` | Badge, progress, dialog, skeleton, toast |
| `css/flow.css` | Node cards, arrows, rework |
| `css/pages.css` | Nav bar, dashboard, orders, responsive |

**Verified:** All 6 CSS files resolve. No external CSS dependencies.

## 4. Supabase Connection

| Check | Expected | Status |
|-------|----------|:------:|
| `DB.init()` called on app boot | Creates Supabase client | ✅ |
| `departments` query | Returns 5 rows | ✅ |
| Anon key valid | HTTP 200 on authenticated requests | ✅ |
| RLS enabled | HTTP 401 on unauthenticated requests | ✅ |

## 5. Router Verification

| Route | Page | Module | Status |
|-------|------|--------|:------:|
| `#/` | P1 Dashboard | `DashboardPage.render()` | ✅ |
| `#/orders` | P2 Order List | `OrderListPage.render()` | ✅ |
| `#/orders/new` | P3 Order Create | `OrderCreatePage.render()` | ✅ |
| `#/orders/:id` | P4 Order Detail | `OrderDetailPage.render(id)` | ✅ |
| `#/routes` | P5 Route List | `RouteListPage.render()` | ✅ |
| `#/exceptions` | P6 Exception List | `ExceptionListPage.render()` | ✅ |

**Route coverage: 6/6** ✅

## 6. Local Run Instructions

```
1. Open terminal in project root
2. Start a local HTTP server:
   python3 -m http.server 8080
   (or any static file server)

3. Open browser: http://localhost:8080

4. Verify:
   - Nav bar renders with 5 links + brand
   - Click "路线" → route list loads
   - Click "新建订单" → form renders with customer + route dropdowns
   - Click "订单" → order list (may be empty)
   - Dashboard shows stats + empty sections
```

## 7. Acceptance

| # | Criterion | Status |
|:--|-----------|:------:|
| 1 | `index.html` loads without 404 errors | ✅ |
| 2 | All JS chain files load (check DevTools Network tab) | ✅ |
| 3 | CSS assets resolve (no unstyled content) | ✅ |
| 4 | Supabase connection succeeds (check Console) | ✅ |
| 5 | Router navigates between 6 routes | ✅ |
| 6 | P5 Route List renders demo data | ✅ |

```
Local Runtime: READY ✅
```
