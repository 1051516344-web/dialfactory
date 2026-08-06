# DialFactory Phase 2-C · Demo Launch Checklist

> **状态：** Ready
> **日期：** 2026-08-06

---

## Demo Scenario

### Pre-condition

Demo data seeded:
- 1 Customer: 时诺 (SN)
- 5 Processes: P01/P03/P05/P07/P09
- 1 Route: 标准太阳纹+银白路线 (5 steps)

---

## Demo Steps

### Step 1: Open Dashboard

```
Navigate to: #/
```

| Check | Expected |
|-------|----------|
| Nav bar renders: 🏭 DialFactory + 首页/订单/新建/路线/异常 | ✅ |
| Stats cards: 生产中 0 · 已暂停 0 · 已完成 0 | ✅ |
| 卡顿订单: "无卡顿订单" empty state | ✅ |
| 交期预警: "无交期预警" empty state | ✅ |
| 部门待办: 5 departments with 0 count each | ✅ |

### Step 2: View Route List

```
Click "路线" in nav → #/routes
```

| Check | Expected |
|-------|----------|
| Route card: "标准太阳纹+银白路线" · 5道工序 | ✅ |
| Steps: P01 冲压成型[必修] → P03 → P05 → P07 → P09[必修] | ✅ |

### Step 3: Create New Order

```
Click "新建" → #/orders/new
```

| Check | Expected |
|-------|----------|
| Customer dropdown: "深圳时诺钟表有限公司 (SN)" | ✅ |
| Route dropdown: "标准太阳纹+银白路线 (5道工序)" | ✅ |
| Fill: order_no=DEMO-001, qty=500, due=today+14d | ✅ |
| Select customer + route | ✅ |
| Click "下一步：确认工序 →" | ✅ |

### Step 4: Confirm Route Steps (ADL-001)

| Check | Expected |
|-------|----------|
| 5 steps displayed with toggle | ✅ |
| P01 冲压成型: 🔒 必修 (locked, cannot toggle) | ✅ |
| P09 总QC检验: 🔒 必修 (locked, cannot toggle) | ✅ |
| P03/P05/P07: ✅ 确认 (can toggle to ❌ 取消) | ✅ |
| Summary: "已确认: 5 道 · 已取消: 0 道" | ✅ |
| Click "创建订单 ✓" | ✅ |

### Step 5: View Created Order

```
Auto-navigates to #/orders/:id
```

| Check | Expected |
|-------|----------|
| Header: #DEMO-001 · 时诺 · [生产中] | ✅ |
| Info: 500件 · due_date · 规格 | ✅ |
| Process flow: 5 node cards with arrows | ✅ |
| Node 1 (P01): ▶ active (blue) with action buttons | ✅ |
| Nodes 2-5: ○ waiting (grey) | ✅ |
| Progress bar: 0% (0/5) | ✅ |

### Step 6: Advance Production Node

```
Click [完成] on Node 1 (P01 冲压成型)
```

| Check | Expected |
|-------|----------|
| Node 1: ✓ done (green). Action buttons hidden | ✅ |
| Node 2: ▶ active (blue). Auto-activated | ✅ |
| Progress bar: 20% (1/5) | ✅ |

### Step 7: Pause Node

```
Click [暂停] on Node 2 (P03 太阳纹加工)
Select: "待物料" → confirm
```

| Check | Expected |
|-------|----------|
| Node 2: ⏸ paused (yellow). Shows "待物料" reason | ✅ |
| Buttons: [恢复] [追加工序] [记录异常] | ✅ |
| Order status: "已暂停" (all non-done nodes paused) | ✅ |

### Step 8: Resume Node

```
Click [恢复] on Node 2
```

| Check | Expected |
|-------|----------|
| Node 2: ▶ active (blue). pause_reason cleared | ✅ |
| Order status: "生产中" | ✅ |

### Step 9: Record Exception

```
Click [记录异常] on Node 2
Fill: type=色差, qty=30, resolution=返回电镀 → confirm
```

| Check | Expected |
|-------|----------|
| Toast: "异常已记录" | ✅ |
| Exception card appears below Node 2 | ✅ |
| Node status unchanged (still active) | ✅ |

### Step 10: Complete Remaining Nodes

```
Complete Node 2, then Node 3 (P05), Node 4 (P07)
```

| Check | Expected |
|-------|----------|
| Each completion auto-activates next node | ✅ |
| Progress bar updates incrementally | ✅ |

### Step 11: Complete 总QC (检验 type)

```
Click [完成] on Node 5 (P09 总QC检验)
→ Prompted: "产出数量 *"
→ Enter: 470 → confirm
```

| Check | Expected |
|-------|----------|
| Node 5: ✓ done. qty_out = 470 | ✅ |
| All nodes done → Order status: "已完成" | ✅ |
| No action buttons on any node (all done) | ✅ |
| Progress bar: 100% (5/5) | ✅ |

### Step 12: Rework a Done Node

```
Click [返工] on Node 4 (P07 移印)
→ Confirm dialog → confirm
```

| Check | Expected |
|-------|----------|
| New node created after Node 4 | ✅ |
| New node: P07 移印, rework_pass=1, orange bg, status=active | ✅ |
| Seq correctly computed (gap insertion) | ✅ |
| Order status: "生产中" (new active node exists) | ✅ |

### Step 13: View Exception List

```
Click "异常" in nav → #/exceptions
```

| Check | Expected |
|-------|----------|
| Exception card: 色差 · 30件 · 返回电镀 | ✅ |
| Shows: #DEMO-001 · P03 太阳纹加工 | ✅ |
| Type filter dropdown functional | ✅ |

### Step 14: View Dashboard with Data

```
Click "首页" → #/
```

| Check | Expected |
|-------|----------|
| Stats: 生产中 1 · 已暂停 0 · 已完成 0 | ✅ |
| Dept queue shows active node counts | ✅ |

---

## Data Integrity Verification (Post-Demo)

| Check | Method | Expected |
|-------|--------|----------|
| `orders` has 1 row (DEMO-001) | API query | ✅ |
| `order_nodes` count matches flow | API query | ✅ |
| `route_snapshot` has confirmed flags | API query | ✅ |
| `exception_events` has 1 row | API query | ✅ |
| No `handing_off` status values | API query | ✅ |
| `rework_pass` correct on rework node | API query | ✅ |

---

## Freeze Compliance (Post-Demo)

| Check | Status |
|-------|:------:|
| Schema unchanged (8 tables, 58 fields) | ✅ |
| FK unchanged (0 CASCADE) | ✅ |
| ADL-001: route_snapshot preserved | ✅ |
| ADL-002: rework human-triggered only | ✅ |
| ADL-003: 4 states only | ✅ |
| No new migrations created | ✅ |

---

## Demo Result

```
Scenario: 14 steps
Expected: ALL PASS
Freeze: MAINTAINED
Schema Drift: NONE
```

---

> **Demo launch checklist ready. Execute 14 steps after deployment.**
