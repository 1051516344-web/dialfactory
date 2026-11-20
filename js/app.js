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

  /**
   * 挂载路由 / 导航 / 页面 —— **不含任何鉴权网络等待**。
   * 抽出来的目的：有本地会话时可以立刻渲染首屏，把 token 校验丢到后台。
   */
  function startApp() {
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

    // ==========================================================
    // Auth gate（**不阻塞首屏**）
    // ① 只等「本地会话」：getSession() 读本地存储，正常情况下不发网络请求（毫秒级）。
    //    无会话 → 直接登录页（离线则网络提示），绝不为了确认登录态而空等。
    // ② 有会话 → 立刻 startApp() 渲染页面；token 校验丢到后台异步跑。
    //    校验只有「确实失效」才回登录页；网络失败一律不踢人。
    // 收益：首屏少一个到东京的 RTT（实测 ttfb ≈ 0.32s，弱网可达数秒）。
    // ==========================================================
    let session = null;
    try {
      session = await DB.awaitSession();
    } catch (e) {
      console.warn('[DialFactory] awaitSession failed:', e);
    }

    if (!session) {
      // 未登录 / 本地会话已丢失：用 navigator.onLine 这个零成本信号区分离线
      if (navigator.onLine === false) {
        renderNetworkError();
        return;
      }
      // 不做静默跳转：保留用户原本的目标地址，登录成功后仍可回到该页面
      Login.render();
      return;
    }

    // 有会话：先渲染，不等网络
    startApp();

    // 后台校验 token（刻意不 await —— 不把 RTT 压在首屏上）
    DB.getUserState().then((userState) => {
      if (userState.user) return;
      if (userState.networkError || navigator.onLine === false) {
        console.warn('[DialFactory] 后台鉴权校验失败（网络原因），保持当前会话，不踢回登录页');
        return;
      }
      console.warn('[DialFactory] 会话已失效，返回登录页');
      Login.render();
    }).catch((e) => console.warn('[DialFactory] 后台鉴权校验异常:', e));
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
