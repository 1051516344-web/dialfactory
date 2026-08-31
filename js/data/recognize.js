/* ============================================================
   DialFactory V1 · Order Image Recognition API
   Phase 1: sends the order image to a local extract endpoint.
   The URL is NOT hardcoded here — it comes from CONFIG.RECOGNIZE_URL,
   so it can later point at a Supabase Edge Function unchanged.
   No API key lives in the frontend.
   ============================================================ */

const RecognizeAPI = (() => {

  const REQUEST_TIMEOUT_MS = 30000;

  /**
   * Send an order image to the recognition service.
   * @param {File} file — order image (PNG / JPG)
   * @returns { ok, data:{ customer_name, customer_order_no, order_no,
   *                       base_texture, delivery_date, order_quantity } }
   *        | { ok:false, error }
   */
  async function extract(file) {
    if (!file || !(file instanceof File)) {
      return { ok: false, error: '无效的图片文件' };
    }
    if (!CONFIG.RECOGNIZE_URL) {
      return { ok: false, error: '未配置识别服务地址' };
    }

    const form = new FormData();
    form.append('file', file);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(CONFIG.RECOGNIZE_URL, {
        method: 'POST',
        body: form,
        signal: controller.signal
      });

      if (!res.ok) {
        return { ok: false, error: '识别服务返回 ' + res.status };
      }

      const json = await res.json();
      const data = json && json.data ? json.data : json;
      if (!data) return { ok: false, error: '识别服务未返回结果' };

      return { ok: true, data };
    } catch (e) {
      if (e && e.name === 'AbortError') {
        return { ok: false, error: '识别超时，请确认识别服务正常' };
      }
      return { ok: false, error: '无法连接识别服务，请确认服务已启动' };
    } finally {
      clearTimeout(timer);
    }
  }

  return { extract };
})();
