/* ============================================================
   DialFactory V1 · Application Entry Point
   ============================================================ */

const App = (() => {

  let authStateBound = false;   // 登录态订阅只绑一次，避免重复监听

  function registerRoutes() {
    // P1 · Dashboard ✅ D-2
    Router.on('/', async () => {
      await DashboardPage.render();
    });

    // P2 · Order List ✅ D-2
    Router.on('/orders', async () => {
      await OrderListPage.render();
    });

    // P3 · Order Create ✅ D-4
    Router.on('/orders/new', async () => {
      await OrderCreatePage.render();
    });

    // P4 · Order Detail ✅ D-3
    Router.on('/orders/:id', async ({ params }) => {
      await OrderDetailPage.render(params.id);
    });

    // Phase 4 · Route Templates (auto-collected) — replaces manual route management
    Router.on('/templates', async () => {
      await RouteTemplatesPage.render();
    });

    // P6 · Exception List ✅ D-5
    Router.on('/exceptions', async () => {
      await ExceptionListPage.render();
    });

    // Batch detail (Phase 4 · Batch layer)
    Router.on('/batches/:id', async ({ params }) => {
      await BatchDetailPage.render(params.id);
    });
  }

  async function init() {
    console.log('[DialFactory] V1 Initializing...');

    // Init Supabase
    const db = DB.init();
    if (!db) {
      document.getElementById('page-container').innerHTML = `
        <div class="card" style="text-align:center;margin-top:48px;">
          <p style="font-size:1.5rem;margin-bottom:8px;">⚠️</p>
          <p style="color:var(--color-danger);">无法连接到数据库。请检查网络后刷新。</p>
        </div>
      `;
      return;
    }

    // Auth gate — R1：先「等会话从本地存储恢复完成」，再校验用户 token。
    // 若跳过这一步，后续 REST 可能以 anon 身份发出，被 RLS 静默过滤成 0 行
    // （表现就是"订单不存在"，实际是请求没带上 JWT）。
    let session = null;
    try {
      session = await DB.awaitSession();
    } catch (e) {
      console.warn('[DialFactory] awaitSession failed:', e);
    }
    // ⚠️ 关键：必须区分「确实未登录」与「弱网导致校验失败」。
    // 后者若直接渲染登录页，用户会误以为账号失效（实测反馈：输对密码也报错）。
    const userState = await DB.getUserState();
    if (!userState.user) {
      if (userState.networkError || navigator.onLine === false) {
        renderNetworkError();
        return;
      }
      // 不做静默跳转：保留用户原本的目标地址，登录成功后仍可回到该页面
      Login.render();
      return;
    }

    // （已移除）原先这里额外发一次 departments count 请求做"连通性检查"，
    // 但结果只用于 console.log —— 纯浪费一次串行往返，且阻塞首屏渲染。
    // 真正的连接错误会在首个页面请求时由 DB.call 报出。

    // Register routes
    registerRoutes();

    // Mount navigation
    NavBar.mount();

    // 启动时规范空 hash / 裸 # → #/：保证任何情况下都平稳落在首页，
    // 而不是把浏览器记住的失效链接当成首屏内容。
    if (!window.location.hash || window.location.hash === '#') {
      history.replaceState(null, '', '#/');
    }

    // Start router
    Router.start();

    // Refresh nav on route change
    window.addEventListener('hashchange', () => {
      NavBar.refresh();
    });

    // 登录态变化：弱网误发的 SIGNED_OUT 已在 DB 层过滤，只有真正登出才回登录页
    if (!authStateBound) {
      authStateBound = true;
      DB.onAuthStateChangeSafe((event) => {
        if (event === 'SIGNED_OUT') Login.render();
      });
    }

    console.log('[DialFactory] V1 Ready');
  }

  /**
   * 弱网 / 离线落地面：明确告知是「网络问题」而不是「账号问题」，并提供重试。
   * 不渲染登录页 —— 否则用户会以为自己被登出、反复输密码。
   */
  function renderNetworkError() {
    const container = document.getElementById('page-container');
    if (!container) return;
    const nav = document.getElementById('nav-container');
    if (nav) nav.innerHTML = '';
    container.innerHTML = `
      <div class="card" style="text-align:center;max-width:440px;margin:10vh auto 0;padding:var(--space-xl);">
        <p style="font-size:2rem;">📡</p>
        <p style="font-weight:600;margin-bottom:var(--space-xs);">网络连接异常</p>
        <p style="color:var(--text-secondary);font-size:var(--font-size-sm);line-height:1.6;">
          无法连接服务器，请检查 Wi-Fi / 移动数据后重试。<br>
          你的登录状态不会因此失效，网络恢复后无需重新登录。
        </p>
        <button class="btn btn-primary" style="margin-top:var(--space-md);" onclick="location.reload()">重新连接</button>
      </div>
    `;
    if (window.Toast && typeof Toast.error === 'function') {
      Toast.error('网络连接异常，请检查网络后刷新页面');
    }
  }

  return { init };
})();

// Boot: use DOMContentLoaded if not yet fired, otherwise init immediately
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
