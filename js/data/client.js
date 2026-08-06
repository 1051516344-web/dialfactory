/* ============================================================
   DialFactory V1 · Supabase Client Singleton
   ============================================================ */

const DB = (() => {
  let client = null;

  function init() {
    if (client) return client;
    const { createClient } = window.supabase;
    if (!createClient) {
      console.error('[DB] Supabase SDK not loaded');
      return null;
    }
    client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    return client;
  }

  function get() {
    if (!client) init();
    return client;
  }

  /**
   * Standard API call wrapper.
   * Returns { ok: true, data } | { ok: false, error: string }
   */
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

  return { init, get, call };
})();
