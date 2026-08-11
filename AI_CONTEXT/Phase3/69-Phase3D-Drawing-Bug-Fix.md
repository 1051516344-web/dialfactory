# Phase 3-D · Drawing Bug Fix

> **Date:** 2026-08-07
> **Status:** Code Complete — Ready for Browser Verification
> **Audit:** [68-Drawing-Display-Runtime-Audit.md](AI_CONTEXT/Phase3/68-Drawing-Display-Runtime-Audit.md)
> **Based on:** Runtime audit — two P0 defects identified
> **Type:** Trial blocking bug fix

---

## Executive Summary

Two P0 drawing defects fixed. 2 files changed. 0 schema changes.

| Fix # | Root Cause | Resolution | Lines |
|:-----:|------------|-----------|:-----:|
| 1 | `file.type` can be `''` — MIME-only check rejects valid files | Hybrid validation: MIME + extension fallback | +14/-4 |
| 2 | `loadDrawing()` not called after complex `renderFull()` | Call `loadDrawing(currentOrder)` after full DOM rebuild | +1 |

---

## Fix 1: MIME Validation — Extension Fallback

### Root Cause

`[js/data/storage.js:27]` and `[js/data/storage.js:136]` — The `ALLOWED_TYPES.includes(file.type)` check rejects files when `file.type === ''`. Browsers return empty MIME type for files without detectable type metadata — common with WeChat "Save As", certain downloads, and files with uncommon extensions.

### Implementation

New helper `isAllowedFileType(file)` replaces the strict MIME-only check:

```
Validation order:
  1. Check MIME type against ALLOWED_TYPES (primary)
  2. If MIME check fails: fallback to file extension check
```

**Allowed extensions:** `pdf`, `png`, `jpg`, `jpeg`

**Used in:**
- `validateFile(file)` — client-side pre-check on file selection
- `uploadDrawing(orderId, file)` — server-side pre-upload check

### Files Changed

| File | Change | Lines |
|------|--------|:-----:|
| [js/data/storage.js](js/data/storage.js) | Added `ALLOWED_EXTENSIONS`, `isAllowedFileType()` helper | +11 |
| [js/data/storage.js](js/data/storage.js) | Replaced `ALLOWED_TYPES.includes()` in `uploadDrawing()` | +1/-1 |
| [js/data/storage.js](js/data/storage.js) | Replaced `ALLOWED_TYPES.includes()` in `validateFile()` | +1/-1 |
| [js/data/storage.js](js/data/storage.js) | Updated public API export | +1/-1 |

### Before vs After

| Scenario | Before | After |
|----------|:------:|:-----:|
| Normal JPEG (`file.type = 'image/jpeg'`) | ✅ Pass | ✅ Pass |
| Normal PNG (`file.type = 'image/png'`) | ✅ Pass | ✅ Pass |
| Normal PDF (`file.type = 'application/pdf'`) | ✅ Pass | ✅ Pass |
| **WeChat JPEG (`file.type = ''`)** | **❌ Rejected** | **✅ Pass (extension `.jpg`)** |
| **File no extension (`file.type = ''`)** | **❌ Rejected** | **❌ Rejected (no ext match)** |
| Executable (`.exe`, any MIME) | ❌ Rejected | ❌ Rejected |

---

## Fix 2: Drawing Disappears After Complex Actions

### Root Cause

`[js/pages/order-detail.js:421]` — `handleActionResult()` complex path calls `renderFull()` which destroys and recreates `#drawing-content` as an empty `<div>`, but never calls `loadDrawing()` to repopulate it.

The initial page render in `render()` correctly calls both:
```javascript
renderFull(container);
loadDrawing(order);   // ← Populates drawing section
```

But `handleActionResult()` only calls:
```javascript
renderFull(document.getElementById('page-container'));
// loadDrawing() NOT called ← BUG
```

### Implementation

Added `loadDrawing(currentOrder)` after `renderFull()` in the complex path:

```javascript
renderFull(document.getElementById('page-container'));
loadDrawing(currentOrder);   // ← ADDED: repopulate drawing after DOM rebuild
```

### Files Changed

| File | Change | Lines |
|------|--------|:-----:|
| [js/pages/order-detail.js](js/pages/order-detail.js) | Add `loadDrawing(currentOrder)` after complex `renderFull()` | +1 |

---

## Files Changed Summary

| File | Additions | Deletions | Net |
|------|:---------:|:---------:|:---:|
| [js/data/storage.js](js/data/storage.js) | +13 | -2 | +11 |
| [js/pages/order-detail.js](js/pages/order-detail.js) | +1 | 0 | +1 |
| **Total** | **+14** | **-2** | **+12** |

---

## Freeze Compliance

```
Schema:      0 changes — 8 tables, 59 fields
Columns:     0 added, 0 removed, 0 altered
Migrations:  0
FK:          6 RESTRICT, 3 SET NULL, 1 NO FK, 0 CASCADE (unchanged)
RLS:         USING (true) on all tables (unchanged)
Storage:     drawings bucket (unchanged)
ADL:         No violation
Features:    0 new
Workflow:    0 changes
UI:          No redesign — same layout, same labels, same behavior
```

---

## Phase 3C Feature Impact

| Phase 3C Feature | Status | Notes |
|------------------|:------:|-------|
| Dashboard (P1) | ✅ Unaffected | No changes to dashboard.js |
| Order List (P2) | ✅ Unaffected | No changes to order-list.js |
| Order Create (P3) | ✅ Enhanced | File validation now accepts more valid files |
| Order Detail (P4) | ✅ Enhanced | Drawing survives all node operations |
| Route List (P5) | ✅ Unaffected | No changes |
| Exception List (P6) | ✅ Unaffected | No changes |
| All node actions | ✅ Unaffected | `loadDrawing` call is additive only |
| Drawing upload | ✅ Enhanced | Extension fallback for WeChat images |
| Drawing display | ✅ Enhanced | Persists after rework/append/undo |

---

## Verification Checklist

```
[ ] Browser Test A — Upload PNG from desktop
    [ ] Open "新建订单"
    [ ] Select a .png file from desktop
    [ ] Fill required fields, select processes, submit
    [ ] Order detail shows "📎 图纸" with image preview + download link
    [ ] Image thumbnail loads correctly

[ ] Browser Test B — WeChat saved JPEG
    [ ] Save a WeChat image to desktop (typically .jpg)
    [ ] Open "新建订单", select the WeChat image
    [ ] No Toast rejection ("仅支持 PDF / PNG / JPEG 格式")
    [ ] Submit order
    [ ] Order detail shows image preview

[ ] Browser Test C — Drawing survives actions
    [ ] Open an order that has a drawing attachment
    [ ] Verify drawing is visible
    [ ] Click "完成" / "暂停" on a node (simple action)
    [ ] Verify drawing remains visible
    [ ] Click "返工" on a node (complex action)
    [ ] Verify drawing remains visible (was P0-2)
    [ ] Click "追加工序" on a node (complex action)
    [ ] Verify drawing remains visible
    [ ] Click "撤销" on a node (complex action)
    [ ] Verify drawing remains visible

[ ] Browser Test D — No drawing order
    [ ] Create order without selecting a drawing file
    [ ] Order detail shows "📎 图纸" label
    [ ] Drawing content shows "无图纸"
    [ ] No console errors

[ ] Browser Test E — Console check
    [ ] Open DevTools Console
    [ ] Perform all above tests
    [ ] No red errors
    [ ] No [Storage] warnings (unless network issue)
```

---

## Deployment Notes

1. Both changes are client-side JS only. No Supabase migration required.
2. Deploy by replacing `js/data/storage.js` and `js/pages/order-detail.js` on the web server.
3. Browser cache: users may need to hard-refresh (Ctrl+Shift+R) to load updated JS files.
4. Existing orders with drawing attachments are unaffected — `loadDrawing()` reads from `specs.drawing_path` as before.
5. No bucket/RLS changes. No schema changes.

---

> **Code complete. Awaiting browser verification.**
>
> **试运行继续进行。第一周回顾：2026-08-14.**
