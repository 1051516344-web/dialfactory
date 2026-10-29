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
      const { data, error, count } = await promise;
      if (error) throw error;
      return { ok: true, data, count };
    } catch (err) {
      console.error('[DB]', err.message || err);
      return { ok: false, error: err.message || 'Unknown error' };
    }
  }

  // ==========================================================
  // Auth helpers (R1 — authenticated-only access)
  // ==========================================================
  async function getUser() {
    const c = get();
    if (!c) return null;
    const { data } = await c.auth.getUser();
    return data?.user || null;
  }

  async function signIn(email, password) {
    const c = get();
    if (!c) return { error: { message: 'DB not initialized' } };
    return c.auth.signInWithPassword({ email, password });
  }

  async function signOut() {
    const c = get();
    if (!c) return;
    return c.auth.signOut();
  }

  function onAuthStateChange(cb) {
    const c = get();
    if (!c) return { data: { subscription: null } };
    return c.auth.onAuthStateChange(cb);
  }

  return { init, get, call, getUser, signIn, signOut, onAuthStateChange };
})();
