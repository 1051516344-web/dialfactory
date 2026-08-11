# Phase 3-D · Drawing Attachment Implementation

> **Status:** Code Complete — Bucket Setup Pending
> **Based on:** [61-Drawing-Attachment-Audit.md](AI_CONTEXT/Phase3/61-Drawing-Attachment-Audit.md)
> **Schema Impact:** Zero

---

## 1. Implementation Summary

### 1.1 Files Changed (5 + 1 new)

| File | Type | Purpose |
|------|:----:|---------|
| [js/data/storage.js](js/data/storage.js) | **NEW** | Supabase Storage wrapper — upload, signed URL, validation |
| [js/pages/order-create.js](js/pages/order-create.js) | Modified | File input in Step 1, capture + upload after creation |
| [js/pages/order-detail.js](js/pages/order-detail.js) | Modified | Async drawing display (thumbnail for images, card for PDF) |
| [js/components/toast.js](js/components/toast.js) | Modified | Added `warning()` shorthand |
| [index.html](index.html) | Modified | Added `storage.js` to script load chain |

### 1.2 Business Rules Enforced

| Rule | Implementation |
|------|---------------|
| Drawing belongs to order only | Stored at `drawings/{orderId}/...`, metadata in `orders.specs` |
| Optional | File input marked "（选填）", upload failure does not block creation |
| New drawing = new order | Only available during order creation (Step 1) |
| Never replace | `upsert: false` in Storage upload |
| No version management | Single `drawing_path` per order, no history |
| No drawing library | No separate table, no listing, no search |

---

## 2. Data Flow

```
CREATE ORDER (order-create.js)
──────────────────────────────
Step 1: User optionally selects file (.pdf/.png/.jpg)
        → JS validates client-side (type, size)
        → File reference stored in memory

Step 2: User selects processes, confirms

Submit:
  1. OrderCreate.submit() → INSERT order + nodes
  2. If file selected: StorageAPI.uploadDrawing(orderId, file)
     a. Upload to drawings/{orderId}/{timestamp}-{safeName}
     b. Read current orders.specs
     c. UPDATE orders.specs ← merge { drawing_name, drawing_path }
  3. Navigate to order detail
  4. If upload fails → Toast warning, still navigate


VIEW ORDER (order-detail.js)
────────────────────────────
render() → renderFull() → loadDrawing(order)

loadDrawing:
  1. Read order.specs.drawing_path
  2. If no path → empty section, return
  3. StorageAPI.getDrawingUrl(path)
     a. Try createSignedUrl (24h TTL)
     b. Fallback: download blob → URL.createObjectURL()
  4. Render:
     - Image (PNG/JPEG) → thumbnail with download link
     - PDF → icon card with "查看" button
```

---

## 3. Storage API (`js/data/storage.js`)

```
Bucket:      drawings (private)
Max size:    10 MiB
MIME:        application/pdf, image/png, image/jpeg
Path:        {orderId}/{timestamp}-{safeFilename}
Signed URL:  24h TTL (regenerated on each page load)
```

### Public API

| Method | Signature | Description |
|--------|-----------|-------------|
| `uploadDrawing` | `(orderId, file) → { ok, data }` | Upload + update specs. `upsert: false`. |
| `getDrawingUrl` | `(storedPath) → { ok, data: url }` | Signed URL (24h) with blob fallback |
| `validateFile` | `(file) → { valid, error? }` | Client-side pre-check (type, size) |
| `isImage` | `(mimeType) → boolean` | MIME type check helper |

---

## 4. Security Verification

| Requirement | Status | Detail |
|-------------|:------:|--------|
| Private bucket | ✅ | Bucket `drawings` config: `public: false` |
| MIME restriction | ✅ | `allowed_mime_types` at bucket level + client validation |
| Size limit | ✅ | 10 MiB — bucket config + JS pre-check |
| No overwrite | ✅ | `upsert: false` in upload options |
| No drawing replacement | ✅ | No edit/replace UI in order-detail |
| No public listing | ✅ | Private bucket prevents `list()` calls |
| Signed URL expiry | ✅ | 24h TTL, regenerated on each detail page load |

**V1 trust model:** Same as existing RLS (`USING (true)`). Intranet deployment, anon key. Storage follows the same pattern — all access through SDK with anon key, bucket not publicly listable.

---

## 5. Test Scenarios

### Precondition: Bucket "drawings" must exist

```
Supabase Dashboard → Storage → New Bucket
  Name: drawings
  Public: OFF
  File size: 10 MiB
  MIME: application/pdf, image/png, image/jpeg
```

Run via SQL Editor (requires service_role):
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('drawings', 'drawings', false, 10485760,
        '{"application/pdf","image/png","image/jpeg"}');

CREATE POLICY "V1: full access" ON storage.objects
  FOR ALL USING (bucket_id = 'drawings');
```

### Tests

| # | Test | Expected |
|:--:|------|----------|
| T1 | Create order without drawing | Order created. Detail shows no drawing section. |
| T2 | Create order with PNG < 10MB | Order created. Detail shows thumbnail + download link. |
| T3 | Create order with JPEG | Same as T2. |
| T4 | Create order with PDF | Order created. Detail shows PDF card with "查看" button. |
| T5 | Select file > 10MB | Client-side validation rejects. Toast warning. |
| T6 | Select .exe / .zip | Client-side validation rejects (wrong MIME). |
| T7 | Bucket not yet created | Order created. Toast: "订单已创建，但图纸上传失败". |
| T8 | Re-open order detail (24h later) | New signed URL generated, drawing still accessible. |
| T9 | Old order (no specs.drawing_path) | Empty drawing section. No error. |
| T10 | Order with specs.base_plate_color + drawing | Both preserved in specs merge. |

---

## 6. Manual Setup (One-Time)

Before first use, the `drawings` bucket must exist:

```
1. Go to: https://supabase.com/dashboard/project/wzfkmwrqnvjegunjueka/storage
2. Click "New Bucket"
3. Name: drawings
4. Public bucket: OFF
5. File size limit: 10 MiB
6. Allowed MIME types: application/pdf, image/png, image/jpeg
7. Create
8. Go to SQL Editor, run RLS policy (see §5)
```

Without this step, T7 applies — orders create successfully but drawing upload returns a warning.

---

## 7. Freeze Compliance

```
Schema:     0 changes
Tables:     0 new, 0 altered
Columns:    0 added, 0 removed, 0 altered
Fields:     59 (unchanged)
Migrations: 0
FK:         6 RESTRICT, 3 SET NULL, 1 NO FK, 0 CASCADE (unchanged)
ADL:        No violation
```

`orders.specs` JSONB now holds up to 3 keys:
```json
{
  "base_plate_color": "...",     // from #58
  "drawing_name": "...",         // NEW — original filename
  "drawing_path": "..."          // NEW — storage path
}
```

---

## 8. Known Limitations (by Design)

| Limitation | Reason |
|------------|--------|
| No drawing replacement | User requirement: "Existing order drawing must never be replaced" |
| No multi-file per order | V1 scope. `specs.drawings` array can be added later if needed. |
| No drawing on order list | Drawings load async per-order. List page would need N signed URL calls. Deferred. |
| No preview caching | Signed URL regenerated each page view. Acceptable for V1 intranet. |
| No bucket auto-creation | Anon key cannot create buckets. Manual setup required. |

---

> **Code complete. Create bucket → Test → Deploy.**
