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

  /** Strip query string — routes match the path segment only (B20). */
  function cleanPath(path) {
    const q = path.indexOf('?');
    return q >= 0 ? path.slice(0, q) : path;
  }

  function match(path) {
    const p = cleanPath(path);
    for (const route of routes) {
      const m = p.match(route.regex);
      if (m) {
        const params = {};
        route.keys.forEach((key, i) => { params[key] = m[i + 1]; });
        return { route, params };
      }
    }
    return null;
  }

  async function navigate(path) {
    // B20: sync the hash (preserving any query string) without a history entry,
    // so pages like order-list can parse the query from window.location.hash.
    const hash = '#' + path;
    if (window.location.hash !== hash) {
      history.replaceState(null, '', hash);
    }

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
