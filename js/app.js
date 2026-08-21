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
      Login.render();
      return;
    }

    // Verify DB connection
    const { ok, error } = await DB.call(
      db.from('departments').select('count', { count: 'exact', head: true })
    );
    if (!ok) {
      console.error('[DialFactory] DB connection failed:', error);
    } else {
      console.log('[DialFactory] DB connected, departments accessible');
    }

    // Register routes
    registerRoutes();

    // Mount navigation
    NavBar.mount();

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
