# Phase 3-D · Base Texture Input Revision

> **Status:** Complete — 2 files, 0 schema changes
> **Type:** UI-only revision (enum → datalist)
> **Predecessor:** [59-Order-Specification-Audit.md](AI_CONTEXT/Phase3/59-Order-Specification-Audit.md) §4.1

---

## 1. Requirement Change

| Aspect | Before | After |
|--------|--------|-------|
| Input type | `<select>` fixed enum | `<input>` + `<datalist>` |
| Options | 无底纹, 太阳纹, CD纹 (hard) | 无底纹, 太阳纹, 直线纹 (suggestions) |
| Custom value | ❌ Blocked | ✅ Free text |
| Column | `orders.base_texture TEXT` | Same |
| Validation | None | None (same) |

**Business reason:** CD纹 was incorrect — the factory's actual common textures are 无底纹, 太阳纹, 直线纹. However, customer drawings may specify special textures (特殊拉丝, CD纹, 客户指定纹路). Trial phase goal is data accumulation — after enough real orders, analyze frequency and decide whether to formalize options.

---

## 2. UI Behavior

```
┌──────────────────────────────────────┐
│ 底质纹理                              │
│ ┌──────────────────────────────────┐ │
│ │ 太_  ← user types freely         │ │
│ └──────────────────────────────────┘ │
│ ┌─ datalist dropdown ──────────────┐ │
│ │ 太阳纹                            │ │  ← suggestion appears
│ └──────────────────────────────────┘ │
│                                      │
│ User can:                            │
│  • Click suggestion to autofill      │
│  • Type custom value (e.g. 特殊拉丝)  │
│  • Leave empty                       │
└──────────────────────────────────────┘
```

- **Placeholder:** `如 太阳纹、直线纹`
- **Suggestions:** 无底纹, 太阳纹, 直线纹 (from `CONFIG.TEXTURE_SUGGESTIONS`)
- **Constraint:** None. Any text is accepted.
- **Empty state:** Field is optional, empty → NULL in DB

---

## 3. Code Changes

### 3.1 [js/config.js](js/config.js#L61-62)

```diff
- // Texture options
- BASE_TEXTURES: ['无底纹', '太阳纹', 'CD纹'],
+ // Texture suggestions (datalist, not enum)
+ TEXTURE_SUGGESTIONS: ['无底纹', '太阳纹', '直线纹'],
```

### 3.2 [js/pages/order-create.js](js/pages/order-create.js) — 3 locations

**Build suggestion list (line 55):**
```diff
- const texOptions = CONFIG.BASE_TEXTURES.map(t => `<option value="${t}">${t}</option>`).join('');
+ const texSuggestions = CONFIG.TEXTURE_SUGGESTIONS.map(t => `<option value="${t}">`).join('');
```

**Replace `<select>` with `<input>` + `<datalist>` (lines 88-93):**
```diff
- <select id="form-texture" class="form-select"><option value="">—</option>${texOptions}</select>
+ <input type="text" id="form-texture" class="form-input" list="texture-suggestions"
+        placeholder="如 太阳纹、直线纹" value="${escapeHTML(formData.base_texture || '')}">
+ <datalist id="texture-suggestions">${texSuggestions}</datalist>
```

**Data collection unchanged (line 125):**
```js
formData.base_texture = document.getElementById('form-texture')?.value || '';
// Works identically for <select> and <input> — both expose .value
```

---

## 4. Data Compatibility Check

| Scenario | Existing Data | Behavior |
|----------|:---:|----------|
| Old orders with `CD纹` | ✅ | Displays as-is in specText. Not broken — just no longer a suggestion. |
| Old orders with `太阳纹` | ✅ | Displays as-is. Still a suggestion. |
| New order with `特殊拉丝` | ✅ | Stored to `base_texture` column. Displays correctly. |
| New order with `直线纹` | ✅ | Selected from datalist. Stored. Displays. |
| Empty | ✅ | NULL, excluded from specText. |

**No migration needed.** `base_texture` is `TEXT` nullable — any string value is valid.

---

## 5. Downstream Impact

| Layer | Impact |
|-------|--------|
| `js/domain/order-create.js` | None — reads `formData.base_texture \|\| null`, same path |
| `js/data/orders.js` | None — `.insert(orderData)` passes through unchanged |
| `js/pages/order-list.js` | None — `specText` reads `order.base_texture`, any value |
| `js/pages/order-detail.js` | None — same |
| Database | None — same column, same type |
| RLS | None |
| FK | None |

---

## 6. Trial Observation Hook

This field is now a **data collection instrument.** During trial, record:

```
Section 3 of 试运行记录表:
  [ ] 底质纹理自定义值出现频率:
      - 直线纹: ___ 次
      - CD纹: ___ 次
      - 特殊拉丝: ___ 次
      - 其他: _________
```

After 2-4 weeks of trial, run:
```sql
SELECT base_texture, COUNT(*) AS n
FROM orders
WHERE base_texture IS NOT NULL
GROUP BY base_texture
ORDER BY n DESC;
```

If a small set of values dominates (≥80% of orders), consider restoring a formal enum in V1.1. If the distribution is long-tail, free text stays.

---

## 7. Freeze Compliance

```
Schema:     No changes
Columns:    0 added, 0 removed, 0 altered
Fields:     59 (unchanged)
FK:         Unchanged
ADL:        No violation
```

---

> **Related:** [59-Order-Specification-Audit.md](AI_CONTEXT/Phase3/59-Order-Specification-Audit.md) — full field audit (this is §4.1 executed)
