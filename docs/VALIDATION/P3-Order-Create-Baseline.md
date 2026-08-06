# DialFactory V1 — Page Baseline

## 1. Page Information

| 项目 | 内容 |
|------|------|
| **Page** | P3 Order Create |
| **Route** | `#/orders/new` |
| **Status** | **BASELINED** |
| **Phase** | Phase 1-C-3 D-4 |
| **Version** | V1.0 |
| **Created** | 2026-08-06 |
| **Module** | `js/pages/order-create.js` |

---

## 2. Purpose

跟单员创建新订单。执行 ADL-001 流程：选客户 → 选路线 → 确认工序 → 填参数 → 生成节点。

**V1 能力：**
- 2-step wizard: Basic Info → Route Confirmation
- 路线模板选择，工序确认/取消
- `is_required` 工序锁定不可取消
- Gap-based seq (10, 20, 30, ...)
- 创建订单 + route_snapshot + order_nodes
- 客户 L3 处理：dropdown if data, text input fallback

**V1 限制：**
- 不创建客户（预置数据）
- 不创建新路线
- 不修改路线模板

---

## 3. Data Boundary

### Tables Used

| Table | Access | Purpose |
|-------|:------:|---------|
| `orders` | INSERT | 订单创建 |
| `order_nodes` | INSERT (batch) | 节点生成 |
| `customers` | SELECT | 客户下拉 |
| `process_routes` | SELECT | 路线选择 |
| `route_steps` | SELECT | 步骤加载 |
| `processes` | SELECT | 工序信息 |
| `departments` | SELECT | 部门名称 |

### Read / Write

| 操作 | 状态 |
|------|:----:|
| SELECT | ✅ |
| INSERT | ✅ (`orders` + `order_nodes`) |
| UPDATE | ❌ |
| DELETE | ❌ (rollback only) |

### API Modules

| Module | Method | Purpose |
|--------|--------|---------|
| `CustomersAPI` | `list()` | Customer dropdown |
| `ProcessesAPI` | `listRoutes()` | Route dropdown |
| `ProcessesAPI` | `getRouteWithSteps()` | Step 2 load |
| `OrdersAPI` | `createOrder()` | Multi-table INSERT + rollback |
| `OrdersAPI` | `list()` | Duplicate order_no check |

---

## 4. Component Inventory

### Domain Orchestration

| Module | Export | Role |
|--------|--------|------|
| `js/domain/order-create.js` | `OrderCreate.submit()` | Validate, build snapshot, create |

### Page Module

| Module | Export | Role |
|--------|--------|------|
| `js/pages/order-create.js` | `OrderCreatePage.render()` | UI: form, toggles, navigation |

### Shared Components Used

| Component | Where |
|-----------|-------|
| `Skeleton` | Loading route steps in Step 2 |

---

## 5. State Coverage

### Loading

Step 1 → Step 2 transition: Skeleton cards while loading route steps.

### Success

```
Step 1: Form fields populated. Route dropdown loaded.
Step 2: Route steps displayed. Toggles functional.
        is_required locked (🔒). Confirmed count displayed.
Submit → INSERT orders + nodes → navigate to #/orders/:id.
```

### Empty

| Scenario | Handling |
|----------|----------|
| No routes | Route dropdown shows "— 暂无路线 —" |
| No customers | Text input field shown instead of dropdown |
| 0 confirmed steps | Submit button disabled. Error: "至少确认一道工序" |

### Error

| Scenario | Handling |
|----------|----------|
| Duplicate order_no | API pre-check. Error: "订单编号已存在" |
| Validation failure | Field errors displayed on Step 1 |
| createOrder rollback | Orphan order deleted. Alert error message |
| Network error | Alert error. Form preserved |

---

## 6. Business Rules

### ADL Compliance

| ID | Rule | Implementation |
|----|------|---------------|
| **ADL-001** | 路线模板是建议集 | Step 2: user confirms/cancels each step. Only confirmed → nodes |
| **ADL-001** | route_snapshot 记录 confirmed | `OrderCreate.submit()` builds snapshot with all steps + `confirmed` flag |
| **ADL-001** | is_required 不可取消 | Step 2: `is_required=true` steps locked (🔒). Toggle disabled |
| **ADL-002** | N/A | Not involved in order creation |
| **ADL-003** | First node active, rest waiting | Nodes created: `status = i === 0 ? 'active' : 'waiting'` |

### ADP Compliance

| ID | Status |
|----|:------:|
| ADP-001~005 | N/A — not involved in order creation |

### Domain Constraints

| Rule | Enforcement |
|------|------------|
| Gap-based seq | `(i + 1) * 10` for initial nodes |
| Single-transaction semantics | `createOrder()` with compensatory rollback |
| Customer L3 | `customer_id` nullable. Free-text fallback |
| At least 1 confirmed step | `OrderCreate.validateOrderForm()` checks |

---

## 7. Freeze Verification

| Check | Status |
|-------|:------:|
| No schema modification | ✅ |
| No new fields | ✅ |
| No direct DB calls from page | ✅ — `order-create.js` calls `OrderCreate.submit()` |
| All writes through API layer | ✅ — `OrdersAPI.createOrder()` |
| No architecture drift | ✅ — Page is UI-only per REVISION 5 |
| `route_snapshot` per ADL-001 | ✅ — Built in domain layer |
| Gap seq per REVISION 2 | ✅ — 10, 20, 30, ... |

---

## 8. Acceptance Status

```
Status: BASELINED ✅
```
