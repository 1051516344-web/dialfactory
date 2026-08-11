# Phase 3-D · Drawing Display Final E2E Audit

> **Date:** 2026-08-10
> **Type:** Audit Only — No Code Changes
> **Trigger:** "📎 图纸" label visible, but no image/PDF/card/button rendered below it
> **Predecessor:** [70-Phase3D-Drawing-Display-Audit.md](AI_CONTEXT/Phase3/70-Phase3D-Drawing-Display-Audit.md)

---

## 0. How to Read This Report

Each audit section answers a single question:

| Section | Question |
|---------|----------|
| Audit 1 | Did the file reach Supabase Storage? |
| Audit 2 | Did the database save `drawing_path`? |
| Audit 3 | Did `loadDrawing()` receive `drawing_path`? |
| Audit 4 | Did the signed URL get generated? |
| Audit 5 | Did the DOM receive the image/PDF elements? |
| Audit 6 | What does a real browser see at each step? |
| Audit 7 | Final root cause ranking |

Every data transformation is shown with **exact file:line references**.

---

## Audit 1 — Upload Chain: Does the File Reach Storage?

### 1.1 File Selection → Validation

**Entry:** [js/pages/order-create.js:280-294](js/pages/order-create.js#L280-L294)

```javascript
function onDrawingSelected(input) {
    if (input.files && input.files.length > 0) {
      const file = input.files[0];                              // File object
      const v = StorageAPI.validateFile(file);                   // → storage.js:146
      if (!v.valid) {
        Toast.warning(v.error);                                  // User sees rejection
        input.value = '';                                        // Input cleared
        drawingFile = null;
        return;
      }
      drawingFile = file;                                        // Module variable
    }
}
```

**Validation Logic:** [js/data/storage.js:18-25](js/data/storage.js#L18-L25)

```javascript
function isAllowedFileType(file) {
    if (!file) return false;
    if (ALLOWED_TYPES.includes(file.type)) return true;           // MIME primary
    const ext = (file.name || '').split('.').pop().toLowerCase(); // Extension fallback
    return ALLOWED_EXTENSIONS.includes(ext);
}
```

**WeChat Image Test:**

| WeChat `.jpg` File Property | Value | Check |
|:---|:---|:---|
| `file.name` | `微信图片_20260810143022.jpg` | — |
| `file.type` | `''` (empty — browser can't detect) | `ALLOWED_TYPES.includes('')` → `false` |
| Extension | `'jpg'` | `ALLOWED_EXTENSIONS.includes('jpg')` → `true` |
| **Result** | **✅ PASS (extension fallback)** | |

**Verdict:** ✅ File passes validation and is stored in `drawingFile`.

### 1.2 File Reference Across Step Transition

**Step 1 → Step 2:** [js/pages/order-create.js:153-157](js/pages/order-create.js#L153-L157)

```javascript
// In goToStep2():
const drawingInput = document.getElementById('form-drawing');
if (drawingInput && drawingInput.files && drawingInput.files.length > 0) {
    drawingFile = drawingInput.files[0];   // Re-captured from DOM
}
// ...then renderStep2() destroys Step 1 DOM (line 185)
```

**Verdict:** ✅ File reference survives DOM destruction. Captured before `renderStep2()`.

### 1.3 Upload Execution

**Submit:** [js/pages/order-create.js:314-327](js/pages/order-create.js#L314-L327)

```javascript
const result = await OrderCreate.submit(formData, selectedSteps);     // Step 1: Create order

if (result.ok) {
    if (drawingFile) {
        const uploadResult = await StorageAPI.uploadDrawing(            // Step 2: Upload drawing
            result.orderId, drawingFile
        );
        if (!uploadResult.ok) {
            Toast.warning('订单已创建，但图纸上传失败：' + uploadResult.error);
        } else if (uploadResult.warning) {
            Toast.warning(uploadResult.warning);
        }
        drawingFile = null;
    }
    Router.navigate('/orders/' + result.orderId);                      // Step 3: Navigate
}
```

**Upload Internals:** [js/data/storage.js:36-97](js/data/storage.js#L36-L97)

```
StorageAPI.uploadDrawing(orderId, file)
  ├── [line 38]  isAllowedFileType(file)          → MIME/ext check
  ├── [line 41]  file.size ≤ 10MB                  → size check
  ├── [line 49]  Generate path: {orderId}/{Date.now()}-{safeName}
  ├── [line 55]  db.storage.from('drawings').upload(path, file, { upsert: false })
  │              → HTTP POST /storage/v1/object/drawings/{orderId}/{ts}-{name}
  │              → Returns { data: { path: "..." }, error: null }  on success
  ├── [line 70]  db.from('orders').select('specs').eq('id', orderId).single()
  │              → HTTP GET /rest/v1/orders?select=specs&id=eq.{orderId}
  │              → Returns { data: { specs: {...} }, error: null }
  ├── [line 79]  Merge: { ...currentSpecs, drawing_name: file.name, drawing_path: storedPath }
  └── [line 87]  db.from('orders').update({ specs: newSpecs }).eq('id', orderId)
                 → HTTP PATCH /rest/v1/orders?id=eq.{orderId}
                 → Body: { specs: { base_plate_color, ..., drawing_name, drawing_path } }
```

**Return value structure:**

| Path | Return Value |
|------|-------------|
| Success | `{ ok: true, data: { name: "微信图片_001.jpg", path: "{uuid}/{ts}-微信图片_001.jpg" } }` |
| Upload HTTP fail | `{ ok: false, error: "..." }` |
| Specs update fail | `{ ok: true, data: { name, path }, warning: "图纸已上传，但规格更新失败" }` |

**Verdict:** ✅ Flow is correct (create → upload → update → navigate). Upload is `await`ed before navigation.

### 1.4 Critical Failure Point — Specs Update Fails But File Exists

```javascript
// [js/data/storage.js:91-94]
if (updateError) {
    console.error('[Storage] Specs update failed:', updateError.message);
    return { ok: true, data: { name: file.name, path: storedPath },
             warning: '图纸已上传，但规格更新失败' };
    //       ↑ ok: true — caller treats as success
    //       ↑ BUT specs.drawing_path is NOT in the database
}
```

When this happens:
1. File IS in Storage bucket ✅
2. `specs.drawing_path` is NOT in database ❌
3. Caller shows Toast warning, navigates away
4. Order detail: `loadDrawing()` sees no `drawing_path` → shows "无图纸"

**Verdict:** ⚠️ **PASS for logic.** This is a partial-failure mode — file exists but metadata is missing.

---

## Audit 2 — Database: Is `drawing_path` Saved?

### 2.1 Data Shape at Each Stage

**Stage A — After INSERT (OrderCreate.submit):**

```json
// [js/domain/order-create.js:56-60]
{
  "specs": {
    "base_plate_color": "黑色喷漆",
    "customer_order_no": "PO-001",
    "production_no": "DF20260810143022"
    // ← NO drawing fields
  }
}
```

**Stage B — After StorageAPI.uploadDrawing (if successful):**

```json
// [js/data/storage.js:79-84]
{
  "specs": {
    "base_plate_color": "黑色喷漆",
    "customer_order_no": "PO-001",
    "production_no": "DF20260810143022",
    "drawing_name": "微信图片_001.jpg",
    "drawing_path": "a1b2c3d4-e5f6-7890-abcd-ef1234567890/1755345600000-微信图片_001.jpg"
  }
}
```

**Stage B — After StorageAPI.uploadDrawing (if upload fails):**

```json
// Same as Stage A — no drawing fields
```

**Stage B — After StorageAPI.uploadDrawing (if specs UPDATE fails):**

```json
// Same as Stage A — file in Storage but metadata NOT in DB
```

**Stage B — After StorageAPI.uploadDrawing (if specs READ fails):**

```json
// [js/data/storage.js:79] — currentSpecs = {}
{
  "specs": {
    "drawing_name": "微信图片_001.jpg",
    "drawing_path": "..."
    // ← base_plate_color, customer_order_no, production_no LOST
  }
}
```

### 2.2 DB.call Response Normalization

```javascript
// [js/data/client.js:28-36]
async function call(promise) {
    try {
      const { data, error } = await promise;    // Supabase SDK destructure
      if (error) throw error;
      return { ok: true, data };                 // data = row object from PostgREST
    } catch (err) {
      console.error('[DB]', err.message || err);
      return { ok: false, error: err.message || 'Unknown error' };
    }
}
```

Supabase JS SDK v2 auto-parses JSONB → JavaScript object. `specs` arrives as `{...}`, never as a string.

**Verdict:** ✅ **PASS** — Data shape is correct at every stage. JSONB parsing is handled by SDK.

---

## Audit 3 — Read Chain: Does `loadDrawing()` Receive the Data?

### 3.1 Data Load

```javascript
// [js/pages/order-detail.js:22]
const { ok, data: order, error } = await OrdersAPI.getById(orderId);
```

`OrdersAPI.getById()`: [js/data/orders.js:48-75](js/data/orders.js#L48-L75)

```javascript
.select('id,order_no,customer_id,order_qty,due_date,base_texture,plate_color,
         specs,route_snapshot,status,note,created_at,updated_at,
         customer:customers(name, short_name)')
.eq('id', orderId)
.single()
```

**`specs` IS in the select list** ✅ — line 54.

### 3.2 Data Flow to loadDrawing

```javascript
// [js/pages/order-detail.js:35-49]
currentOrder = order;                    // Store in module variable
currentNodeList = order.nodes || [];
currentOrder.nodes = currentNodeList;

renderFull(container);                   // Uses currentOrder (line 53)
loadDrawing(order);                      // Receives local `order` variable
```

**`order` (local) === `currentOrder` (module)** — same object reference. Line 35: `currentOrder = order`.

**Inside `loadDrawing(order)`:**
```javascript
// [js/pages/order-detail.js:660-661]
const drawingPath = order.specs?.drawing_path;    // order.specs.drawing_path
const drawingName = order.specs?.drawing_name || '客户图纸';
```

**Data trace:**

| Variable | Source | Value |
|----------|--------|-------|
| `order` | `OrdersAPI.getById()` return | `{ id, order_no, ..., specs: {...}, nodes: [...] }` |
| `order.specs` | Supabase JSONB → JS object | `{ base_plate_color, ..., drawing_name?, drawing_path? }` |
| `order.specs.drawing_path` | `StorageAPI.uploadDrawing()` wrote it | `"{orderId}/{ts}-{filename}"` or `undefined` |

### 3.3 The Critical Branch

```javascript
// [js/pages/order-detail.js:663-665]
if (!drawingPath) {
    content.innerHTML = '<span ...>无图纸</span>';
    return;
}
```

**If `drawingPath` is undefined/null/empty:**
→ Shows "无图纸" in small grey text
→ Returns
→ User sees: "📎 图纸" label + "无图纸" text below

**If `drawingPath` exists:**
→ Shows "📎 加载图纸中..."
→ Calls `StorageAPI.getDrawingUrl(drawingPath)`
→ Renders image or PDF card

**Verdict:** ✅ **Data flows correctly.** If `specs.drawing_path` exists in DB, `loadDrawing` receives it. If not, "无图纸" is shown.

---

## Audit 4 — Storage: Is the Signed URL Generated?

### 4.1 getDrawingUrl Trace

```javascript
// [js/data/storage.js:107-133]
async function getDrawingUrl(storedPath) {
    if (!storedPath) return { ok: false, error: 'No path provided' };
    const db = DB.get();

    // PATH A: Signed URL
    const { data: signedData, error: signedError } = await db.storage
      .from(BUCKET)                                          // 'drawings'
      .createSignedUrl(storedPath, SIGNED_URL_TTL);          // 86400 seconds

    if (!signedError && signedData?.signedUrl) {
      return { ok: true, data: signedData.signedUrl, type: 'signed' };
    }

    // PATH B: Blob fallback
    console.warn('[Storage] Signed URL failed, falling back to download:', signedError?.message);
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

### 4.2 Path Consistency

| Operation | Bucket | Path |
|-----------|:------:|------|
| Upload | `drawings` | `{orderId}/{ts}-{safeName}` |
| Stored in specs | — | `uploadData?.path \|\| "{orderId}/{ts}-{safeName}"` |
| Signed URL | `drawings` | `specs.drawing_path` (same as stored) |
| Blob fallback | `drawings` | `specs.drawing_path` (same as stored) |

**Verdict:** ✅ **PASS** — Bucket and path are consistent across all operations.

### 4.3 Signed URL Expiry

- TTL: 86400 seconds (24 hours)
- Regenerated on EVERY page load (no caching)
- Blob fallback if signed URL fails

### 4.4 Error Handling

| Error | Return | User Sees |
|-------|--------|-----------|
| `storedPath` is empty | `{ ok: false, error: 'No path provided' }` | "⚠ 图纸加载失败: No path provided" |
| `createSignedUrl` fails | Falls to blob download | Blob URL or error |
| `download` fails | `{ ok: false, error: dlError.message }` | "⚠ 图纸加载失败: {message}" |
| Network error | `DB.call` catches → `{ ok: false }` | "⚠ 图纸加载失败: ..." |

**Verdict:** ✅ **PASS** — All error paths produce visible error messages in the drawing section.

---

## Audit 5 — DOM: Does the Image/PDF Actually Render?

### 5.1 The Target Element

```html
<!-- Generated by renderFull() [order-detail.js:85-88] -->
<div id="drawing-section"
     style="margin-top:var(--space-md);padding-top:var(--space-sm);
            border-top:1px solid var(--bg-muted);">
  <span style="font-size:var(--font-size-xs);color:var(--text-secondary);">
    📎 图纸
  </span>
  <div id="drawing-content"></div>        ← Target. Empty on creation.
</div>
```

### 5.2 Every Possible DOM Outcome

`loadDrawing()` has **5 exit points.** Only 2 render actual content:

| Exit | Condition | `#drawing-content` innerHTML |
|:----:|-----------|------------------------------|
| 1 | `#drawing-section` or `#drawing-content` not in DOM | **UNCHANGED** (empty `<div>`) |
| 2 | `!drawingPath` | `<span>无图纸</span>` |
| 3 | `getDrawingUrl()` error | `<span>⚠ 图纸加载失败: {msg}</span>` |
| 4 | Image file detected | Full thumbnail card + download link |
| 5 | Non-image file | PDF card + "查看" button |

### 5.3 Exit 4 — Image Rendering (Full HTML)

```html
<div style="border:1px solid var(--bg-muted);border-radius:8px;overflow:hidden;margin-top:4px;">

  <!-- TOP BAR: Always visible -->
  <div style="display:flex;align-items:center;justify-content:space-between;
              padding:var(--space-sm) var(--space-md);background:var(--bg-muted);">
    <span>📎 微信图片_001.jpg</span>
    <a href="https://...signedUrl..." target="_blank" rel="noopener"
       style="color:var(--color-primary);text-decoration:none;font-weight:500;">下载</a>
  </div>

  <!-- IMAGE: Hidden if load fails -->
  <a href="https://...signedUrl..." target="_blank" rel="noopener">
    <img src="https://...signedUrl..." alt="微信图片_001.jpg"
         style="width:100%;max-height:400px;object-fit:contain;display:block;cursor:pointer;"
         onerror="this.style.display='none';">
         <!-- ↑ If image HTTP fails: img hidden. Top bar still visible. -->
  </a>
</div>
```

### 5.4 Exit 5 — PDF Rendering (Full HTML)

```html
<div style="display:flex;align-items:center;gap:var(--space-md);padding:var(--space-sm);
            border:1px solid var(--bg-muted);border-radius:8px;margin-top:4px;">
  <span style="font-size:1.5rem;">📄</span>
  <div style="flex:1;min-width:0;">
    <div style="font-weight:600;...">微信图片_001.jpg</div>
    <div style="...">PDF 图纸</div>
  </div>
  <a href="https://...signedUrl..." target="_blank" rel="noopener"
     class="btn btn-primary btn-sm">查看</a>
</div>
```

### 5.5 Image Detection Logic

```javascript
// [js/pages/order-detail.js:683]
const isImageFile = drawingName.match(/\.(png|jpg|jpeg|webp)$/i);
```

| Filename | Match? | Renders As |
|----------|:------:|-----------|
| `微信图片_001.jpg` | ✅ | Image thumbnail |
| `photo.jpeg` | ✅ | Image thumbnail |
| `drawing.pdf` | ❌ | PDF card |
| `微信图片_001` (no ext) | ❌ | **PDF card** (even if JPEG!) |
| `photo.JPG` | ✅ (`/i`) | Image thumbnail |

### 5.6 Image `onerror` — The Silent Failure

```html
<img src="..." onerror="this.style.display='none';">
```

If the browser fetches the signed URL and gets:
- HTTP 403 (expired/unauthorized) → `onerror` fires → image hidden
- HTTP 404 (file deleted) → `onerror` fires → image hidden
- Corrupted image data → `onerror` fires → image hidden
- Network timeout → `onerror` fires → image hidden

**In ALL cases: the top bar with filename + "下载" link remains visible.** The user should STILL see something — the download bar. If they see NOTHING below "📎 图纸", it means either:
- Exit 1: elements not found (silent return)
- The user is misreporting and "无图纸" IS rendered

**Verdict:** ⚠️ **PASS for logic.** Exit 1 (silent element-not-found) is the only path that produces truly empty content.

---

## Audit 6 — Browser Runtime Simulation

### 6.1 Happy Path (Upload Success + Display Success)

```
USER ACTION                          CONSOLE OUTPUT
─────────────────────────────────────────────────────────
1. Open #/orders/new                 
2. Select file (WeChat .jpg)         file.type = ""
                                     isAllowedFileType: MIME '', ext 'jpg' → true
                                     drawingFile set
3. Fill form, click "下一步"          
4. Select processes, click "创建订单"  
                                     [OrderCreate.submit] INSERT order
                                     orderId = "a1b2c3d4-..."
                                     [StorageAPI.uploadDrawing] start
                                     upload to drawings/a1b2c3d4-.../17553....jpg
                                     → HTTP 200, path returned
                                     SELECT specs FROM orders WHERE id=...
                                     → { base_plate_color, customer_order_no, production_no }
                                     UPDATE orders SET specs = { ..., drawing_name, drawing_path }
                                     → HTTP 200
                                     [StorageAPI.uploadDrawing] done
                                     Router.navigate('/orders/a1b2c3d4-...')

5. Order detail loads                [OrderDetailPage.render] orderId = "a1b2c3d4-..."
                                     GET /rest/v1/orders?id=eq....
                                     → order.specs = {
                                         base_plate_color: "黑色",
                                         production_no: "DF20260810...",
                                         drawing_name: "微信图片_001.jpg",
                                         drawing_path: "a1b2c3d4-.../17553....jpg"
                                       }
                                     renderFull() → innerHTML set
                                     loadDrawing() start
                                     drawingPath = "a1b2c3d4-.../17553....jpg"
                                     content.innerHTML = "📎 加载图纸中..."
                                     [StorageAPI.getDrawingUrl]
                                     createSignedUrl → signedUrl = "https://..."
                                     isImageFile = true
                                     content.innerHTML = <img src="https://...">
                                     

6. Browser loads image               GET https://...signedUrl...
                                     → HTTP 200, Content-Type: image/jpeg
                                     → Image renders ✅

FINAL DOM:
  📎 图纸
  ┌──────────────────────────────────┐
  │ 📎 微信图片_001.jpg     [下载]   │
  │                                  │
  │        [ IMAGE PREVIEW ]         │
  │                                  │
  └──────────────────────────────────┘
```

### 6.2 Failure Path 1 — MIME/Ext Validation Rejects File

```
USER ACTION                          CONSOLE OUTPUT
─────────────────────────────────────────────────────────
2. Select file (bad extension)       file.type = ""
                                     file.name = "document.docx"
                                     ext = "docx"
                                     isAllowedFileType: MIME '', ext 'docx' → false
                                     Toast.warning("仅支持 PDF / PNG / JPEG 格式")
                                     input.value = ''
                                     drawingFile = null

3-5. Order created without drawing   
                                     order.specs = {
                                         base_plate_color: "黑色",
                                         production_no: "DF20260810..."
                                         // NO drawing_name, NO drawing_path
                                     }
                                     loadDrawing() → drawingPath = undefined
                                     content.innerHTML = "无图纸"

FINAL DOM:
  📎 图纸
  无图纸                               ← Small grey text
```

### 6.3 Failure Path 2 — Upload Succeeds, Specs UPDATE Fails

```
USER ACTION                          CONSOLE OUTPUT
─────────────────────────────────────────────────────────
4. Click "创建订单"                    INSERT order → ok, orderId
                                     [StorageAPI.uploadDrawing]
                                     upload → HTTP 200 ✅ (file in bucket)
                                     SELECT specs → ok
                                     UPDATE specs → HTTP 500 / network error ❌
                                     console.error('[Storage] Specs update failed: ...')
                                     Toast.warning("图纸已上传，但规格更新失败")
                                     ← User may NOT see this Toast before navigation!
                                     Router.navigate(...)

5. Order detail loads                order.specs = {
                                         base_plate_color: "黑色",
                                         production_no: "DF20260810..."
                                         // drawing_path NOT SAVED
                                     }
                                     loadDrawing() → drawingPath = undefined
                                     content.innerHTML = "无图纸"

FINAL DOM:
  📎 图纸
  无图纸                               ← User uploaded image, but says "no drawing"
```

### 6.4 Failure Path 3 — renderFull() Called Without loadDrawing()

```
USER ACTION                          CONSOLE OUTPUT
─────────────────────────────────────────────────────────
(After recording an exception)
                                     [onRecordException] onConfirm
                                     renderFull(container)
                                     → container.innerHTML = ... <div id="drawing-content"></div> ...
                                     // loadDrawing() NOT CALLED
                                     // #drawing-content stays EMPTY

FINAL DOM:
  📎 图纸
                                     ← EMPTY. No text, no image, no card, no error.
```

**This is the EXACT symptom the user describes:** "📎 图纸" label visible, nothing below it. No "无图纸" text, no image, no card, no error. Just blank.

### 6.5 Failure Path 4 — loadDrawing Element Guard Fails

```
USER ACTION                          CONSOLE OUTPUT
─────────────────────────────────────────────────────────
(Double render or race condition)
                                     render() called
                                     renderFull(container) → innerHTML set
                                     loadDrawing(order) → start, but NOT awaited
                                     render() called AGAIN (router double-fire)
                                     container.innerHTML = skeleton
                                     → #drawing-section DESTROYED
                                     → #drawing-content DESTROYED
                                     First loadDrawing() resumes:
                                     getElementById('drawing-content') → null
                                     return; // SILENT — no log, no error

FINAL DOM:
  📎 图纸
                                     ← Empty (from second renderFull)
```

---

## Audit 7 — Final Root Cause Ranking

### Question A: Did the file reach Storage?

**Answer:** Depends. If upload succeeds, YES. File is at `drawings/{orderId}/{timestamp}-{filename}`. But if the upload fails (network, bucket issue), NO. If the specs UPDATE fails, the file IS in Storage but the database doesn't know about it.

### Question B: Did the database save `drawing_path`?

**Answer:** NOT GUARANTEED. The specs UPDATE in `StorageAPI.uploadDrawing()` is a SEPARATE HTTP request from the upload. It can fail independently. If it fails, `specs.drawing_path` is never written. The Toast warning flashes briefly before navigation.

### Question C: Did the detail page receive `drawing_path`?

**Answer:** Yes, IF it was saved in Question B. The `OrdersAPI.getById()` select list includes `specs` (line 54). `loadDrawing(order)` receives the same object. No data loss between API and function call.

### Question D: Did the signed URL generate?

**Answer:** Yes, IF `drawing_path` exists. `getDrawingUrl()` uses the correct bucket and path. Falls back to blob download on failure. All errors produce visible messages.

### Question E: Did the DOM receive the image?

**Answer:** NOT in all code paths. `loadDrawing()` is called after only 2 of 4 `renderFull()` sites. The 2 missing sites (line 376, line 538) leave `#drawing-content` permanently empty.

---

## P0 Root Causes

### P0-1: `onRecordException()` — `renderFull()` Without `loadDrawing()` 🔴

**File:** [js/pages/order-detail.js:376](js/pages/order-detail.js#L376)
**Symptom Match:** ✅ **PERFECT** — "📎 图纸" label visible, no content below

```javascript
// After recording exception:
renderFull(document.getElementById('page-container'));
// ❌ loadDrawing(currentOrder) NOT called
// #drawing-content is empty. User sees label but no preview.
```

### P0-2: `onCancelOrder()` — `renderFull()` Without `loadDrawing()` 🔴

**File:** [js/pages/order-detail.js:538](js/pages/order-detail.js#L538)
**Symptom Match:** ✅ — Same as P0-1

```javascript
renderFull(document.getElementById('page-container'));
// ❌ loadDrawing(currentOrder) NOT called
```

### P0-3: `loadDrawing()` Never Awaited — Silent Failures 🔴

**File:** [js/pages/order-detail.js:49](js/pages/order-detail.js#L49) and [js/pages/order-detail.js:422](js/pages/order-detail.js#L422)

```javascript
renderFull(container);
loadDrawing(order);    // ← No await. No .catch().
// If loadDrawing throws → Unhandled Promise Rejection
// User sees nothing. Console has error but factory staff won't check it.
```

### P0-4: `loadDrawing()` Element Guard — Silent No-Op 🔴

**File:** [js/pages/order-detail.js:656-658](js/pages/order-detail.js#L656-L658)

```javascript
const section = document.getElementById('drawing-section');
const content = document.getElementById('drawing-content');
if (!section || !content) return;   // ← No console.warn. No user feedback.
```

### P0-5: Specs UPDATE Failure After Successful Upload 🔴

**File:** [js/data/storage.js:91-94](js/data/storage.js#L91-L94)

```
State after this failure:
  Storage:  File exists ✅
  Database: drawing_path NOT saved ❌
  Toast:    "图纸已上传，但规格更新失败" (may not be seen)
  Detail:   "无图纸" shown
```

---

## P1 Contributing Factors

### P1-1: Image `onerror` Hides Broken Image Without Fallback Text 🟡

**File:** [js/pages/order-detail.js:698](js/pages/order-detail.js#L698)

```html
<img src="..." onerror="this.style.display='none';">
```

If signed URL returns 403/404 or image data is corrupt, the `<img>` disappears. The download top bar remains, but the user might not notice it and think "nothing shows."

### P1-2: Toast Warning Timing — Navigation Overwrites 🟡

**File:** [js/pages/order-create.js:319-327](js/pages/order-create.js#L319-L327)

```javascript
Toast.warning('订单已创建，但图纸上传失败：...');
// No delay. Immediately:
Router.navigate('/orders/' + result.orderId);
```

Navigation triggers a page transition that may dismiss the Toast before the user reads it.

### P1-3: `escapeHTML()` on Signed URLs 🟡

**File:** [js/pages/order-detail.js:692-698](js/pages/order-detail.js#L692-L698)

```javascript
<img src="${escapeHTML(url)}" ...>
```

`escapeHTML` converts `&` → `&amp;` in signed URLs containing query parameters. Browsers decode entity references in attributes, so this currently works, but is semantically wrong and fragile.

---

## P2 Minor Issues

### P2-1: `backToStep1()` Silently Clears `drawingFile` 🟢

**File:** [js/pages/order-create.js:18](js/pages/order-create.js#L18)

```javascript
async function render() {
    drawingFile = null;   // ← Clears without warning
}
```

### P2-2: Image Detection Uses Filename, Not MIME 🟢

**File:** [js/pages/order-detail.js:683](js/pages/order-detail.js#L683)

```javascript
const isImageFile = drawingName.match(/\.(png|jpg|jpeg|webp)$/i);
```

Extension-less image files render as PDF cards. Harmless but incorrect.

---

## Summary: The Symptom Chain

```
"📎 图纸" label visible, nothing below it:

MOST LIKELY (P0-1/P0-2):
  renderFull() called → #drawing-content created empty
  loadDrawing() NOT called → content stays empty forever
  Trigger: recording exception or cancelling order

ALSO POSSIBLE (P0-5):
  Upload succeeded → file in Storage
  Specs UPDATE failed → drawing_path not in DB
  loadDrawing() runs → drawingPath undefined → "无图纸" shown
  User interprets "无图纸" grey text as "nothing"

ALSO POSSIBLE (P0-3/P0-4):
  loadDrawing() runs but throws → unhandled rejection
  Or elements not found → silent return
  #drawing-content stays in its last state (empty or "加载中...")
```

---

## Recommended Fix (Do Not Implement)

| Fix | File | Lines |
|-----|------|:-----:|
| Add `loadDrawing(currentOrder)` after `renderFull()` on lines 376, 538 | order-detail.js | +2 |
| `await loadDrawing(order)` on lines 49, 422 | order-detail.js | +2 |
| Add `console.warn` in element guard (line 658) | order-detail.js | +1 |
| Add small delay before navigation on upload warning | order-create.js | +2 |

**Total:** 3 files, ~7 lines. Zero schema changes. Zero new features. Trial-compatible.

---

> **Audit complete. No code was changed.**
>
> **试运行冻结期间 — 仅建议，不实施。**
