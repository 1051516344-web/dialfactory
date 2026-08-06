/* ============================================================
   DialFactory V1 · Hash-based SPA Router
   ============================================================ */

const Router = (() => {
  const routes = [];
  let currentPage = null;
  let currentCleanup = null;

  /**
   * Register a route.
   * @param {string} pattern - '/orders/:id' or '/orders'
   * @param {Function} handler - ({ params }) => { render, cleanup }
   */
  function on(pattern, handler) {
    const keys = [];
    const regexStr = pattern.replace(/:(\w+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    });
    routes.push({ pattern, regex: new RegExp(`^${regexStr}$`), keys, handler });
  }

  function match(path) {
    for (const route of routes) {
      const m = path.match(route.regex);
      if (m) {
        const params = {};
        route.keys.forEach((key, i) => { params[key] = m[i + 1]; });
        return { route, params };
      }
    }
    return null;
  }

  async function navigate(path) {
    if (currentCleanup) {
      currentCleanup();
      currentCleanup = null;
    }

    const matched = match(path);
    if (!matched) {
      // fallback to dashboard
      window.location.hash = '#/';
      return;
    }

    const container = document.getElementById('page-container');
    if (!container) return;

    // scroll to top
    window.scrollTo(0, 0);

    const result = await matched.route.handler({ params: matched.params });
    if (result && typeof result.cleanup === 'function') {
      currentCleanup = result.cleanup;
    }
  }

  function start() {
    window.addEventListener('hashchange', () => {
      const path = window.location.hash.slice(1) || '/';
      navigate(path);
    });

    // initial route
    const path = window.location.hash.slice(1) || '/';
    navigate(path);
  }

  return { on, navigate, start };
})();
