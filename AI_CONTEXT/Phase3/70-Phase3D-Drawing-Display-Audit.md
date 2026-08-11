# Phase 3-D · Drawing Display Deep Audit

> **Date:** 2026-08-07
> **Type:** Audit Only — No Code Changes
> **Trigger:** "📎 图纸" label visible but no image/PDF preview/link rendered
> **Predecessor:** [69-Phase3D-Drawing-Bug-Fix.md](AI_CONTEXT/Phase3/69-Phase3D-Drawing-Bug-Fix.md)

---

## Executive Summary

**Root Cause:** Two `renderFull()` call sites are missing `loadDrawing()`, and `loadDrawing()` is fire-and-forget (never `await`ed), making errors invisible. The primary failure mode is: upload succeeds → specs stored → `renderFull()` creates empty `#drawing-content` → `loadDrawing()` silently fails.

| # | Severity | Finding | Symptom Match |
|:--:|:--------:|---------|:---:|
| P0-1 | 🔴 | 2 `renderFull()` sites missing `loadDrawing()` call | After recording exception / cancel |
| P0-2 | 🔴 | `loadDrawing()` not awaited — errors vanish into unhandled rejection | Any async failure |
| P0-3 | 🔴 | `loadDrawing()` element guard — silent no-op if DOM missing | Race condition on re-render |
| P0-4 | 🔴 | Upload failure silent if Toast missed before navigation | Primary initial visit |
| P1-1 | 🟡 | Image `onerror` hides broken image without visible fallback | Looks like "nothing shown" |
| P1-2 | 🟡 | `escapeHTML()` on signed URLs | Fragile URL handling |
| P2-1 | 🟢 | `backToStep1()` clears `drawingFile` without warning | User loses file selection |

---

## Audit 1 — Database Data Check

### 1.1 Specs Construction Chain

**Step A — OrderCreate.submit()** ([js/domain/order-create.js:49-60](js/domain/order-create.js#L49-L60))

```javascript
const orderData = {
    order_no: formData.order_no,
    // ...
    specs: {
        base_plate_color: formData.base_plate_color || null,
        customer_order_no: formData.customer_order_no || null,
        production_no: productionNo
        // ⚠️ NO drawing_name, NO drawing_path at INSERT time
    },
    // ...
};
const result = await OrdersAPI.createOrder(orderData, nodesData);
```

**Step B — StorageAPI.uploadDrawing()** ([js/data/storage.js:79-84](js/data/storage.js#L79-L84))

```javascript
// AFTER order creation, AFTER file upload to Storage:
const currentSpecs = (orderData && orderData.specs) ? orderData.specs : {};
const newSpecs = {
    ...currentSpecs,         // Preserves: base_plate_color, customer_order_no, production_no
    drawing_name: file.name, // NEW
    drawing_path: storedPath // NEW
};
await DB.call(db.from('orders').update({ specs: newSpecs }).eq('id', orderId));
```

### 1.2 Specs Merge Verification

| Operation | `specs` State | Drawing Fields |
|-----------|---------------|:---:|
| After INSERT (Step A) | `{ base_plate_color, customer_order_no, production_no }` | ❌ Absent |
| After UPDATE (Step B) | `{ base_plate_color, customer_order_no, production_no, drawing_name, drawing_path }` | ✅ Present |
| If Step B READ fails | `{ drawing_name, drawing_path }` only | ⚠️ Other keys lost |
| If Step B UPDATE fails | State A (no drawing fields) | ❌ Absent |

### 1.3 Failure Mode — READ in uploadDrawing Fails

```javascript
// [js/data/storage.js:70-77]
const { data: orderData, error: readError } = await DB.call(
    db.from('orders').select('specs').eq('id', orderId).single()
);

if (readError) {
    console.warn('[Storage] Could not read order specs, using minimal:', readError.message);
}

const currentSpecs = (orderData && orderData.specs) ? orderData.specs : {};
// If readError: currentSpecs = {} — ALL existing specs keys LOST!
const newSpecs = {
    ...currentSpecs,     // {} — empty!
    drawing_name: file.name,
    drawing_path: storedPath
};
```

**Impact:** If the SELECT fails (network glitch, PostgREST error), `specs` becomes `{ drawing_name, drawing_path }` only — `base_plate_color`, `customer_order_no`, and `production_no` are **lost**. This is a data corruption risk.

### 1.4 Expected Query

```sql
SELECT id, order_no, specs
FROM orders
ORDER BY created_at DESC
LIMIT 5;
```

Expected `specs` for an order with drawing:
```json
{
    "base_plate_color": "黑色喷漆",
    "customer_order_no": "PO-001",
    "production_no": "DF20260807143022",
    "drawing_name": "微信图片_001.jpg",
    "drawing_path": "a1b2c3d4-.../1691400000000-微信图片_001.jpg"
}
```

**Verdict:** ⚠️ **CONDITIONAL** — Drawing metadata is stored in a separate UPDATE after INSERT. If the UPDATE fails (upload error, DB error, network), `drawing_path` is absent and `loadDrawing()` shows "无图纸".

---

## Audit 2 — Storage Check

### 2.1 Bucket Configuration

| Property | Value | Source |
|----------|-------|--------|
| Name | `drawings` | [storage.js:8](js/data/storage.js#L8) |
| Public | `false` (private) | [62-Drawing-Attachment-Implementation.md](AI_CONTEXT/Phase3/62-Drawing-Attachment-Implementation.md) |
| Max size | 10 MiB | [storage.js:9](js/data/storage.js#L9) |
| Allowed MIME | `application/pdf`, `image/png`, `image/jpeg` | [storage.js:10](js/data/storage.js#L10) |
| RLS | `USING (true)` on `storage.objects` | [62](AI_CONTEXT/Phase3/62-Drawing-Attachment-Implementation.md) |

### 2.2 File Path Format

```
drawings/{orderId}/{timestamp}-{safeFilename}
```

Example: `drawings/a1b2c3d4-e5f6-7890-abcd-ef1234567890/1691400000000-微信图片_001.jpg`

### 2.3 Path Consistency Check

| Step | Path Used | Match? |
|------|-----------|:------:|
| `uploadDrawing()` — upload | `${orderId}/${ts}-${safeName}` | — |
| `uploadDrawing()` — stored path | `uploadData?.path \|\| storagePath` | — |
| `uploadDrawing()` — specs update | `drawing_path: storedPath` | ✅ |
| `getDrawingUrl()` — signed URL | `storedPath` (from `specs.drawing_path`) | ✅ |
| `createSignedUrl()` — bucket | `BUCKET = 'drawings'` | ✅ |

**Verdict:** ✅ **PASS** — Path is consistent across upload, metadata storage, and retrieval.

### 2.4 File Existence Verification (Manual)

```sql
-- Check if file exists in Storage
-- Via Supabase Dashboard → Storage → drawings → {orderId}/...
```

Expected: File exists at `drawings/{orderId}/{timestamp}-{filename}` with correct MIME type.

**Verdict:** ⚠️ **REQUIRES MANUAL VERIFICATION** — Cannot check from client-side code alone.

---

## Audit 3 — storage.js Full Trace

### 3.1 File: [js/data/storage.js](js/data/storage.js)

### 3.2 `uploadDrawing(orderId, file)` — Line 36

```
1. Validate: file instanceof File → isAllowedFileType(file) → size ≤ 10MB
2. Generate path: {orderId}/{Date.now()}-{safeName}
3. db.storage.from('drawings').upload(path, file, { upsert: false })
4. db.from('orders').select('specs').eq('id', orderId).single()
5. Merge: { ...currentSpecs, drawing_name: file.name, drawing_path: storedPath }
6. db.from('orders').update({ specs: newSpecs }).eq('id', orderId)
```

### 3.3 `isAllowedFileType(file)` — Line 18

```javascript
// Hybrid: MIME primary, extension fallback
function isAllowedFileType(file) {
    if (!file) return false;
    if (ALLOWED_TYPES.includes(file.type)) return true;  // MIME check
    const ext = (file.name || '').split('.').pop().toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext);              // Extension fallback
}
```

| File Scenario | `file.type` | Extension | Pass? |
|---------------|:----------:|-----------|:-----:|
| Normal JPEG | `image/jpeg` | `jpg` | ✅ MIME |
| Normal PNG | `image/png` | `png` | ✅ MIME |
| Normal PDF | `application/pdf` | `pdf` | ✅ MIME |
| WeChat JPEG (empty MIME) | `''` | `jpg` | ✅ Extension |
| File without extension | `''` | `''` | ❌ |
| `.exe` disguised as `.jpg` | `''` | `jpg` | ⚠️ Passes (known risk) |

### 3.4 `getDrawingUrl(storedPath)` — Line 107

```
1. db.storage.from('drawings').createSignedUrl(storedPath, 86400)
2. If success: return { ok: true, data: signedUrl, type: 'signed' }
3. If fail: db.storage.from('drawings').download(storedPath)
4. If download ok: return { ok: true, data: URL.createObjectURL(blob), type: 'blob' }
5. If download fail: return { ok: false, error: dlError.message }
```

### 3.5 Error Visibility

| Error Point | Console Output | User Sees |
|-------------|:---:|-----------|
| Upload HTTP error | `[Storage] Upload failed: ...` | Toast warning |
| Specs read error | `[Storage] Could not read order specs...` | Silent (specs lost!) |
| Specs update error | `[Storage] Specs update failed: ...` | Toast warning |
| Signed URL error | `[Storage] Signed URL failed, falling back...` | Fallback or error in drawing section |
| Download error | (none beyond return) | "⚠ 图纸加载失败: ..." in drawing section |

### 3.6 API Surface

```javascript
return {
    uploadDrawing, getDrawingUrl, isImage, validateFile,
    isAllowedFileType, BUCKET, ALLOWED_TYPES, ALLOWED_EXTENSIONS, MAX_SIZE
};
```

**Verdict:** ✅ **PASS for logic.** ⚠️ Specs read failure loses existing keys (data corruption risk).

---

## Audit 4 — order-create.js Flow Trace

### 4.1 Upload Timing

```
Actual Flow (CORRECT — Order A):
─────────────────────────────────
  OrderCreate.submit()
    → OrdersAPI.createOrder()         // INSERT order + nodes
    → returns { ok, orderId }
  
  StorageAPI.uploadDrawing(orderId)    // Upload + specs update
    → db.storage.upload(...)           // File to bucket
    → db.from('orders').select(...)    // Read current specs
    → db.from('orders').update(...)    // Merge drawing metadata
  
  Router.navigate('/orders/' + orderId)
```

**Order confirmed:** A (create → upload → update). ✅ Correct.

### 4.2 File Reference Lifecycle

```
User selects file
  → onDrawingSelected(input)           [line 280]
  → StorageAPI.validateFile(file)      [line 283]
  → drawingFile = file                 [line 290]  ← stored in module variable
  
User clicks "下一步"
  → goToStep2()                        [line 140]
  → drawingInput.files[0] → drawingFile [line 156] ← re-captured from DOM
  → renderStep2() destroys Step 1 DOM  [line 185]  ← file input destroyed
  → drawingFile survives as JS File    ✅

User clicks "创建订单"
  → submitOrder()                      [line 299]
  → OrderCreate.submit() → orderId     [line 314]
  → StorageAPI.uploadDrawing(orderId, drawingFile) [line 319]
  → Router.navigate(...)               [line 327]
```

### 4.3 Failure Points

| Point | Failure Mode | Visibility |
|-------|-------------|:---:|
| `onDrawingSelected` validation | File rejected by MIME/ext check | Toast on file select ✅ |
| `goToStep2` capture | File not in DOM (edge case) | `drawingFile` stays null — no upload |
| `backToStep1()` → `render()` | `drawingFile = null` at [line 18] | File input cleared — user must re-select |
| `submitOrder` upload fail | Network/storage error | Toast "图纸上传失败" briefly before navigate ⚠️ |
| `submitOrder` specs update fail | DB error | Toast warning briefly before navigate ⚠️ |

**Critical:** The Toast warning for upload failure appears RIGHT BEFORE `Router.navigate()` fires. If navigation is fast, the user may NEVER see the warning.

### 4.4 `backToStep1()` Data Loss

```javascript
// [js/pages/order-create.js:275-278]
function backToStep1() {
    step = 1;
    render();  // → drawingFile = null at line 18
}
```

If user selects a file, goes to Step 2, then returns to Step 1:
1. `drawingFile` is cleared
2. File input is empty (no file pre-selected)
3. User MUST re-select the file
4. If user forgets: drawing upload skipped silently

**Verdict:** ⚠️ **PASS for logic flow.** ⚠️ Two UX gaps: Toast timing + backToStep1 data loss.

---

## Audit 5 — order-detail.js Full Trace

### 5.1 All `renderFull()` Call Sites

| # | Location | Line | Context | `loadDrawing()` After? |
|:--:|----------|:----:|---------|:---:|
| 1 | `render()` | 48 | Initial page load | ✅ Line 49 |
| 2 | `onRecordException()` | 376 | After recording exception | ❌ **MISSING** |
| 3 | `handleActionResult()` | 421 | Complex action (rework/append) | ✅ Line 422 |
| 4 | `onCancelOrder()` | 538 | After cancelling order | ❌ **MISSING** |

### 5.2 All `loadDrawing()` Call Sites

| # | Location | Line | Context | Awaited? |
|:--:|----------|:----:|---------|:---:|
| 1 | `render()` | 49 | Initial page load | ❌ Not awaited |
| 2 | `handleActionResult()` | 422 | Complex action | ❌ Not awaited |
| — | (definition) | 655 | `async function loadDrawing(order)` | — |

### 5.3 `loadDrawing()` Internal Flow

```
loadDrawing(order)
  ├─ getElementById('drawing-section')     → if null: SILENT RETURN ← P0-3
  ├─ getElementById('drawing-content')      → if null: SILENT RETURN ← P0-3
  ├─ order.specs?.drawing_path              → if falsy: "无图纸"
  ├─ content.innerHTML = "📎 加载图纸中..."
  ├─ await StorageAPI.getDrawingUrl(path)
  │   ├─ if !ok: "⚠ 图纸加载失败: {error}"
  │   └─ if ok: url = result.data
  ├─ isImageFile = name.match(/\.(png|jpg|jpeg|webp)$/i)
  ├─ if image: render thumbnail + download link
  └─ if not: render PDF card + "查看" button
```

### 5.4 Every Exit Point in `loadDrawing()`

| Line(s) | Condition | DOM Result |
|:-------:|-----------|-----------|
| 658 | `#drawing-section` or `#drawing-content` not found | **Nothing** (early return) |
| 663-665 | `drawingPath` is falsy | "无图纸" text |
| 675-678 | `getDrawingUrl()` returns `!ok` | "⚠ 图纸加载失败: ..." text |
| 685-700 | Image file detected | Thumbnail + download link |
| 703-718 | Non-image file | PDF card + "查看" button |

### 5.5 Why "Nothing Shows" on First Visit

For the INITIAL page load (after order creation), `render()` calls both `renderFull()` and `loadDrawing()`. The `#drawing-content` div exists after `renderFull` sets `innerHTML`. So `loadDrawing`'s element guard should pass.

If the user sees "📎 图纸" label but NO content below it (not even "无图纸", not even "加载中..."), the ONLY explanation is:

**`loadDrawing()` returned at the element guard (line 658) without setting any content.**

This can happen if:
- `render()` was called TWICE in quick succession (router double-fire)
- Second call sets `container.innerHTML` to skeleton, destroying `#drawing-content`
- First `loadDrawing` (still async-pending) finds no elements and silently returns

Or more simply: **the upload never succeeded, `drawing_path` is null, and "无图纸" IS showing but the user interprets the small grey text as "nothing."**

### 5.6 `onRecordException()` — Missing `loadDrawing()`

```javascript
// [js/pages/order-detail.js:368-381]
onConfirm: async (data) => {
    const result = await NodeActions.recordException(nodeId, data);
    if (result.ok) {
        Toast.success('异常已记录');
        const nodeIds = currentNodeList.map(n => n.id);
        const er = await ExceptionsAPI.listByNodeIds(nodeIds);
        currentExceptions = er.ok ? er.data : [];
        renderFull(document.getElementById('page-container'));
        // ❌ loadDrawing(currentOrder) NOT called
        // #drawing-content is now empty. Drawing disappears.
    }
}
```

### 5.7 `onCancelOrder()` — Missing `loadDrawing()`

```javascript
// [js/pages/order-detail.js:528-540]
onConfirm: async () => {
    // ... cancel nodes ...
    await OrdersAPI.updateStatus(currentOrder.id, 'cancelled');
    currentOrder.status = 'cancelled';
    Toast.info('订单已取消');
    renderFull(document.getElementById('page-container'));
    // ❌ loadDrawing(currentOrder) NOT called
}
```

**Verdict:** 🔴 **FAIL** — 2 of 4 `renderFull()` call sites are missing `loadDrawing()`. Any user who records an exception or cancels an order will see their drawing disappear.

---

## Audit 6 — Browser Console Simulation

### 6.1 Initial Page Load (Happy Path)

```
1. User navigates to #/orders/{id}
2. Router calls OrderDetailPage.render(orderId)
3. GET /rest/v1/orders?id=eq.{id}&select=...,specs,...
   Response: { specs: { drawing_name: "img.jpg", drawing_path: "...", ... } }
4. renderFull(container) — sets innerHTML
   <div id="drawing-section">
     <span>📎 图纸</span>
     <div id="drawing-content"></div>       ← EMPTY
   </div>
5. loadDrawing(order) — called, not awaited
6. order.specs.drawing_path = "abc-123/1691400000000-img.jpg"
7. content.innerHTML = "📎 加载图纸中..."
8. GET /storage/v1/object/sign/drawings/abc-123/...img.jpg
   Response: { signedUrl: "https://..." }
9. content.innerHTML = <img src="https://..."> + download link
10. Browser loads image from signed URL → HTTP 200 ✅
```

### 6.2 Initial Page Load (Upload Failed)

```
1-4. Same as above
5. loadDrawing(order) — called
6. order.specs.drawing_path = undefined  ← NEVER SET
7. content.innerHTML = '<span>无图纸</span>'  ← Small grey text
```

The user would see: "📎 图纸" label + "无图纸" small text below it. This might be interpreted as "nothing showing."

### 6.3 Initial Page Load (loadDrawing Error)

```
1-4. Same as above
5. loadDrawing(order) — called
6. drawingPath exists
7. content.innerHTML = "📎 加载图纸中..."
8. StorageAPI.getDrawingUrl(path) → throws Error (network, etc.)
   → Unhandled Promise Rejection (loadDrawing not awaited)
   → content.innerHTML STUCK at "📎 加载图纸中..."  ← BUG
9. No error shown to user
```

Because `loadDrawing()` is NOT awaited, any thrown error becomes an unhandled rejection. The `try/catch` inside `getDrawingUrl` only catches Supabase errors (returned as `{ error }`), not network exceptions.

**Wait — `DB.call` does catch:**
```javascript
async function call(promise) {
    try {
        const { data, error } = await promise;
        if (error) throw error;
        return { ok: true, data };
    } catch (err) {
        console.error('[DB]', err.message || err);
        return { ok: false, error: err.message || 'Unknown error' };
    }
}
```

This wraps ALL errors into `{ ok: false, error }`. And `getDrawingUrl` itself has its own try via the Supabase SDK's built-in error handling. So throw-based failures should be caught.

But what about `createSignedUrl`? Let me check...

In Supabase JS SDK v2, `createSignedUrl` returns `{ data, error }`. If there's a network error, the SDK catches it and returns `{ data: null, error: ... }`. So `signedError` would be set, and the code falls through to the blob download path. Then if download also fails, it returns `{ ok: false, error }`. All paths are handled.

### 6.4 Console Log Simulation

```javascript
// What you'd see in DevTools for a successful drawing display:

console.log('order.specs:', order.specs);
// → { base_plate_color: "黑色", production_no: "DF20260807...", 
//     drawing_name: "微信图片_001.jpg", 
//     drawing_path: "abc-123/1691400000000-微信图片_001.jpg" }

console.log('drawing_path:', order.specs.drawing_path);
// → "abc-123/1691400000000-微信图片_001.jpg"

// In loadDrawing:
console.log('signedUrl:', result.data);
// → "https://wzfkmwrqnvjegunjueka.supabase.co/storage/v1/object/sign/drawings/..."
```

```javascript
// What you'd see if upload failed:

console.log('order.specs:', order.specs);
// → { base_plate_color: "黑色", customer_order_no: null, production_no: "DF20260807..." }
//   ↑ NO drawing_name, NO drawing_path
```

**Verdict:** ⚠️ If `specs.drawing_path` is absent, `loadDrawing` shows "无图纸". If present but signed URL fails, error message shows. If `loadDrawing` returns early (no elements), NOTHING shows. If `loadDrawing` throws, it's an unhandled rejection.

---

## Audit 7 — Final Root Cause Ranking

### P0-1: Two `renderFull()` Sites Missing `loadDrawing()` 🔴

**File:** [js/pages/order-detail.js:376](js/pages/order-detail.js#L376) and [js/pages/order-detail.js:538](js/pages/order-detail.js#L538)

| Site | Trigger | Effect |
|------|---------|--------|
| `onRecordException()` line 376 | User records an exception | Drawing section emptied |
| `onCancelOrder()` line 538 | User cancels order | Drawing section emptied |

**Why it matches symptom:** After recording an exception, `renderFull()` recreates `#drawing-content` as empty `<div>`. Without `loadDrawing()`, the drawing preview never reappears. User sees "📎 图纸" label with blank area below.

**Fix:** Add `loadDrawing(currentOrder)` after each `renderFull()` call.

### P0-2: `loadDrawing()` Never Awaited — Silent Failures 🔴

**File:** [js/pages/order-detail.js:49](js/pages/order-detail.js#L49) and [js/pages/order-detail.js:422](js/pages/order-detail.js#L422)

```javascript
renderFull(container);
loadDrawing(order);  // ← Not awaited. Error = unhandled rejection.
```

**Effect:** If `StorageAPI.getDrawingUrl()` or the template literal assignment throws, the error is logged to console as `Unhandled Promise Rejection` but the user sees NOTHING (content stays at "📎 加载图纸中..." or empty).

**Fix:** `await loadDrawing(order)` or add `.catch(err => { ... })`.

### P0-3: `loadDrawing()` Element Guard — Silent No-Op 🔴

**File:** [js/pages/order-detail.js:656-658](js/pages/order-detail.js#L656-L658)

```javascript
async function loadDrawing(order) {
    const section = document.getElementById('drawing-section');
    const content = document.getElementById('drawing-content');
    if (!section || !content) return;  // ← Silent. No error. No log.
```

**Effect:** If for ANY reason `#drawing-section` or `#drawing-content` doesn't exist in DOM when `loadDrawing` executes, the function silently returns. No content is rendered. No console message. No user feedback.

**Triggers:**
- `render()` called twice rapidly (router double-fire)
- `loadDrawing` called before `renderFull` completes (unlikely — `renderFull` is synchronous)
- Another script removes the elements (unlikely)

**Fix:** Add `console.warn('[OrderDetail] Drawing elements not found, skipping loadDrawing')` before the return.

### P0-4: Upload Toast Disappears Before User Reads It 🔴

**File:** [js/pages/order-create.js:319-327](js/pages/order-create.js#L319-L327)

```javascript
if (drawingFile) {
    const uploadResult = await StorageAPI.uploadDrawing(result.orderId, drawingFile);
    if (!uploadResult.ok) {
        Toast.warning('订单已创建，但图纸上传失败：' + uploadResult.error);
        // ↓ Immediately navigates — Toast may show for <500ms
    }
    drawingFile = null;
}
Router.navigate('/orders/' + result.orderId);  // ← Navigation right after
```

**Effect:** If upload fails, a Toast warning appears but navigation to order detail happens immediately after. The user may never see the warning. On the detail page, `specs.drawing_path` is absent, and "无图纸" is shown.

**Fix:** Add a small delay before navigation on upload failure, or show a more persistent warning on the detail page.

### P1-1: Image `onerror` Hides Broken Image Without Visible Fallback 🟡

**File:** [js/pages/order-detail.js:698](js/pages/order-detail.js#L698)

```html
<img src="${escapeHTML(url)}" ...
     onerror="this.style.display='none';">
```

**Effect:** If the signed URL is valid but the image fails to load (corrupted file, network issue, CORS), the `<img>` is hidden. The download link in the header bar remains visible, but the user may overlook it and think "nothing shows."

### P1-2: `escapeHTML()` Applied to URLs 🟡

**File:** [js/pages/order-detail.js:692-698](js/pages/order-detail.js#L692-L698)

```javascript
<a href="${escapeHTML(url)}" ...>
<img src="${escapeHTML(url)}" ...>
```

**Effect:** `escapeHTML` converts `&` → `&amp;` in signed URLs. Browsers decode entity references in attributes, so this currently works, but it's semantically incorrect and fragile.

### P2-1: `backToStep1()` Silently Clears `drawingFile` 🟢

**File:** [js/pages/order-create.js:18](js/pages/order-create.js#L18)

```javascript
async function render() {
    // ...
    drawingFile = null;  // ← Clears without warning
}
```

**Effect:** If user selects a file, goes to Step 2, clicks "← 返回修改", the file selection is lost. The file input is empty. User MUST re-select. If they forget, no drawing is uploaded.

---

## Complete Call Graph

```
CREATE ORDER:
  OrderCreatePage.submitOrder()                         [order-create.js:299]
    └─ OrderCreate.submit(formData, selectedSteps)      [domain/order-create.js:16]
         └─ OrdersAPI.createOrder(orderData, nodesData) [data/orders.js:225]
              └─ DB.call(db.from('orders').insert(...))  → specs WITHOUT drawing
    └─ StorageAPI.uploadDrawing(orderId, drawingFile)   [data/storage.js:36]
         ├─ isAllowedFileType(file)                      [data/storage.js:18]
         ├─ db.storage.from('drawings').upload(...)      → file in bucket
         ├─ db.from('orders').select('specs')...single() → read current specs
         └─ db.from('orders').update({ specs })          → merge drawing fields
    └─ Router.navigate('/orders/' + orderId)            [order-create.js:327]

VIEW ORDER (INITIAL):
  OrderDetailPage.render(orderId)                       [order-detail.js:12]
    └─ OrdersAPI.getById(orderId)                        [data/orders.js:48]
         └─ db.from('orders').select('...,specs,...')    → order.specs with drawing?
    └─ renderFull(container)                             [order-detail.js:52]
         └─ container.innerHTML = '...<div id="drawing-content"></div>...'
    └─ loadDrawing(order)                                [order-detail.js:655] ← NOT AWAITED
         ├─ getElementById('drawing-content')             → null? SILENT RETURN
         ├─ order.specs?.drawing_path                     → null? "无图纸"
         ├─ StorageAPI.getDrawingUrl(path)                [data/storage.js:107]
         │    ├─ createSignedUrl(path, 86400)              → signed URL
         │    └─ download(path)                            → blob fallback
         └─ content.innerHTML = <img>/<a>                  → render preview

VIEW ORDER (AFTER REWORK/APPEND):
  OrderDetailPage.handleActionResult(result)             [order-detail.js:387]
    └─ [complex path]
         ├─ renderFull(container)                         → resets #drawing-content
         └─ loadDrawing(currentOrder)                     [order-detail.js:422] ← NOT AWAITED

VIEW ORDER (AFTER RECORD EXCEPTION): ← BUG
  OrderDetailPage.onRecordException()                    [order-detail.js:342]
    └─ [onConfirm callback]
         ├─ renderFull(container)                         → resets #drawing-content
         └─ ❌ loadDrawing() NOT CALLED                   ← P0-1

VIEW ORDER (AFTER CANCEL): ← BUG
  OrderDetailPage.onCancelOrder()                        [order-detail.js:521]
    └─ [onConfirm callback]
         ├─ renderFull(container)                         → resets #drawing-content
         └─ ❌ loadDrawing() NOT CALLED                   ← P0-1
```

---

## Summary

```
Database:     ⚠️ drawing fields added in separate UPDATE (not atomic with INSERT)
Storage:      ✅ Path consistent. File existence requires manual check.
storage.js:   ✅ Logic correct. Read-failure loses existing specs keys.
order-create: ✅ Flow correct (A). Toast timing + backToStep1 data loss.
order-detail: 🔴 2 renderFull sites missing loadDrawing.
              🔴 loadDrawing not awaited — silent failures.
              🔴 Element guard — silent no-op.
Browser:      ⚠️ "无图纸" might be shown but overlooked.
              ⚠️ Unhandled rejections if async chain breaks.

Primary Fix:  Add loadDrawing() after ALL renderFull() calls. Await it.
Secondary:    Add console.warn in loadDrawing element guard.
              Add delay before navigation on upload failure.
```

---

> **Audit complete. No code was changed.**
>
> **试运行冻结期间 — 仅建议，不实施。**
