# DialFactory Phase 1-C-3 D-4 · Implementation Plan

> **状态：** APPROVED WITH CONDITIONS — Updated
> **条件：** 5 Required Rules Applied
> **Phase：** D-4 — P3 Order Create
> **参考：** [10-Frontend-Specification.md](10-Frontend-Specification.md) §4 · [11-Frontend-Implementation-Plan.md](11-Frontend-Implementation-Plan.md) §9.6
> **原则：** 先 Review，再编码。所有写操作经过 API Layer。

---

## 1. Files

| File | Action | Purpose |
|------|:------:|---------|
| `js/domain/order-create.js` | **Create** | Orchestration: validate, build snapshot, create order+nodes (REVISION 5) |
| `js/pages/order-create.js` | **Create** | P3 page (UI-only: form, toggles, navigation) |
| `js/data/orders.js` | **Modify** | Add `createOrder()` with single-transaction semantics (REVISION 1) |
| `js/domain/validation.js` | **Modify** | Add `validateOrderForm()` |
| `js/app.js` | **Modify** | Replace P3 placeholder |
| `index.html` | **Modify** | Add `order-create.js` to chain |

**Total: 2 new + 4 modified = 6 files**

---

## 2. API Method: `OrdersAPI.createOrder()` (REVISION 1)

**Single-transaction semantics.** Supabase JS client doesn't support SQL transactions, so we use a compensatory rollback pattern.

```javascript
async function createOrder(orderData, nodesData):
  // REVISION 1: Single-transaction semantics
  // Step A: INSERT orders → get order.id
  // Step B: INSERT order_nodes (batch, all with order_id)
  //   → FAIL at Step B: DELETE FROM orders WHERE id = order.id (rollback)
  //   → SUCCESS: return { order, nodes }
  // Caller never sees partial state.
```

**Rollback:** Orphaned order row is cleaned before returning to caller. The window between Step A and Step B is milliseconds — no other user can see the orphan row in V1 (single user).

---

## 3. Seq Strategy: Gap-Based (REVISION 2)

Initial order_nodes created with gap-based seq:

```javascript
// Confirmed steps: [P01, P03, P05, P07, P09]
// Generated seq:   10,   20,  30,  40,  50    ← GAP_STEP = 10

const nodesData = confirmedSteps.map((step, i) => ({
  ...step,
  seq: (i + 1) * SeqCalc.GAP_STEP,    // 10, 20, 30, ...
  rework_pass: 0,
  status: i === 0 ? 'active' : 'waiting'
}));
```

This ensures future rework/append operations have room for gap insertion without bumps.

---

## 4. route_snapshot Specification (REVISION 3)

Complete historical record of the order creation decision:

```json
{
  "route_id": "<UUID>",
  "route_name": "标准太阳纹+银白路线",
  "snapshot_at": "2026-08-06T10:30:00+08:00",
  "steps": [
    {
      "seq": 1,
      "process_code": "P01",
      "process_name": "冲压成型",
      "dept_name": "制一",
      "is_required": true,
      "confirmed": true
    },
    {
      "seq": 2,
      "process_code": "P03",
      "process_name": "太阳纹加工",
      "dept_name": "制二",
      "is_required": false,
      "confirmed": true
    },
    {
      "seq": 3,
      "process_code": "P04",
      "process_name": "喷砂",
      "dept_name": "制二",
      "is_required": false,
      "confirmed": false
    }
  ]
}
```

Key: `confirmed=false` steps are preserved in the snapshot for audit trail, even though they don't generate `order_nodes`.

---

## 5. Domain Orchestration (REVISION 5)

**Page must NOT contain creation logic.** All logic moves to `js/domain/order-create.js`.

```javascript
const OrderCreate = {
  async submit(formData, confirmedSteps):
    // 1. validateOrderForm(formData) → { valid, errors }
    // 2. Build route_snapshot (REVISION 3)
    // 3. Build nodesData with gap-based seq (REVISION 2)
    // 4. OrdersAPI.createOrder(orderData, nodesData) (REVISION 1)
    // 5. Return { ok, orderId } | { ok: false, error }
};
```

**Page responsibility (UI-only):**
- Render form fields
- Handle Step 1 → Step 2 transition
- Toggle confirmed/cancelled
- Call `OrderCreate.submit()` on [创建订单]
- Navigate to new order on success
- Show errors on failure

---

## 3. Page Design

### 3.1 Step 1 — Basic Info Form

```
Fields:
  order_no        TEXT · required · unique
  customer_id     SELECT · V1: allow null (free-text fallback)
  order_qty       NUMBER · required · > 0 · integer
  due_date        DATE · required · ≥ today
  base_texture    SELECT · optional (CONFIG.BASE_TEXTURES)
  plate_color     TEXT · optional
  sand_type       SELECT · optional (CONFIG.SAND_TYPES)
  route_id        SELECT · required
  note            TEXTAREA · optional

Button: [下一步：确认工序 →]

Validation (on click):
  - order_no: non-empty, no duplicate (check via API)
  - order_qty: integer > 0
  - due_date: valid date, ≥ today
  - route_id: non-empty
  - customer: non-empty (or free-text in V1)
```

### 3.2 Step 2 — Route Confirmation (ADL-001)

```
Display route steps loaded from getRouteWithSteps(route_id).
Each step:
  - seq, process_code, process_name, dept_name
  - is_required → 🔒 locked, confirmed=true (cannot toggle)
  - !is_required → toggle: ✅ confirmed / ❌ cancelled
  - Default: all confirmed=true

Summary: "已确认 N 道 · 已取消 M 道"

Button: [← 返回修改] [创建订单 ✓]
  - Submit disabled if confirmed count = 0
```

### 3.3 Submit — Create Order

On [创建订单]:

```
1. Build route_snapshot JSONB:
   {
     route_id, route_name, snapshot_at: now(),
     steps: [{ seq, process_code, process_name, dept_name, is_required, confirmed }]
   }

2. OrdersAPI.createOrder(
     orderData: { order_no, customer_id, order_qty, due_date,
                  base_texture, plate_color, sand_type,
                  route_id, route_snapshot, status: 'in_production', note },
     nodesData: confirmed steps → [
       { process_id, process_name, process_code, dept_id, dept_name,
         seq, rework_pass: 0,
         status: first ? 'active' : 'waiting' }
     ]
   )

3. Navigate to #/orders/:newId
```

---

## 4. Validation Rules

| Field | Rule | Error |
|-------|------|-------|
| `order_no` | Required | "请输入订单编号" |
| `order_no` | Unique | "订单编号已存在" |
| `customer_id` or text | Required (V1: text fallback) | "请选择或输入客户" |
| `order_qty` | Integer > 0 | "请输入有效数量" |
| `due_date` | Valid date ≥ today | "交期不能早于今天" |
| `route_id` | Required | "请选择工艺路线" |
| Confirmed steps | ≥ 1 | "至少确认一道工序" |

---

## 5. V1 Strategy: Customer L3 Handling

Per [03-Field-Maturity-Rating.md](03-Field-Maturity-Rating.md) and WARN-001:

- `customers` table has L3 data maturity (no real customer data yet)
- `orders.customer_id` allows NULL
- **Step 1 customer field:** dropdown if customers exist, otherwise text input
- **Fallback:** if text input used → store in `orders.note` as "客户: {name}" and leave `customer_id = NULL`
- **Transition:** when customer data is ready, add FK constraint in UI

---

## 6. Data Flow

```
User fills Step 1 form
    │
    ▼
Validate → INVALID: show field errors, stay on Step 1
    │ VALID
    ▼
Load route steps via ProcessesAPI.getRouteWithSteps(routeId)
    │
    ▼
Step 2: display steps. User toggles confirm/cancel
    │
    ▼
[创建订单] clicked:
    │
    ├── Build route_snapshot JSONB
    ├── Filter confirmed steps → nodesData[]
    │
    ▼
OrdersAPI.createOrder(orderData, nodesData)
    │
    ├── INSERT orders → get order.id
    ├── INSERT order_nodes (batch, all with order_id)
    │     ├── First node: status='active'
    │     └── Rest: status='waiting'
    │
    ├── FAIL at any point → rollback
    │
    ▼ SUCCESS
Router.navigate('/orders/' + newOrder.id)
```

---

## 7. Component Usage

| Component | Where |
|-----------|-------|
| `Skeleton` | Loading route steps in Step 2 |
| `EmptyState` | No routes available |
| `Toast` | Success/error notifications |
| `StatusBadge` | Step status in route confirm |
| `Format.date()` | Due date display |

No new components needed.

---

## 8. D-4 Validation Matrix (REVISION 4)

### 8.1 Positive Tests

| # | Test | Expected |
|:--|------|----------|
| P1 | Fill all required fields + submit | Order created. Nodes created with gap seq. Redirect to P4 |
| P2 | Create order, cancel 1 non-required step | route_snapshot has confirmed=false for that step. Nodes exclude it |
| P3 | Create order, all steps confirmed | All steps in snapshot with confirmed=true. All generate nodes |
| P4 | `is_required` step: toggle disabled | 🔒 icon. Cannot toggle to cancelled |
| P5 | Route dropdown loads active routes | Dropdown populated from `process_routes` |

### 8.2 Validation Tests

| # | Test | Expected |
|:--|------|----------|
| V1 | Submit with empty order_no | Error: "请输入订单编号" |
| V2 | Submit with duplicate order_no | Error: "订单编号已存在" (API pre-check) |
| V3 | Submit with order_qty=0 | Error: "请输入有效数量" |
| V4 | Submit with due_date < today | Error: "交期不能早于今天" |
| V5 | Submit with no route selected | Error: "请选择工艺路线" |
| V6 | Submit with 0 confirmed steps | Error: "至少确认一道工序" |

### 8.3 Transaction Tests

| # | Test | Expected |
|:--|------|----------|
| T1 | `createOrder()`: orders INSERT OK, nodes INSERT OK | Return `{ ok: true, order, nodes }` |
| T2 | `createOrder()`: orders INSERT OK, nodes INSERT FAIL | Rollback: DELETE orders row. Return `{ ok: false }` |
| T3 | `createOrder()`: orders INSERT FAIL | Return `{ ok: false }`. No cleanup needed |

### 8.4 Snapshot Tests

| # | Test | Expected |
|:--|------|----------|
| S1 | Check `route_snapshot` after create | Contains: `route_id`, `route_name`, `snapshot_at`, `steps[]` |
| S2 | Cancelled step in snapshot | `confirmed: false` preserved |
| S3 | Required step in snapshot | `is_required: true`, `confirmed: true` |

---

## 9. Acceptance Criteria

| # | Criterion |
|:--|-----------|
| 1 | Step 1 renders all form fields |
| 2 | Route dropdown loads from `process_routes` |
| 3 | Form validation blocks invalid submission |
| 4 | Duplicate `order_no` detected via API pre-check |
| 5 | Step 2 displays route steps with correct toggle state |
| 6 | `is_required=true` steps locked (🔒, cannot toggle) |
| 7 | Toggle switches between ✅ confirmed / ❌ cancelled |
| 8 | Submit creates `orders` + `order_nodes` rows |
| 9 | `route_snapshot` JSONB correctly built |
| 10 | First node `active`, rest `waiting` |
| 11 | On success, navigates to `/orders/:newId` |
| 12 | On failure, rollback (no orphan rows) |
| 13 | Customer field: dropdown if data, text input fallback |

---

## 9. Freeze Compliance

| Check | Status |
|-------|:------:|
| Tables written: `orders`, `order_nodes` | ✅ Existing |
| `route_snapshot` per ADL-001 | ✅ Built in Step 2 |
| `confirmed` flag in snapshot | ✅ Per ADL-001 |
| Only `confirmed=true` → `order_nodes` | ✅ ADL-001 |
| No `handing_off` | ✅ |
| No `rework_strategy` | ✅ |
| No new tables/fields | ✅ |
| Customer L3 strategy respected | ✅ |

---

> **Plan ready for Review. No code written. Awaiting approval.**
