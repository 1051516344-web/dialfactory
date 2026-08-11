# Phase 3-D · Drawing Attachment Audit

> **Status:** Audit Complete — Implementation NOT Started
> **Type:** Pre-implementation feasibility assessment
> **Constraint:** Drawing belongs to order only — NOT a product entity, library, or versioned object

---

## 1. Audit Questions — Answers

| # | Question | Answer |
|:--:|----------|--------|
| 1 | Does orders table have attachment storage? | **No.** Zero attachment/drawing columns. No `drawing_url`, no `attachment_path`. |
| 2 | Can existing JSONB fields store drawing metadata? | **Yes.** `specs` JSONB (`DEFAULT '{}'`) is unused except for `base_plate_color`. Designed in Phase 0-A.2 as the extension point for spec data. |
| 3 | Is Supabase Storage already configured? | **Partially.** Storage service is enabled. No buckets created. No storage code in the app. |
| 4 | What files need modification? | 4 files + 1 bucket setup (see §5) |

---

## 2. Current Schema Analysis

### 2.1 `orders` Table — Attachment-Related Columns

```
Column           Type     Default     Used For
───────────────  ───────  ─────────   ──────────────────────────
specs            JSONB    '{}'        base_plate_color + future spec fields
route_snapshot   JSONB    '{}'        Route Builder step selection
note             TEXT     NULL        Free-text remarks
```

| Column | Can Store Drawing? | Verdict |
|--------|:---:|---------|
| `specs` | ✅ `{ drawing_name, drawing_path }` | **Best fit.** Extensible, already active, no schema change. |
| `route_snapshot` | ❌ Semantically wrong | Route definition, not order metadata. |
| `note` | ❌ Free text | Would embed URL as text — no structure, no validation. |
| New column | ❌ Schema change | Violates "no schema changes" rule. |

### 2.2 Storage Strategy

```
┌─────────────────────────────────────────────────────┐
│                   orders 表                           │
│  ┌───────────────────────────────────────────────┐  │
│  │ specs JSONB                                     │  │
│  │ {                                               │  │
│  │   "base_plate_color": "黑色喷漆",                │  │
│  │   "drawing_name": "ACC-2026-0088-图纸.png",      │  │
│  │   "drawing_path": "drawings/abc123/xxx.png"     │  │
│  │ }                                               │  │
│  └───────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────┘
                       │ path pointer
                       ▼
┌─────────────────────────────────────────────────────┐
│              Supabase Storage                        │
│  Bucket: drawings/                                   │
│  └── {order_id}/                                     │
│      └── customer-drawing.png                        │
└─────────────────────────────────────────────────────┘
```

**Bucket path pattern:** `drawings/{order_id}/{timestamp}-{filename}`

- `{order_id}` — ensures order ownership, prevents collision
- `{timestamp}` — avoids filename conflicts when re-uploading
- `{filename}` — original name for display

### 2.3 Why NOT a Separate Table

| Approach | Pros | Cons | Verdict |
|----------|------|------|:-------:|
| `order_drawings` table | Normalized, queryable, multi-file ready | Schema change, FK constraints, overkill for V1 | ❌ |
| `specs JSONB` | No schema change, co-located with order data, simple | Not queryable via SQL (PostgREST can't filter JSONB deeply) | ✅ |
| New column `drawing_url TEXT` | Simple, directly queryable | Schema change, single URL only, no metadata | ❌ |

**Decision:** `specs JSONB`. The user's rule is "Drawing belongs to order only" — co-locating in `specs` keeps the drawing metadata with the order it belongs to. No separate entity, no library, no versioning.

---

## 3. Supabase Storage Readiness

### 3.1 Service Status

| Item | Status | Detail |
|------|:------:|--------|
| Storage service | ✅ Enabled | `config.toml [storage] enabled = true` |
| File size limit | ✅ 50 MiB | More than enough for drawings (typical: 1-5MB images) |
| S3 protocol | ✅ Enabled | `[storage.s3_protocol] enabled = true` |
| Image transform | ❌ Not enabled | Pro plan feature — not needed for V1 download |
| **Buckets** | ❌ **None** | Bucket config commented out — must be created |

### 3.2 SDK Availability

```javascript
// index.html (line 68-69)
import { createClient } from '@supabase/supabase-js';
window.supabase = { createClient };

// client.js (line 15)
client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

// Supabase JS v2 client has:
client.storage           // ✅ Storage API available
  .from('drawings')      // bucket reference
  .upload(path, file)    // upload
  .getPublicUrl(path)    // public URL
  .download(path)        // download blob
  .remove([paths])       // delete
```

**No new SDK dependency.** The existing `@supabase/supabase-js@2` import already includes the Storage client.

### 3.3 Bucket Setup Required (Manual Step)

Must be done once in Supabase Dashboard before deployment:

```
Dashboard → Storage → New Bucket
  Name: drawings
  Public bucket: NO (access via SDK, not public URL)
  File size limit: 10 MiB
  Allowed MIME types: image/png, image/jpeg, image/webp, application/pdf
```

Or via SQL (requires `service_role` key — same constraint as DDL):
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('drawings', 'drawings', false, 10485760,
        '{"image/png","image/jpeg","image/webp","application/pdf"}');
```

**Storage RLS Policy** (same pattern as existing RLS — V1 full access):
```sql
CREATE POLICY "V1: full access" ON storage.objects
  FOR ALL USING (bucket_id = 'drawings');
```

---

## 4. Security Considerations

| Concern | Assessment | Mitigation |
|---------|------------|------------|
| **Unauthenticated upload** | V1 is internal intranet. Anon key already has full DB access. | Accept for V1. Same trust model as existing RLS (`USING (true)`). |
| **File type restriction** | Drawings should be images/PDF only | Bucket MIME type whitelist at Storage level |
| **File size abuse** | Anon users could upload large files | 10 MiB bucket limit |
| **Path traversal** | `order_id` from route params could be manipulated | UUID validation + bucket-scoped paths |
| **Cross-order access** | User could guess another order's path | Accept for V1 — same as existing: anyone can view any order |
| **V2 hardening** | V2 will add auth | Storage RLS policy replaced with role-based conditions alongside table RLS |

**Bottom line:** V1's security model is "trusted intranet users, full access." Drawing storage follows the same model. No new attack surface beyond what already exists.

---

## 5. Implementation Scope

### 5.1 Files to Create

| File | Purpose | Lines (est.) |
|------|---------|:---:|
| `js/data/storage.js` | Drawing upload/download/delete via Supabase Storage API | ~60 |

### 5.2 Files to Modify

| File | Change | Impact |
|------|--------|--------|
| `js/pages/order-detail.js` | Add drawing section: thumbnail, upload button, download link | ~40 lines |
| `index.html` | Add `js/data/storage.js` to script chain (before pages) | 1 line |

### 5.3 Files NOT Modified

| File | Reason |
|------|--------|
| `js/pages/order-create.js` | Drawing is NOT attached at creation. Factory attaches drawing later (or it's added when the file arrives). Optional: add upload to Step 1 if user requests. |
| `js/data/orders.js` | `specs` is already selected via `SELECT *`. No query change needed. |
| `js/domain/order-create.js` | `specs` already in orderData. Drawing metadata not set at create time. |
| `supabase/migrations/` | No DDL change. Bucket created via Dashboard, not migration. |
| `js/config.js` | Bucket name hardcoded in storage.js (or add `DRAWING_BUCKET: 'drawings'` to CONFIG). |

### 5.4 Bucket Setup (Manual — Once)

```
Supabase Dashboard:
  https://supabase.com/dashboard/project/wzfkmwrqnvjegunjueka/storage
  → New Bucket "drawings"
  → NOT public
  → 10 MiB limit
  → MIME: image/png, image/jpeg, image/webp, application/pdf
```

### 5.5 Data Flow

```
UPLOAD:
  User selects file (input[type=file])
  → storage.js: validate type/size (client-side)
  → storage.js: upload to drawings/{order_id}/{timestamp}-{name}
  → storage.js: get public URL
  → orders.specs: UPDATE { drawing_name, drawing_path }
  → order-detail.js: re-render thumbnail

DOWNLOAD:
  User clicks thumbnail
  → window.open(publicUrl) or fetch + download blob
  → Browser handles display/download

DELETE (re-upload):
  User uploads new drawing
  → storage.js: remove old file at drawing_path
  → storage.js: upload new file
  → orders.specs: UPDATE with new metadata
```

---

## 6. Recommendation Summary

| Dimension | Recommendation |
|-----------|---------------|
| **Storage method** | Supabase Storage bucket `drawings` |
| **Metadata location** | `orders.specs.drawings` — array of `{name, path, size, type, uploaded_at}` |
| **Schema impact** | **Zero.** No new tables, no new columns. Bucket creation is infra, not schema. |
| **Code footprint** | 1 new file (`storage.js`), 1 modified file (`order-detail.js`), 1 config line |
| **Security** | V1 anon-key model. Bucket private, MIME restricted. Hardening deferred to V2. |
| **Multi-file support** | `specs.drawings` is an array — supports 1 or N drawings per order naturally |
| **Rollback** | Delete bucket + revert 2 JS files. No DB migration to undo. |

---

## 7. Implementation Phase (NOT YET)

```
Preflight checklist:
  [ ] Bucket "drawings" created in Supabase Dashboard
  [ ] Storage RLS policy applied
  [ ] js/data/storage.js created (upload, getUrl, remove)
  [ ] js/pages/order-detail.js — drawing upload + display section
  [ ] index.html — storage.js in script chain
  [ ] Smoke test: upload → display → delete → re-upload
```

**Blockers:** None. All prerequisites exist. Ready for implementation when user approves.

---

> **Related:** [59-Order-Specification-Audit.md](AI_CONTEXT/Phase3/59-Order-Specification-Audit.md) — `specs` JSONB is the recommended expansion point for all flexible spec fields, including drawings.
