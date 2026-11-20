/* ============================================================
   DialFactory V1 · Supabase Storage API
   Drawing upload/download — bucket: drawings (private)
   ============================================================ */

const StorageAPI = (() => {

  const BUCKET = 'drawings';
  const MAX_SIZE = 10 * 1024 * 1024; // 10 MiB
  const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
  const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg'];
  const SIGNED_URL_TTL = 86400; // 24 hours

  /**
   * Check if a file's type is allowed. Hybrid: MIME first, extension fallback.
   * Fix: file.type can be empty string for files from WeChat, downloads, etc.
   */
  function isAllowedFileType(file) {
    if (!file) return false;
    // Primary: MIME type check
    if (ALLOWED_TYPES.includes(file.type)) return true;
    // Fallback: extension check (handles empty file.type from WeChat/browser quirks)
    const ext = (file.name || '').split('.').pop().toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext);
  }

  /**
   * Upload a drawing file and attach to an existing order.
   * Rules:
   *  - Never replaces — upsert: false
   *  - Path: drawings/{orderId}/{timestamp}-{safeFilename}
   *  - Updates orders.specs with { drawing_name, drawing_path }
   *
   * @returns { ok, data: { name, path } } | { ok: false, error }
   */
  async function uploadDrawing(orderId, file) {
    // Validate type
    if (!file || !(file instanceof File)) {
      return { ok: false, error: '无效的文件' };
    }
    if (!isAllowedFileType(file)) {
      return { ok: false, error: '仅支持 PDF / PNG / JPEG 格式' };
    }
    if (file.size > MAX_SIZE) {
      return { ok: false, error: '文件大小不能超过 10 MB' };
    }

    // Generate safe filename (ASCII-only, no spaces, no Chinese, no special chars)
    const ts = Date.now();
    const rawExt = (file.name || '').split('.').pop().toLowerCase();
    const ext = (rawExt && rawExt.length <= 6 && /^[a-z0-9]+$/.test(rawExt)) ? rawExt : 'jpg';
    const randomId = Math.random().toString(36).substring(2, 8);
    const storagePath = `${orderId}/${ts}-${randomId}.${ext}`;

    // Upload to Supabase Storage (upsert: false — never replace)
    const db = DB.get();
    const { data: uploadData, error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('[Storage] Upload failed:', uploadError.message);
      return { ok: false, error: uploadError.message };
    }

    const storedPath = uploadData?.path || storagePath;

    // Read current order specs, merge drawing metadata
    const { data: orderData, error: readError } = await DB.call(
      db.from('orders').select('specs').eq('id', orderId).single()
    );

    if (readError) {
      // Order exists (just created), but if read fails, build minimal specs
      console.warn('[Storage] Could not read order specs, using minimal:', readError.message);
    }

    const currentSpecs = (orderData && orderData.specs) ? orderData.specs : {};
    const newSpecs = {
      ...currentSpecs,
      drawing_name: file.name,
      drawing_path: storedPath
    };

    // Update order.specs
    const { error: updateError } = await DB.call(
      db.from('orders').update({ specs: newSpecs }).eq('id', orderId)
    );

    if (updateError) {
      console.error('[Storage] Specs update failed:', updateError.message);
      // File was uploaded but metadata failed — return ok with warning
      return { ok: true, data: { name: file.name, path: storedPath }, warning: '图纸已上传，但规格更新失败' };
    }

    return { ok: true, data: { name: file.name, path: storedPath } };
  }

  /**
   * Get a displayable URL for a stored drawing.
   * Uses signed URL (24h) for private bucket access.
   * Falls back to blob download if signed URL fails.
   *
   * @returns { ok, data: url } | { ok: false, error }
   */
  async function getDrawingUrl(storedPath) {
    if (!storedPath) return { ok: false, error: 'No path provided' };

    const db = DB.get();

    // Try signed URL first
    const { data: signedData, error: signedError } = await db.storage
      .from(BUCKET)
      .createSignedUrl(storedPath, SIGNED_URL_TTL);

    if (!signedError && signedData?.signedUrl) {
      return { ok: true, data: signedData.signedUrl, type: 'signed' };
    }

    // Fallback: download blob and create object URL
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

  /**
   * Check if a file type is an image (for thumbnail rendering).
   */
  function isImage(mimeType) {
    return mimeType && mimeType.startsWith('image/');
  }

  /**
   * Validate a file before upload (client-side pre-check).
   * @returns { valid: boolean, error?: string }
   */
  function validateFile(file) {
    if (!file || !(file instanceof File)) {
      return { valid: false, error: '无效的文件' };
    }
    if (!isAllowedFileType(file)) {
      return { valid: false, error: '仅支持 PDF / PNG / JPEG 格式' };
    }
    if (file.size > MAX_SIZE) {
      return { valid: false, error: '文件大小不能超过 10 MB' };
    }
    return { valid: true };
  }

  return { uploadDrawing, getDrawingUrl, isImage, validateFile, isAllowedFileType, BUCKET, ALLOWED_TYPES, ALLOWED_EXTENSIONS, MAX_SIZE };
})();
