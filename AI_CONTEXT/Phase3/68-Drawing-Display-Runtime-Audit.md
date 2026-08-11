# Phase 3-D · Drawing Display Runtime Audit

> **Date:** 2026-08-07
> **Type:** Audit Only — No Code Changes
> **Trigger:** Trial user reports drawing not showing on order detail page after upload
> **Predecessor:** [67-Phase3D-Trial-Blocking-Fix.md](AI_CONTEXT/Phase3/67-Phase3D-Trial-Blocking-Fix.md)
> **Smoke Test Reference:** [63-Drawing-Attachment-Smoke-Test.md](AI_CONTEXT/Phase3/63-Drawing-Attachment-Smoke-Test.md)

---

## 0. Executive Summary

**Overall Verdict:** ⚠️ **2 P0 root-cause defects found. 1 P0 gap identified. Upload chain has 3 failure points.**

| # | Severity | Finding | Impact |
|:--:|:--------:|---------|--------|
| P0-1 | 🔴 Critical | `file.type` can be `''` — MIME-only check rejects valid files | Upload silently fails at validation |
| P0-2 | 🔴 Critical | `loadDrawing()` not called after complex `renderFull()` | Drawing disappears after rework/append |
| P0-3 | 🟠 Gap | Browser smoke test never executed | UI upload flow completely untested |
| P1-1 | 🟡 Medium | `escapeHTML()` on signed URLs | Semantically incorrect, fragile |
| P1-2 | 🟡 Medium | Image detection via filename regex, not MIME | `.jfif`/`.jpe` files render as PDF card |
| P1-3 | 🟡 Medium | `backToStep1()` silently clears `drawingFile` | User loses file selection without warning |
| P2-1 | 🟢 Low | Duplicate MIME validation | Maintenance risk only |
| P2-2 | 🟢 Low | `accept` attribute format | Cosmetic |
| P2-3 | 🟢 Low | No upload progress feedback | UX papercut |

---

## 1. Upload Chain Audit

### 1.1 Chain Trace

```
User selects file in Step 1
  → onDrawingSelected(input)                    [order-create.js:280-294]
  → StorageAPI.validateFile(file)                [storage.js:132-143]
  → drawingFile = file (in-memory)               [order-create.js:291]

User clicks "下一步"
  → goToStep2()                                  [order-create.js:140-186]
  → Reads drawingFile from DOM (redundant)       [order-create.js:154-157]
  → renderStep2() destroys Step 1 DOM            [order-create.js:185]
  → drawingFile survives as JS File object       ✅

User clicks "创建订单"
  → submitOrder()                                [order-create.js:299-332]
  → OrderCreate.submit() → INSERT order          [order-create.js:44-65]
    specs = { base_plate_color, customer_order_no, production_no }
    NO drawing fields at this point              ⚠️
  → StorageAPI.uploadDrawing(orderId, file)       [storage.js:22-83]
    → MIME check: ALLOWED_TYPES.includes(file.type)  [storage.js:27-29]
    → Upload to drawings/{orderId}/{ts}-{name}   [storage.js:40-46]
    → SELECT specs FROM orders WHERE id=?         [storage.js:56-58]
    → UPDATE orders SET specs = { ...old, drawing_name, drawing_path }  [storage.js:73-75]
  → Router.navigate('/orders/' + orderId)        [order-create.js:327]

ORDER DETAIL PAGE LOADS
  → render(orderId)                              [order-detail.js:12-50]
  → OrdersAPI.getById(orderId) → order.specs    [order-detail.js:22]
  → renderFull(container) → innerHTML            [order-detail.js:52-106]
    Includes <div id="drawing-content"></div>     ✅
  → loadDrawing(order)                           [order-detail.js:654-718]
  → Reads order.specs.drawing_path               [order-detail.js:659]
  → StorageAPI.getDrawingUrl(path)               [storage.js:93-119]
  → Renders image preview or PDF card            [order-detail.js:684-718]
```

### 1.2 Step-by-Step Results

| # | Step | Status | Detail |
|:--:|------|:------:|--------|
| 1 | File input captured | ⚠️ CONDITIONAL | Depends on `file.type` matching `ALLOWED_TYPES` |
| 2 | Upload triggered after creation | ✅ PASS | `await StorageAPI.uploadDrawing()` before `Router.navigate()` |
| 3 | Upload returns success | ✅ PASS | Error path returns `{ ok: false }`, handled by caller |
| 4 | File path returned | ✅ PASS | `uploadData?.path` with fallback to constructed path |
| 5 | Drawing metadata merged | ✅ PASS | `{ ...currentSpecs, drawing_name, drawing_path }` |

**Upload Chain Verdict:** ⚠️ **CONDITIONAL PASS** — Step 1 is the bottleneck

### 1.3 Detailed Finding: MIME-Only Validation (P0-1)

**Location:** [js/data/storage.js:27](js/data/storage.js#L27) and [js/data/storage.js:136](js/data/storage.js#L136)

```javascript
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

// In validateFile():
if (!ALLOWED_TYPES.includes(file.type)) {   // ← file.type can be ''
  return { valid: false, error: '仅支持 PDF / PNG / JPEG 格式' };
}

// In uploadDrawing():
if (!ALLOWED_TYPES.includes(file.type)) {   // ← same check, same bug
  return { ok: false, error: '仅支持 PDF / PNG / JPEG 格式' };
}
```

**Problem:** When the browser cannot determine a file's MIME type, `file.type` returns an empty string `''`. Common scenarios:

| Scenario | `file.type` | Passes? |
|----------|:-----------:|:-------:|
| Normal `.jpg` from camera | `image/jpeg` | ✅ |
| Normal `.png` screenshot | `image/png` | ✅ |
| Normal `.pdf` file | `application/pdf` | ✅ |
| **Image from WeChat "Save As"** | **`''` (varies)** | **❌** |
| **Image without extension** | **`''`** | **❌** |
| **File with corrupted header** | **`''`** | **❌** |
| **`.jfif` / `.jpe` files** | **`''` or `image/jpeg`** | **varies** |
| **Some browser/OS combos** | **unexpected values** | **❌** |

**User Experience:**
1. User selects file → `onchange` fires → `validateFile()` → **rejected silently** (Toast shows briefly)
2. File input is cleared (`input.value = ''`)
3. `drawingFile` is set to `null`
4. If the user doesn't notice the Toast: they proceed without a drawing
5. If the user does notice: error says "仅支持 PDF / PNG / JPEG 格式" but the file IS a JPEG — confusing

**Root Cause Chain:**
```
WeChat Save As → OS strips MIME metadata → Browser reports file.type = '' →
JS rejects valid JPEG → drawingFile = null → upload skipped →
order detail shows "无图纸"
```

### 1.4 Specs Overwrite Risk Analysis

**Only 2 code paths write to `orders.specs`:**

| # | Location | Operation | Merge Pattern | Safe? |
|:--:|----------|-----------|---------------|:-----:|
| 1 | [js/domain/order-create.js:56-60](js/domain/order-create.js#L56-L60) | INSERT new order | Constructs new `specs` with 3 keys | ✅ (initial write) |
| 2 | [js/data/storage.js:65-75](js/data/storage.js#L65-L75) | UPDATE after upload | `{ ...currentSpecs, drawing_name, drawing_path }` | ✅ (spread preserves all) |

**No other code modifies `specs`.** Confirmed by grep: 0 additional `.update({ specs:` matches.

**Verdict:** ✅ **NO overwrite risk.** Drawing metadata is safe once written.

---

## 2. Database Audit

### 2.1 Schema Verification

| Field | Type | Default | Constraint |
|-------|------|---------|------------|
| `orders.specs` | `JSONB` | `'{}'::jsonb` | None (free-form) |

### 2.2 Expected Data Shape (After Successful Upload)

```json
{
  "base_plate_color": "黑色喷漆",
  "customer_order_no": "PO-2026-0807",
  "production_no": "DF20260807143022",
  "drawing_name": "微信图片_20260807143022.jpg",
  "drawing_path": "a1b2c3d4-.../1691400000000-微信图片_20260807143022.jpg"
}
```

### 2.3 Query Verification

`OrdersAPI.getById()` includes `specs` in select list:
```javascript
// [js/data/orders.js:54]
.select('id,order_no,...,specs,route_snapshot,status,...')
```

`OrdersAPI.list()` includes `specs`:
```javascript
// [js/data/orders.js:30]
const ORDER_LIST_COLS = 'id,order_no,...,specs,status,...';
```

**Verdict:** ✅ **PASS** — `specs` is fetched in all query paths.

---

## 3. Storage Audit

### 3.1 Bucket Configuration

| Property | Value | Verified |
|----------|-------|:--------:|
| Name | `drawings` | ✅ Smoke test T1 |
| Public | `false` (private) | ✅ Smoke test T4 |
| Max size | 10 MiB | ✅ SDK config + bucket config |
| MIME types | `application/pdf`, `image/png`, `image/jpeg` | ✅ Bucket config |
| RLS policy | `USING (true)` on `storage.objects` | ✅ Smoke test |

### 3.2 File Path Format

```
drawings/{orderId}/{timestamp}-{safeFilename}
```

Example: `drawings/a1b2c3d4-e5f6-7890-abcd-ef1234567890/1691400000000-微信图片_20260807.jpg`

### 3.3 Potential Path Issues

| Issue | Detail | Risk |
|-------|--------|:----:|
| Chinese chars in filename | `safeName` only strips `[\\/:*?"<>|]` — Chinese chars preserved | 🟢 Low (Supabase supports UTF-8) |
| Very long filenames | No length check on `file.name` | 🟢 Low (OS limits < 255 chars) |
| Special chars not in denylist | e.g. `#`, `%`, `+` survive `safeName` | 🟡 Medium (URL encoding needed) |
| Timestamp collision | `Date.now()` — two uploads in 1ms overlap | 🟢 Extremely unlikely |

### 3.4 File Extension Test Matrix

| Extension | MIME Type (browser) | JS Validation | Upload | Display Branch |
|-----------|---------------------|:---:|:---:|:---:|
| `.png` | `image/png` | ✅ | ✅ | Image preview |
| `.jpg` | `image/jpeg` | ✅ | ✅ | Image preview |
| `.jpeg` | `image/jpeg` | ✅ | ✅ | Image preview |
| `.pdf` | `application/pdf` | ✅ | ✅ | PDF card |
| `.JPG` | `image/jpeg` | ✅ | ✅ | Image preview (`/i` regex) |
| `.jfif` | `''` or `image/jpeg` | varies | varies | **PDF card** (no regex match) |
| `.jpe` | `image/jpeg` | ✅ | ✅ | **PDF card** (no regex match) |
| `.webp` | `image/webp` | **❌** | **❌** | N/A (rejected) |
| `.bmp` | `image/bmp` | **❌** | **❌** | N/A (rejected) |
| `.gif` | `image/gif` | **❌** | **❌** | N/A (rejected) |
| No extension | `''` (empty) | **❌** | **❌** | N/A (rejected) |

**Verdict:** ⚠️ **PASS for standard types. FAIL for edge cases.** The `.webp` gap is notable — WeChat frequently uses WebP format.

---

## 4. Signed URL Audit

### 4.1 Flow Trace

```javascript
// [js/pages/order-detail.js:672]
const result = await StorageAPI.getDrawingUrl(drawingPath);

// [js/data/storage.js:93-119]
async function getDrawingUrl(storedPath) {
    // Path A: Signed URL (24h TTL)
    const { data: signedData, error: signedError } = await db.storage
      .from(BUCKET)
      .createSignedUrl(storedPath, SIGNED_URL_TTL);   // 86400s

    if (!signedError && signedData?.signedUrl) {
      return { ok: true, data: signedData.signedUrl, type: 'signed' };
    }

    // Path B: Blob download fallback
    const { data: blob, error: dlError } = await db.storage
      .from(BUCKET)
      .download(storedPath);

    if (dlError) {
      return { ok: false, error: dlError.message };
    }

    const objectUrl = URL.createObjectURL(blob);
    return { ok: true, data: objectUrl, type: 'blob' };
}
```

### 4.2 Check Results

| Check | Status | Detail |
|-------|:------:|--------|
| URL generated | ✅ | `createSignedUrl` with 24h TTL |
| Expiry handling | ✅ | Regenerated each page load (not cached) |
| Error → silent fail | ✅ | Falls back to blob download |
| Promise awaited | ✅ | `await StorageAPI.getDrawingUrl(drawingPath)` |
| File not found | ✅ | Returns `{ ok: false, error }` → error message displayed |

**Verdict:** ✅ **PASS**

---

## 5. Frontend Display Audit

### 5.1 Rendering Flow

```
render()                                         [order-detail.js:13]
  → renderFull(container)                        [order-detail.js:52]
    → container.innerHTML = "<div id='drawing-section'>...</div>"
    → #drawing-content is empty <div>            ⚠️ populated later
  → loadDrawing(order)                            [order-detail.js:654]
    → document.getElementById('drawing-content')
    → If no path: "无图纸"
    → If path: StorageAPI.getDrawingUrl() → render image or PDF card
```

### 5.2 Drawing Section Presence

| Condition | Before Fix #3 | After Fix #3 |
|-----------|:---:|:---:|
| Order has drawing | Section visible with preview | Section visible with preview |
| Order has no drawing | Section **hidden** | Section visible with "无图纸" |
| Complex op (rework) | ❓ | **#drawing-content empty** (bug P0-2) |

### 5.3 Image Detection Logic

```javascript
// [js/pages/order-detail.js:682]
const isImageFile = drawingName.match(/\.(png|jpg|jpeg|webp)$/i);
```

| Filename | Match? | Renders As | Correct? |
|----------|:------:|------------|:--------:|
| `photo.jpg` | ✅ | Image preview | ✅ |
| `photo.jpeg` | ✅ | Image preview | ✅ |
| `photo.png` | ✅ | Image preview | ✅ |
| `photo.webp` | ✅ | Image preview | ✅ |
| `photo.JPG` | ✅ (`/i`) | Image preview | ✅ |
| `photo.jfif` | ❌ | **PDF card** | ❌ |
| `photo.jpe` | ❌ | **PDF card** | ❌ |
| `photo.PNG` | ✅ (`/i`) | Image preview | ✅ |
| `微信图片_001` | ❌ | **PDF card** | ❌ (no extension) |
| `PHOTO` | ❌ | **PDF card** | ❌ (no extension) |

**Verdict:** ⚠️ **PASS for common extensions. FAIL for extension-less or uncommon extensions.**

### 5.4 URL Escaping Analysis (P1-1)

```javascript
// [js/pages/order-detail.js:695-698]
<img src="${escapeHTML(url)}" ...>

// escapeHTML converts: & → &amp;
```

Supabase signed URLs contain `&` as query parameter separator:
```
https://wzfkmwrqnvjegunjueka.supabase.co/storage/v1/object/sign/drawings/...?token=xxx&expires=123456
```

After `escapeHTML`: `token=xxx&amp;expires=123456`

**Analysis:** Browsers decode `&amp;` → `&` when parsing HTML attributes, so the actual URL used is correct. However:

- This is semantically wrong: `escapeHTML` is for text content, not attribute URLs
- If the URL contains characters like `"` or `'`, they'd be unnecessarily escaped
- Some URL schemes (data:, blob:) could behave differently with escaped entities
- A future refactor might break this by changing escaping behavior

**Verdict:** ⚠️ Not currently broken, but fragile. Use dedicated URL encoding, not HTML escaping.

---

## 6. Browser Runtime Audit

### 6.1 Script Loading Order

From [index.html:72-96](index.html#L72-L96):

```
client.js → processes.js → orders.js → storage.js → customers.js →
exceptions.js → order-state.js → node-state.js → validation.js →
seq-calc.js → node-actions.js → order-create.js → ... →
order-detail.js → order-create.js
```

`storage.js` loads at position 4 — before all page modules that call it (`order-create.js` at position 14, `order-detail.js` at position 13).

**Verdict:** ✅ **PASS** — `storage.js` is loaded before all consumers.

### 6.2 Potential Runtime Issues

| Issue | Analysis | Risk |
|-------|----------|:----:|
| Old cached JS | No build tools/hashing — browser may cache old `.js` files | 🟡 Medium |
| Async timing | `loadDrawing` is async but not in `Promise.all` — runs after `renderFull` synchronously sets innerHTML | ✅ Fine |
| `drawingFile` across steps | File reference survives DOM re-render (captured before `renderStep2`) | ✅ Fine |
| `Router.navigate` timing | `uploadDrawing` is awaited before navigate — specs update completes first | ✅ Fine |
| `loadDrawing` after complex op | **NOT called** — `handleActionResult` → `renderFull` but no `loadDrawing` | 🔴 P0-2 |

### 6.3 Console Errors Expected

If P0-1 triggers (file rejected):
```
(none — Toast.warning shows, no console.error)
```

If P0-2 triggers (complex op):
```
(none — drawing section silently empty, no error)
```

If signed URL fails:
```
[Storage] Signed URL failed, falling back to download: <message>
```

**Verdict:** ⚠️ Both P0 defects fail **silently** — no console errors to aid debugging.

---

## 7. Comparison with Smoke Test

### 7.1 Smoke Test Results (63-Drawing-Attachment-Smoke-Test.md)

| Test | Method | Result |
|------|--------|:------:|
| T1 — Upload valid PDF | REST API direct | ✅ PASS (after bucket creation) |
| T2 — Create order without drawing | REST API direct | ✅ PASS |
| T3 — Upload failure doesn't block | REST API direct | ✅ PASS |
| T4 — Private bucket access | REST API direct | ✅ PASS |
| T5 — Specs merge preservation | REST API direct | ✅ PASS |

**All 5 tests used the REST API directly, NOT the browser UI.**

### 7.2 Uncompleted Tests

From [63-Drawing-Attachment-Smoke-Test.md:218-223](AI_CONTEXT/Phase3/63-Drawing-Attachment-Smoke-Test.md#L218-L223):

```
[ ] Browser smoke test:
    [ ] Create order with PNG → verify thumbnail on detail page
    [ ] Create order with PDF → verify download card on detail page
    [ ] Create order without drawing → verify no drawing section
    [ ] Signed URL refreshes on page reload
```

**These 4 browser tests were NEVER executed.** The entire UI upload flow (file input → `onDrawingSelected` → `goToStep2` → `submitOrder` → `uploadDrawing` → `loadDrawing`) was tested at the API layer only.

### 7.3 Changes Since Smoke Test

| Commit/Change | Files Affected | Potential Impact |
|---------------|----------------|------------------|
| `c67e232` — short_name support | `customers.js`, dashboard | None (unrelated) |
| `532cd3b` — CSV trial log | New files | None (unrelated) |
| **Uncommitted: Fix #3** | `order-detail.js` | Drawing section always visible; `loadDrawing` calls unchanged |
| **Uncommitted: Fix #4** | `order-detail.js` | Partial DOM updates; complex path **forgot** `loadDrawing` call |

**The uncommitted Trial Blocking Fix (67) introduced the P0-2 defect** — the partial DOM update optimization split `handleActionResult` into simple/complex paths, and the complex path that calls `renderFull()` does NOT call `loadDrawing()` afterward, unlike the initial `render()` which does.

### 7.4 Git Blame of Key Changes

```
[js/pages/order-detail.js] render():
  + loadDrawing(order);                    ← Added in Fix #3 (uncommitted)

[js/pages/order-detail.js] handleActionResult():
  if (isComplex) {
    renderFull(...);                       ← Was: always renderFull
    // No loadDrawing() call!              ← Bug: old code also didn't call it,
  }                                           but old code always did full render
                                              + loadDrawing was in render() only
```

**Note:** The missing `loadDrawing()` call is NOT a regression from Fix #3 — the OLD code also didn't call `loadDrawing` after `renderFull` in `handleActionResult`. The old `handleActionResult` always called `renderFull()` and never called `loadDrawing()`. However, the old drawing section was conditionally rendered (only when drawing existed), so the bug was less visible. Fix #3 made the drawing section permanent, which makes the bug more apparent.

---

## 8. Root Cause Ranking

### P0-1: MIME-Only File Validation Rejects Valid Files 🔴

- **File:** [js/data/storage.js:27](js/data/storage.js#L27), [js/data/storage.js:136](js/data/storage.js#L136)
- **Cause:** `ALLOWED_TYPES.includes(file.type)` — `file.type` can be `''` for files the browser can't classify
- **Trigger:** WeChat "Save As" images, files without extensions, some browser/OS combinations
- **Effect:** Valid JPEG/PNG/PDF files rejected at validation. User sees misleading error "仅支持 PDF / PNG / JPEG 格式"
- **Reproduction:** Save any image from WeChat desktop, attempt upload. If `file.type === ''`, it fails.

### P0-2: `loadDrawing()` Not Called After Complex `renderFull()` 🔴

- **File:** [js/pages/order-detail.js:421](js/pages/order-detail.js#L421)
- **Cause:** `handleActionResult` complex path calls `renderFull()` (which resets `#drawing-content` to empty `<div>`) but never calls `loadDrawing(currentOrder)` afterward
- **Trigger:** Any rework, append, segment rework, or undo action
- **Effect:** Drawing section shows "📎 图纸" label with empty content area. Drawing disappears from view (still in DB).
- **Reproduction:** Create order with drawing → go to detail (drawing visible) → click "返工" on any node → drawing section becomes empty.

### P0-3: Browser End-to-End Smoke Test Never Executed 🟠

- **File:** [63-Drawing-Attachment-Smoke-Test.md:218-223](AI_CONTEXT/Phase3/63-Drawing-Attachment-Smoke-Test.md#L218-L223)
- **Cause:** All 5 smoke tests used REST API directly; 4 browser UI tests were never checked off
- **Effect:** The UI upload flow (file input → JS validation → upload → specs update → display) was never tested as a complete chain in a browser
- **Note:** This is a process gap, not a code defect. It explains why the P0-1 and P0-2 defects were not caught.

### P1-1: `escapeHTML()` Applied to Signed URLs 🟡

- **File:** [js/pages/order-detail.js:691-698](js/pages/order-detail.js#L691-L698)
- **Cause:** `escapeHTML(url)` on `href` and `src` attributes converts `&` → `&amp;`
- **Effect:** Not currently broken (browsers decode entity references in attributes), but semantically incorrect and fragile
- **Fix:** Use URL directly (no escaping needed for URLs from trusted source — Supabase SDK)

### P1-2: Image Detection Uses Filename Extension, Not MIME 🟡

- **File:** [js/pages/order-detail.js:682](js/pages/order-detail.js#L682)
- **Cause:** `drawingName.match(/\.(png|jpg|jpeg|webp)$/i)` — regex on filename string
- **Effect:** `.jfif`, `.jpe`, extension-less image files render as PDF card instead of image preview
- **Fix:** Use `StorageAPI.isImage()` or check the signed URL response content-type

### P1-3: `backToStep1()` Silently Clears `drawingFile` 🟡

- **File:** [js/pages/order-create.js:13-18](js/pages/order-create.js#L13-L18)
- **Cause:** `render()` unconditionally sets `drawingFile = null`
- **Effect:** If user selects a file, goes to Step 2, then clicks "← 返回修改", the file selection is lost. User must re-select the file. If they forget, no drawing is uploaded.
- **Fix:** Preserve `drawingFile` across step transitions, or show a warning before navigating back.

### P2-1: Duplicate MIME Validation 🟢

- **Files:** [js/data/storage.js:27](js/data/storage.js#L27) and [js/data/storage.js:136](js/data/storage.js#L136)
- **Cause:** Same `ALLOWED_TYPES.includes(file.type)` check in both `validateFile` and `uploadDrawing`
- **Effect:** Maintenance risk — changing one but not the other

### P2-2: `accept` Attribute Format 🟢

- **File:** [js/pages/order-create.js:116](js/pages/order-create.js#L116)
- **Cause:** `accept=".pdf,.png,.jpg,.jpeg"` — irregular syntax
- **Effect:** Cosmetic. Browsers handle both extension and MIME formats.

### P2-3: No Upload Progress Indicator 🟢

- **File:** [js/pages/order-create.js:317-325](js/pages/order-create.js#L317-L325)
- **Effect:** User clicks "创建订单" and sees "创建中..." — no indication that a file upload is happening (could take seconds for large files)

---

## 9. Recommended Fixes

> ⚠️ **DO NOT IMPLEMENT.** These are recommendations only. Trial freeze is in effect.

### Fix for P0-1: Add Extension-Based Fallback to MIME Validation

```javascript
// storage.js — replace strict MIME check with hybrid check
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];

function isAllowedFile(file) {
  // Primary: MIME type
  if (ALLOWED_TYPES.includes(file.type)) return true;
  // Fallback: extension (handles empty file.type)
  const ext = '.' + (file.name || '').split('.').pop().toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}
```

**Risk:** Low. Extension check is less reliable than MIME but better than rejecting valid files.
**Impact:** Eliminates the #1 cause of silent upload failures.

### Fix for P0-2: Call `loadDrawing()` After Complex `renderFull()`

```javascript
// order-detail.js handleActionResult — complex path
if (isComplex) {
  // ... existing code ...
  renderFull(document.getElementById('page-container'));
  loadDrawing(currentOrder);  // ← ADD THIS LINE
}
```

**Risk:** None. Pure additive — restores drawing display after structural changes.
**Impact:** Drawing survives rework/append/undo operations.

### Fix for P1-1: Remove `escapeHTML` from URLs

```javascript
// order-detail.js loadDrawing — use URL directly
<a href="${url}" target="_blank" rel="noopener">  // not escapeHTML(url)
<img src="${url}" ...>                             // not escapeHTML(url)
```

**Risk:** Low. URLs from Supabase SDK are trusted (not user input).
**Impact:** Eliminates fragile HTML-entity-in-URL pattern.

### Fix for P1-3: Preserve `drawingFile` Across Step Navigation

```javascript
// order-create.js backToStep1
function backToStep1() {
  step = 1;
  const savedDrawingFile = drawingFile;  // preserve
  render();
  drawingFile = savedDrawingFile;        // restore
}
```

**Risk:** Low. The file input in Step 1 shows "已选择: filename" when `drawingFile` is set.
**Impact:** Users can go back and forth between steps without losing their file selection.

---

## 10. Deployment Checklist

Before re-enabling the drawing feature for factory trial:

```
[ ] P0 Fix: Extension fallback for file type validation
[ ] P0 Fix: loadDrawing() after complex renderFull()
[ ] P1 Fix: Remove escapeHTML from URLs
[ ] P1 Fix: Preserve drawingFile across backToStep1
[ ] Browser Test: Create order with JPEG → verify preview on detail page
[ ] Browser Test: Create order with PNG → verify preview on detail page
[ ] Browser Test: Create order with PDF → verify "查看" card on detail page
[ ] Browser Test: Create order without drawing → verify "无图纸" shown
[ ] Browser Test: Rework node → verify drawing still visible
[ ] Browser Test: WeChat saved image → verify upload succeeds
[ ] Browser Test: File without extension → verify rejection with clear message
[ ] Browser Test: Signed URL on page reload → verify drawing still loads
[ ] Console check: No JS errors in any drawing flow
```

---

## 11. Summary

```
Upload Chain:      ⚠️ CONDITIONAL PASS (1 bottleneck)
Database:          ✅ PASS
Storage:           ✅ PASS
Signed URL:        ✅ PASS
Frontend Display:  ⚠️ FAIL (2 P0 defects)

Root Cause:        P0-1: file.type empty rejection
                   P0-2: loadDrawing missing after complex ops

Why not caught:    Browser smoke test never executed (P0-3)

Fix effort:        ~10 lines across 2 files
                   Zero schema changes
                   Zero new dependencies
```

---

> **Audit complete. No code was changed.**
>
> **试运行冻结期间 — 仅建议，不实施。**
