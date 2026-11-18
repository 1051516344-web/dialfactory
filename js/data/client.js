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
  /**
   * 判断是否属于「网络 / 超时」类错误。
   * 弱网下 supabase-js 会抛 AuthRetryableFetchError / TypeError: Failed to fetch /
   * TimeoutError 等 —— 这类错误绝不能当成"账号密码错误"或"未登录"。
   */
  function isNetworkError(err) {
    if (!err) return false;
    const name = String(err.name || '');
    const msg = String(err.message || err || '');
    if (/AuthRetryableFetchError|TimeoutError|AbortError|NetworkError/i.test(name)) return true;
    return /failed to fetch|fetch failed|network ?error|network request failed|timeout|timed out|load failed|offline|econn|err_network|err_internet/i.test(msg);
  }

  /**
   * 读取当前登录用户（带错误分类）。
   * 返回 { user, error, networkError }：
   *   networkError = true → 网络不可用（**不要**把用户踢回登录页）
   *   user = null 且无错  → 确实未登录
   */
  async function getUserState() {
    const c = get();
    if (!c) return { user: null, error: { message: 'DB not initialized' }, networkError: false };
    try {
      const { data, error } = await c.auth.getUser();
      if (error) return { user: null, error, networkError: isNetworkError(error) };
      return { user: data?.user || null, error: null, networkError: false };
    } catch (e) {
      return { user: null, error: e, networkError: isNetworkError(e) };
    }
  }

  /** 兼容旧调用：只取用户对象（失败返回 null） */
  async function getUser() {
    const { user } = await getUserState();
    return user;
  }

  /**
   * 等待 supabase-js 从本地存储恢复会话（刷新页面时 JWT 不会立刻挂到后续 REST 请求上）。
   * 返回 Session | null —— 用于在关键读操作前确认"当前到底是以什么身份在查库"。
   */
  async function awaitSession() {
    const c = get();
    if (!c) return null;
    try {
      const { data } = await c.auth.getSession();
      return data?.session || null;
    } catch (e) {
      console.warn('[DB] awaitSession failed:', e);
      return null;
    }
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

  /**
   * 安全的登录态订阅：弱网下 supabase-js 可能误发 SIGNED_OUT。
   * 此时若本地仍能读到会话，则视为网络抖动、直接忽略，
   * 绝不因为一次网络波动就把用户踢回登录页。
   * （真正的 signOut 会先清掉本地会话，因此不会被忽略。）
   */
  function onAuthStateChangeSafe(cb) {
    const c = get();
    if (!c) return { data: { subscription: null } };
    return c.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        let local = null;
        try {
          local = (await c.auth.getSession()).data.session || null;
        } catch (e) {
          console.warn('[DB] 无法确认本地会话，忽略该次 SIGNED_OUT:', e && e.message);
          return;
        }
        if (local) {
          console.warn('[DB] 忽略一次瞬时的 SIGNED_OUT（本地会话仍存在，判定为网络抖动）');
          return;
        }
      }
      try {
        cb(event, session);
      } catch (e) {
        console.error('[DB] onAuthStateChange 回调异常:', e);
      }
    });
  }

  return { init, get, call, getUser, getUserState, isNetworkError, awaitSession, signIn, signOut,
           onAuthStateChange, onAuthStateChangeSafe };
})();
