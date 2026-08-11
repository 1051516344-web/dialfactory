# Phase 3-D · Surface Specification Field Adjustment

> **Status:** Code Complete — No Schema Change
> **Change Proposal:** Remove 喷砂类型, Add 板底颜色
> **Freeze Impact:** 0 schema changes (app-layer only)

---

## 1. Rationale

**喷砂类型 (sand_type):** Factory confirmed spray sand is NOT a strict three-level classification (重砂/轻砂/中砂). It's continuous, customer-specific, experience-based. The fixed dropdown misrepresents reality.

**板底颜色 (base_plate_color):** The base plate/coating color (e.g. 黑色喷漆, 白底) is a real spec parameter that the factory tracks. It's distinct from 电镀颜色 (plate_color, electroplating color).

---

## 2. Audit Findings

### 2.1 sand_type — before removal

| Location | Usage | Action |
|----------|-------|--------|
| `orders.sand_type` column | Stored on INSERT | **Left in place** (NULL for new orders) |
| `js/config.js:63` | `CONFIG.SAND_TYPES` dropdown options | ✅ Removed |
| `js/pages/order-create.js:56` | `sandOptions` variable | ✅ Removed |
| `js/pages/order-create.js:97-100` | 喷砂类型 `<select>` UI | ✅ Replaced with 板底颜色 |
| `js/pages/order-create.js:126` | `formData.sand_type` collection | ✅ Replaced with `formData.base_plate_color` |
| `js/domain/order-create.js:51` | `sand_type` in orderData | ✅ Replaced with `specs` |
| `js/pages/order-list.js:180` | specText display | ⚠️ Was already NOT showing sand_type |
| `js/pages/order-detail.js:63` | specText display | ⚠️ Was already NOT showing sand_type |

**Key finding:** sand_type was collected and stored but **never displayed** in the UI. The list page and detail page both excluded it from specText.

### 2.2 base_plate_color — storage decision

| Option | Approach | Schema Change | Verdict |
|--------|----------|:---:|--------|
| A | New column `base_plate_color TEXT` | Yes | ❌ Unnecessary |
| **B** | **Store in existing `specs JSONB`** | **No** | **✅ Chosen** |
| C | Store in `note` field | No | ❌ Conflates concerns |

`orders.specs JSONB DEFAULT '{}'` — existed since migration 001, zero usage in code. Now stores `{ "base_plate_color": "黑色喷漆" }`.

---

## 3. Changes — 5 Files

### 3.1 [js/config.js](js/config.js#L61-63) — Remove SAND_TYPES

```diff
- // Texture / Sand options
+ // Texture options
  BASE_TEXTURES: ['无底纹', '太阳纹', 'CD纹'],
- SAND_TYPES: ['-', '重砂', '轻砂', '中砂'],
```

### 3.2 [js/pages/order-create.js](js/pages/order-create.js) — Step 1 UI

**Remove:**
```diff
- const sandOptions = CONFIG.SAND_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
```

**Replace dropdown with text input:**
```diff
- <label class="form-label">喷砂类型</label>
- <select id="form-sand" class="form-select"><option value="">—</option>${sandOptions}</select>
+ <label class="form-label">板底颜色</label>
+ <input type="text" id="form-base-plate-color" class="form-input"
+        placeholder="如 黑色喷漆、白底"
+        value="${escapeHTML(formData.base_plate_color || '')}">
```

**Replace formData collection:**
```diff
- formData.sand_type = document.getElementById('form-sand')?.value || '';
+ formData.base_plate_color = document.getElementById('form-base-plate-color')?.value || '';
```

### 3.3 [js/domain/order-create.js](js/domain/order-create.js#L51) — Order Data

```diff
- sand_type:     formData.sand_type || null,
+ specs:         { base_plate_color: formData.base_plate_color || null },
```

### 3.4 [js/pages/order-list.js](js/pages/order-list.js#L180) — specText Display

```diff
- const specText = [order.base_texture, order.plate_color].filter(Boolean).join('+') || '—';
+ const specText = [order.base_texture, order.plate_color, order.specs?.base_plate_color].filter(Boolean).join('+') || '—';
```

### 3.5 [js/pages/order-detail.js](js/pages/order-detail.js#L63) — specText Display

```diff
- const specText = [order.base_texture, order.plate_color].filter(Boolean).join('+') || '—';
+ const specText = [order.base_texture, order.plate_color, order.specs?.base_plate_color].filter(Boolean).join('+') || '—';
```

---

## 4. Display Behavior

| Scenario | specText |
|----------|----------|
| 太阳纹 + 银白60s + (empty) | `太阳纹+银白60s` |
| CD纹 + 玫瑰金 + 黑色喷漆 | `CD纹+玫瑰金+黑色喷漆` |
| (all empty) | `—` |

**Rule:** `[base_texture, plate_color, base_plate_color].filter(Boolean).join('+') || '—'`

---

## 5. Freeze Compliance

```
Schema:     No changes
Migration:  None required
Fields:     59 (unchanged)
FK:         6 RESTRICT, 3 SET NULL, 1 NO FK, 0 CASCADE (unchanged)
ADL-001~003: No violation
ADP-001~005: No violation
```

- `orders.sand_type` column retained (NULL for new orders, historical values preserved)
- `orders.specs` JSONB now stores `{ "base_plate_color": "..." }` — extensible for future spec fields

---

## 6. Verification Checklist

```
After deploying code:
  [ ] Open Order Create (#/orders/new)
      Verify: No "喷砂类型" dropdown
      Verify: "板底颜色" text input present with placeholder "如 黑色喷漆、白底"
  [ ] Create a test order with 板底颜色 = "黑色喷漆"
      Verify: Order card shows spec: "太阳纹+银白60s+黑色喷漆"
      Verify: Order detail shows same spec
  [ ] Create a test order with 板底颜色 empty
      Verify: Order card shows spec: "太阳纹+银白60s" (no trailing +)
      Verify: specs column in DB: {} (empty JSONB object)
  [ ] Query existing orders (with old sand_type values)
      Verify: specText still renders correctly (sand_type data preserved in DB, just not shown)
```

---

## 7. Why No Schema Change

| Concern | Resolution |
|---------|------------|
| `sand_type` column becomes dead | Kept. NULLable, no harm. Can be dropped in a future cleanup migration if needed. |
| `base_plate_color` needs storage | `specs JSONB` was designed exactly for this — Phase 0-A.2 reserved it for "extra spec params the three fixed fields can't hold" |
| Rollback | Trivial: revert 5 files, no DB migration to undo |

---

> **App-layer only. No SQL to run. Push code. Verify.**
