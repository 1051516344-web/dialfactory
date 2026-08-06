# DialFactory V1 — Page Baseline

## 1. Page Information

| 项目 | 内容 |
|------|------|
| **Page** | P4 Order Detail |
| **Route** | `#/orders/:id` |
| **Status** | **BASELINED** |
| **Phase** | Phase 1-C-3 D-3 |
| **Version** | V1.0 |
| **Created** | 2026-08-06 |
| **Module** | `js/pages/order-detail.js` |

---

## 2. Purpose

单张订单的完整视图。核心页面。包含：基本信息、流程图（节点卡片 + 操作按钮）、异常记录。

**V1 能力：**
- 订单基本信息展示（客户、数量、交期、规格、进度条）
- 流程可视化（纵向节点卡片，按 seq 排列，状态颜色）
- 5 种节点操作：完成、暂停、恢复、快捷返工、动态追加
- 异常记录（inline on node cards）
- 异常汇总 section
- 订单状态自动推导（ADL-003）

**V1 限制：**
- 不修改订单基本信息（只读）
- 不修改路线
- 不做批量操作

---

## 3. Data Boundary

### Tables Used

| Table | Access | Purpose |
|-------|:------:|---------|
| `orders` | SELECT, UPDATE (status) | 订单信息 + 状态推导 |
| `order_nodes` | SELECT, UPDATE, INSERT | 节点展示 + 操作 |
| `exception_events` | SELECT, INSERT | 异常记录 |
| `processes` | SELECT | 工序字典（append 时） |
| `departments` | SELECT | 部门名称（append 时） |
| `customers` | SELECT (via orders JOIN) | 客户名称展示 |

### Read / Write

| 操作 | 状态 |
|------|:----:|
| SELECT | ✅ |
| INSERT | ✅ (`order_nodes`, `exception_events`) |
| UPDATE | ✅ (`order_nodes`, `orders`) |
| DELETE | ❌ |

### API Modules

| Module | Method | Purpose |
|--------|--------|---------|
| `OrdersAPI` | `getById()` | Order + nodes load |
| `OrdersAPI` | `updateNode()` | Status changes |
| `OrdersAPI` | `insertNode()` | Rework / append |
| `OrdersAPI` | `bumpSeq()` | Seq recomputation |
| `OrdersAPI` | `updateStatus()` | Order status sync |
| `ExceptionsAPI` | `listByNodeIds()` | Exception load |
| `ExceptionsAPI` | `create()` | Exception record |
| `ProcessesAPI` | `listProcesses()` | Append: process selector |

### Domain Modules

| Module | Method | Purpose |
|--------|--------|---------|
| `NodeActions` | `advance()` | Complete node + auto-activate next |
| `NodeActions` | `pause()` | Pause with reason |
| `NodeActions` | `resume()` | Resume paused |
| `NodeActions` | `rework()` | Create rework node (rework_pass+1) |
| `NodeActions` | `append()` | Create new process node (rework_pass=0) |
| `NodeActions` | `recordException()` | Record quality event |
| `NodeState` | `validate()` | Transition legality |
| `NodeState` | `getAvailableActions()` | Action button visibility |
| `SeqCalc` | `gapInsertion()` | Gap-based seq for new nodes |
| `Validation` | `validateQtyOut()` | 检验 node qty_out check |
| `OrderState` | `derive()` | Order status from nodes |
| `OrderState` | `nodeStats()` | Progress + stall detection |

---

## 4. Component Inventory

### Page Module

| Module | Export | Role |
|--------|--------|------|
| `js/pages/order-detail.js` | `OrderDetailPage.render()` | UI-only orchestrator |
| | `OrderDetailPage.onAdvance()` | → `NodeActions.advance()` |
| | `OrderDetailPage.onPause()` | → `NodeActions.pause()` |
| | `OrderDetailPage.onResume()` | → `NodeActions.resume()` |
| | `OrderDetailPage.onRework()` | → `NodeActions.rework()` |
| | `OrderDetailPage.onAppend()` | → `NodeActions.append()` |
| | `OrderDetailPage.onRecordException()` | → `NodeActions.recordException()` |

### Internal Render Functions

| Function | Output |
|----------|--------|
| `renderFlow(nodes, excByNode)` | Vertical node cards with arrows |
| `renderNodeCard(node, exceptions)` | Single node card with actions + inline exceptions |
| `renderExceptions(exceptions, nodes)` | Exception summary section |
| `renderFull(container)` | Full page render |
| `handleActionResult(result)` | Toast + local state update + re-render |

### Shared Components Used

| Component | Where |
|-----------|-------|
| `StatusBadge` | Node status, order status |
| `ProgressBar` | Order progress |
| `EmptyState` | No nodes, no exceptions |
| `Skeleton` | Loading state |
| `ConfirmDialog` | Pause reason, rework confirm, append form, exception form, qty_out |
| `Toast` | Success/error/warning notifications |
| `Format` | Date, number display |

---

## 5. State Coverage

### Loading

Skeleton cards (6 placeholders) during `OrdersAPI.getById()` + `ExceptionsAPI.listByNodeIds()`.

### Success (Normal Flow)

```
┌─ Info Section ────────────────────────────┐
│ #0088 · 时诺    [生产中]                   │
│ 500件 · 8月20日 · 太阳纹+银白             │
│ ████████████░░░ 60% (3/5)                  │
└────────────────────────────────────────────┘

┌─ Process Flow ────────────────────────────┐
│ [✓] P01 冲压成型 · 制一                    │
│     done                                   │
│  ↓                                         │
│ [▶] P03 太阳纹加工 · 制二                  │
│     active · [完成] [暂停] [记录异常]       │
│               [返工] [追加工序]             │
│  ↓                                         │
│ [ ] P05 银白电镀 · 制三                    │
│     waiting                                │
└────────────────────────────────────────────┘

┌─ Exceptions ──────────────────────────────┐
│ 色差 · 30件 · 返回电镀 · 8月6日            │
└────────────────────────────────────────────┘
```

### Empty

| Scenario | Display |
|----------|---------|
| 0 nodes | `EmptyState { icon: '📋', title: '暂无工序节点' }` |
| 0 exceptions | `EmptyState { icon: '✅', title: '无异常记录' }` |

### Error

| Scenario | Handling |
|----------|----------|
| Order not found | Error card + "返回" button |
| Network error on load | Error card + retry |
| Action failure (primary write) | Toast error. Node state unchanged |
| Action failure (cascade) | Toast warning. Primary write committed |
| Seq bump failure | Toast "Seq重算失败，已刷新" + full reload |

---

## 6. Business Rules

### ADL Compliance

| ID | Rule | Implementation |
|----|------|---------------|
| **ADL-001** | route_snapshot preserved | Read-only display. Not modified |
| **ADL-002** | Rework human decision | `NodeActions.rework()` triggered by user click only |
| **ADL-002** | rework_pass semantics | Rework: +1. Append: 0 |
| **ADL-003** | 4-state model | `NodeState.TRANSITIONS`: waiting/active/done/paused only |
| **ADL-003** | Order status derived | `OrderState.derive(nodes)` — never reads `orders.status` directly |

### Action Availability Matrix

| node.status | advance | pause | resume | rework | append | recordException |
|:----------:|:------:|:-----:|:------:|:------:|:------:|:---------------:|
| `waiting` | — | — | — | — | — | — |
| `active` | ✅ | ✅ | — | — | ✅ | ✅ |
| `paused` | — | — | ✅ | — | ✅ | ✅ |
| `done` | — | — | — | ✅ | ✅ | ✅ |

### Forbidden Transitions (Enforced by NodeState)

| From | To | Blocked By |
|------|-----|-----------|
| `waiting` | `done` | `NodeState.validate()` |
| `paused` | `done` | `NodeState.validate()` |
| `done` | `active` | `NodeState.validate()` |
| `active` | rework on self | `getAvailableActions()` excludes 'rework' |

### Write Safety

| Failure Type | Response |
|-------------|----------|
| Primary write (updateNode/insertNode) fails | Abort. No state change. Toast error |
| Cascade (auto-activate) fails | Node IS done. Toast: "下游激活失败，请手动激活" |
| Cascade (seq bump) fails | Node created. Toast: "Seq重算失败，已刷新" |
| Cascade (order status) fails | Toast: "状态更新延迟，下次操作自动修正" |

---

## 7. Freeze Verification

| Check | Status |
|-------|:------:|
| No schema modification | ✅ |
| No new fields | ✅ |
| No direct DB calls from page | ✅ — `order-detail.js`: 0 `DB.get()` / `DB.call()` calls |
| All writes through domain layer | ✅ — Page → `NodeActions` → `OrdersAPI`/`ExceptionsAPI` |
| No architecture drift | ✅ — Page is UI-only per API Contract |
| ADL-001: route_snapshot preserved | ✅ — Read-only on detail page |
| ADL-002: no auto-routing | ✅ — All actions user-triggered |
| ADL-003: 4 states only | ✅ — `NodeState.TRANSITIONS` |
| FK policy unchanged | ✅ — `order_nodes.order_id → orders` RESTRICT |
| `exception_events.node_id` no FK | ✅ — Direct INSERT, no FK dependency |

---

## 8. Acceptance Status

```
Status: BASELINED ✅
```
