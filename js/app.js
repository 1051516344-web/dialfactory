/* ============================================================
   DialFactory V1 · Application Entry Point
   ============================================================ */

const App = (() => {

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

    // Auth gate — require an authenticated user (R1)
    let user = null;
    try {
      user = await DB.getUser();
    } catch (e) {
      console.warn('[DialFactory] Auth check failed:', e);
    }
    if (!user) {
      // 登录前不复原深层链接：统一落到首页，避免登录后直接进入已删除订单等失效页面
      history.replaceState(null, '', '#/');
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

    console.log('[DialFactory] V1 Ready');
  }

  return { init };
})();

// Boot: use DOMContentLoaded if not yet fired, otherwise init immediately
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
