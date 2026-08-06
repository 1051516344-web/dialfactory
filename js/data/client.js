/* ============================================================
   DialFactory V1 · Supabase Client Singleton
   ============================================================ */

const DB = (() => {
  let client = null;

  function init() {
    if (client) return client;
    console.log('[DB] window.supabase=', typeof window.supabase, Object.keys(window.supabase || {}));
    const { createClient } = window.supabase;
    if (!createClient) {
      console.error('[DB] createClient not found in window.supabase');
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
