# Phase 3-D · Order Specification Field Audit

> **Status:** Audit Complete — No Schema Changes
> **Purpose:** Before factory trial, classify every order field by stability
> **Source:** Phase 0-A.2 Gap Analysis + Phase 0 Field Maturity + Factory Discovery (sand_type)

---

## 1. Classification Framework

| Class | Name | Rule |
|:-----:|------|------|
| **A** | Core Structured | Stable, factory-confirmed. Keep as dedicated column with structured UI. |
| **B** | Flexible Spec | Variable across customers/orders. Store in `specs JSONB`. Free-text UI. |
| **C** | Future Observation | Factory term exists but not yet modeled. Observe during trial, do NOT build. |

**Hard constraints:**
1. No schema changes — do not add/remove columns
2. Do not remove existing columns (even if deprecated — `sand_type` stays)
3. Prefer `specs JSONB` for variable product requirements
4. Do not create enums unless factory confirms the set is stable

---

## 2. Field Audit — All 14 Order Fields

### 2.1 User-Visible Form Fields (Step 1)

| # | Field | Current Storage | Current UI | Factory Reality | Recommendation | Class |
|:--:|-------|----------------|------------|-----------------|----------------|:-----:|
| 1 | **order_no** | `orders.order_no TEXT NOT NULL UNIQUE` | `<input>` required | Factory assigns manually. Format `CUST-2026-0088`. Stable. | Keep as is. | **A** |
| 2 | **customer_id** | `orders.customer_id UUID FK→customers` | `<select>` required | Select from ~16 active customers. Stable FK. | Keep as is. | **A** |
| 3 | **order_qty** | `orders.order_qty INTEGER NOT NULL` | `<input type="number">` required | Piece count. Universal. Stable. | Keep as is. | **A** |
| 4 | **due_date** | `orders.due_date DATE NOT NULL` | `<input type="date">` required | Delivery deadline. Universal. Stable. | Keep as is. | **A** |
| 5 | **base_texture** | `orders.base_texture TEXT` | `<select>` enum: 无底纹/太阳纹/CD纹 | ⚠️ Phase 0 flagged gaps: 搪瓷面, 喷漆 not covered. Factory language includes more surface types than these 3. The enum is **not confirmed stable.** | **Change UI to text input** with datalist suggestions (keep the 3 known values as hints). Column stays. No new enum. | **A/B** |
| 6 | **plate_color** | `orders.plate_color TEXT` | `<input>` free text, placeholder "如 银白60s" | ✅ Already free text. Phase 0: 60s suffix meaning unknown, 象牙 color type ambiguous. Free text is correct for now. | Keep as is. | **A** |
| 7 | **base_plate_color** | `orders.specs.base_plate_color` (JSONB) | `<input>` free text, placeholder "如 黑色喷漆、白底" | ✅ Moved to specs in #58. Free text. Optional. | Keep as is. | **B** |
| 8 | **note** | `orders.note TEXT` | `<textarea>` optional | Free-form remarks. Universal. | Keep as is. | **A** |

### 2.2 Auto-Generated / Hidden Fields

| # | Field | Current Storage | Current UI | Factory Reality | Recommendation | Class |
|:--:|-------|----------------|------------|-----------------|----------------|:-----:|
| 9 | **route_id** | `orders.route_id UUID FK→process_routes` | Hidden. Hardcoded `null`. | Route Builder (Step 2) replaced template selection. Supervisor builds route manually each time. Route templates exist in DB but are unused in order creation flow. | **Keep column, keep null.** Route templates may become useful if factory identifies reusable standard routes during trial. Observe. | **C** |
| 10 | **route_snapshot** | `orders.route_snapshot JSONB DEFAULT '{}'` | Auto-generated from Step 2 checklist | Records which processes were selected, their dept, and seq. This is the actual route definition. | Keep as is. Essential for audit trail. | **A** |
| 11 | **specs** | `orders.specs JSONB DEFAULT '{}'` | Container — `base_plate_color` stored here | Designed in Phase 0-A.2 as the escape hatch for "spec params the 3 fixed fields can't hold." Now active with `base_plate_color`. | Keep as is. This is the **primary expansion point** for all future B-class fields. | **B** |
| 12 | **status** | `orders.status TEXT CHECK (in_production,paused,completed)` | Auto-set to `in_production` | Derived from node states. Never manually set. Stable. | Keep as is. | **A** |
| 13 | **sand_type** | `orders.sand_type TEXT` | ❌ **Removed from UI** (#58) | Factory confirmed: "喷砂没有严格标准，依据样本自行调试。" Not a fixed 3-level enum. | **Column retained** (historical data preserved). No UI, no write. Can be dropped in a future cleanup migration. | **—** (Deprecated) |
| 14 | **second_route_id** | `orders.second_route_id UUID FK→process_routes DEFAULT NULL` | Hidden. Always `null`. | Reserved for dual-route orders (e.g. 上/下 layer). Phase 0 data shows split-path orders exist. Not implemented yet. | **Keep column, keep null.** Observe during trial whether dual-route orders are common enough to warrant implementation. | **C** |

---

## 3. Summary Matrix

```
FORM FIELDS (Step 1)
  order_no         A    ✅ Stable
  customer_id      A    ✅ Stable
  order_qty        A    ✅ Stable
  due_date         A    ✅ Stable
  base_texture     A/B  ⚠️ Enum not confirmed → change to text+datalist
  plate_color      A    ✅ Free text, correct
  base_plate_color B    ✅ In specs JSONB, correct
  note             A    ✅ Stable

AUTO / HIDDEN
  route_id         C    🔮 Route templates — observe trial usage
  route_snapshot   A    ✅ Essential
  specs            B    ✅ Expansion container
  status           A    ✅ Stable
  sand_type        —    🗑️ Deprecated (column kept, UI removed)
  second_route_id  C    🔮 Dual-route orders — observe trial need
```

| Class | Count | Fields |
|:-----:|:-----:|--------|
| **A** | 8 | order_no, customer_id, order_qty, due_date, plate_color, route_snapshot, status, note |
| **A/B** | 1 | base_texture (column A, enum B → fix UI) |
| **B** | 2 | base_plate_color, specs (container) |
| **C** | 2 | route_id, second_route_id |
| **—** | 1 | sand_type (deprecated) |

---

## 4. Action Items (V1 Trial Scope)

### 4.1 Do Now: Fix `base_texture` UI (5 minutes)

The `base_texture` column is useful and should stay. But the 3-option `<select>` enum is premature standardization.

**Change:** `<select>` → `<input type="text" list="texture-suggestions">` with `<datalist>`:

```html
<label class="form-label">底质纹理</label>
<input type="text" id="form-texture" class="form-input"
       list="texture-suggestions" placeholder="如 太阳纹、CD纹"
       value="...">
<datalist id="texture-suggestions">
  <option value="无底纹">
  <option value="太阳纹">
  <option value="CD纹">
</datalist>
```

**Why:** Supervisor can type custom values (搪瓷面, 喷漆, etc.) during trial. The 3 known options appear as suggestions. No schema change. If trial reveals a stable set of 5-6 values, we can restore an enum later.

**Files:** [js/pages/order-create.js](js/pages/order-create.js#L88-90), [js/config.js](js/config.js#L61-62)

### 4.2 Observe During Trial (C-Class Fields)

These factory concepts exist in historical data but are NOT modeled in V1. The trial period is the observation window.

| Concept | Phase 0 Source | What to Watch |
|---------|---------------|---------------|
| **字钉类型** (stud type): 银钉/铜板钉 | [01-Business-Language-Mapping.md](AI_CONTEXT/Phase0/01-Business-Language-Mapping.md) C-06/07 | Do orders specify stud type? Is it customer-specific? |
| **光泽度** (finish): 哑光/消光/半消光 | [01-Business-Language-Mapping.md](AI_CONTEXT/Phase0/01-Business-Language-Mapping.md) D-02/03 | Does "消光" appear in specs? Is it a process or a spec attribute? |
| **喷漆类型** (paint type): 平搪瓷 etc. | [01-Business-Language-Mapping.md](AI_CONTEXT/Phase0/01-Business-Language-Mapping.md) B-09, D-01 | Does base_plate_color sufficiently cover this, or is it a separate dimension? |
| **搪瓷面** (enamel) | [01-Business-Language-Mapping.md](AI_CONTEXT/Phase0/01-Business-Language-Mapping.md) B-06 | Does base_texture free-text capture this, or is it a process, not a spec? |
| **Route templates** | Phase 3B Route Builder | Do supervisors re-select the same process sets repeatedly? |
| **Dual-route orders** | [05-Real-Data-Deep-Dive.md](AI_CONTEXT/Phase0/05-Real-Data-Deep-Dive.md) 上/下 paths | How many orders have split upper/lower paths? |

**Recording:** During trial, if any C-class concept appears in ≥3 orders, it graduates to B. Add a key to `specs JSONB` (no schema change). If a concept stabilizes across ≥10 orders with a fixed value set, it may graduate to A with its own column (V2 schema change).

### 4.3 Trial Recording Template Addition

Add to [试运行记录表-Trial-Log.csv](tools/试运行记录表-Trial-Log.csv) Section 3 (规格):

```
新增观察列:
  - 底质纹理使用了哪些自定义值？（非太阳纹/CD纹/无底纹的）
  - 备注中是否出现了规格相关信息？（字钉、光泽度、喷漆类型等）
```

---

## 5. Design Principle

```
 创建时                         试运行后 (V1.1)
 ────────                       ───────────────
 base_texture  <select>    →   base_texture  <datalist>  (建议但不限制)
 plate_color   <input>     →   plate_color   <input>     (不变)
 base_plate    <input>     →   base_plate    <input>     (不变)
                              + specs.xxxx    <input>     (观察中浮现的)
```

**The `specs` JSONB column is the shock absorber.** When the factory reveals a new spec dimension during trial, add a key to `specs` — no migration, no downtime. When a dimension proves stable (≥10 orders, fixed value set), promote it to its own column in V2.

---

## 6. Freeze Compliance

```
Schema:     No changes
Columns:    17 (orders table) — all retained
Fields:     59 across all 8 tables (unchanged)
New enums:  0
FK:         6 RESTRICT, 3 SET NULL, 1 NO FK, 0 CASCADE (unchanged)
ADL-001~003: No violation
ADP-001~005: No violation
```

---

## 7. Related Documents

| Document | Relevance |
|----------|-----------|
| [58-Surface-Specification-Field-Adjustment.md](AI_CONTEXT/Phase3/58-Surface-Specification-Field-Adjustment.md) | Just executed — sand_type removed, base_plate_color added to specs |
| [01-Business-Language-Mapping.md](AI_CONTEXT/Phase0/01-Business-Language-Mapping.md) | Full factory language audit — 30 terms, 41 open questions |
| [03-Field-Maturity-Rating.md](AI_CONTEXT/Phase0/03-Field-Maturity-Rating.md) | L1/L2/L3 ratings — sand_type was L3 from the start |
| [Phase0-A.2-Model-Gap-Analysis.md](AI_CONTEXT/Phase0/Phase0-A.2-Model-Gap-Analysis.md) | Original specs JSONB design with C4 recommendation |
| [56-Phase3D-Trial-Recording-Log.md](AI_CONTEXT/Phase3/56-Phase3D-Trial-Recording-Log.md) | Trial observation log template |

---

> **Bottom line:** 8 of 14 fields are stable (A). 1 needs a minor UI fix (base_texture: enum→datalist). 2 are correctly in specs JSONB (B). 2 are future features (C). 1 is deprecated (sand_type). The foundation is sound for trial.
