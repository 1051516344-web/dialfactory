# DialFactory Phase 1-C-3 D-5 · Implementation Plan

> **状态：** Plan — Awaiting Review
> **Phase：** D-5 — P6 Exception List + Polish
> **参考：** [10-Frontend-Specification.md](10-Frontend-Specification.md) §7 · [11-Frontend-Implementation-Plan.md](11-Frontend-Implementation-Plan.md) §9.7
> **原则：** 最后阶段。轻量实现 + UI 收尾。

---

## 1. Files

| File | Action | Purpose |
|------|:------:|---------|
| `js/pages/exception-list.js` | **Create** | P6 Exception List page |
| `js/app.js` | **Modify** | Replace P6 placeholder |
| `index.html` | **Modify** | Add `exception-list.js` to chain |

**Total: 1 new + 2 modified = 3 files**

No new API, domain, or component modules. All already built in D-3.

---

## 2. API

`ExceptionsAPI.listAll()` already exists from D-3:

```javascript
ExceptionsAPI.listAll({ type?, page?, pageSize? })
  → { ok, data: Exception[], count }
```

Each exception includes `node: { order_id, process_name, orders: { order_no } }`.

---

## 3. Page Design

### 3.1 Layout

```
┌────────────────────────────────────────────┐
│ ← 返回    异常记录                         │
├────────────────────────────────────────────┤
│ [类型▾]                                    │  ← Filter: type dropdown
├────────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐   │
│ │ 色差 · 30件 · 返回电镀               │   │
│ │ #0088 · P03 太阳纹加工 · 8月6日      │   │  ← Click → /orders/:id
│ └──────────────────────────────────────┘   │
│ ┌──────────────────────────────────────┐   │
│ │ 电镀不良 · 15件 · 重做                │   │
│ │ #0091 · P05 银白电镀 · 8月5日       │   │
│ └──────────────────────────────────────┘   │
│              [加载更多...]                  │
└────────────────────────────────────────────┘
```

### 3.2 Filter

| Filter | Type | Values |
|--------|------|--------|
| Type | Dropdown | All / 色差 / 电镀不良 / 划伤 / 沙眼 / 变形 / 其他 |

### 3.3 Card Content

| Element | Field |
|---------|-------|
| Type (bold, red) | `exception.type` |
| Quantity | `exception.qty` |
| Resolution | `exception.resolution` |
| Order No | `exception.node.orders.order_no` |
| Process | `exception.node.process_name` |
| Date | `exception.created_at` |

### 3.4 Interaction

| Trigger | Action |
|---------|--------|
| Click card | Navigate to `#/orders/:order_id` |
| Select type filter | Re-fetch page 0 |
| Click "加载更多" | Fetch next page, append |

---

## 4. D-5 Polish (All Pages)

Light refinements across all 6 pages:

| # | Polish | Pages |
|:--|--------|:-----|
| 1 | Consistent "← 返回" navigation | P2, P3, P4, P5, P6 |
| 2 | Toast on successful create | P3 |
| 3 | Due date red text when overdue | P1, P2 |
| 4 | Empty state consistency check | All |
| 5 | Button disabled states during loading | P3, P4 |

No structural changes. Visual consistency only.

---

## 5. Acceptance Criteria

| # | Criterion |
|:--|-----------|
| 1 | `#/exceptions` renders exception cards sorted by `created_at DESC` |
| 2 | Cards show: type, qty, resolution, order_no, process_name, date |
| 3 | Type filter works: dropdown selection filters results |
| 4 | Click card navigates to `/orders/:orderId` |
| 5 | Pagination: "加载更多" appends next page |
| 6 | Empty state when no exceptions |
| 7 | All 6 pages have consistent navigation |
| 8 | No new API/domain/component modules — all reused from D-3 |

---

## 6. Freeze Compliance

| Check | Status |
|-------|:------:|
| Tables: `exception_events` + `order_nodes` + `orders` (read-only) | ✅ |
| No new tables/fields | ✅ |
| No writes (read-only page) | ✅ |
| All queries through `ExceptionsAPI` | ✅ |
| `exception_events.node_id` no FK — handled by JOIN, not FK dependency | ✅ |

---

## 7. Implementation Order

```
1. js/pages/exception-list.js    ← create page
2. js/app.js                     ← replace P6 placeholder
3. index.html                    ← add to chain
4. Polish pass                   ← visual consistency
```

**Estimated: ~100 lines for page, ~5 lines modified elsewhere.**

---

> **Plan ready. Last page. Awaiting approval.**
