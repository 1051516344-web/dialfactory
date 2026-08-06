/* ============================================================
   DialFactory V1 · Navigation Bar
   ============================================================ */

const NavBar = (() => {

  const LINKS = [
    { href: '#/',              label: '首页',   icon: '🏠' },
    { href: '#/orders',        label: '订单',   icon: '📋' },
    { href: '#/orders/new',    label: '新建',   icon: '➕' },
    { href: '#/routes',        label: '路线',   icon: '🗺'  },
    { href: '#/exceptions',    label: '异常',   icon: '⚠'  },
  ];

  function render() {
    const currentPath = window.location.hash.slice(1) || '/';

    const linksHtml = LINKS.map(link => {
      const linkPath = link.href.slice(1); // remove #
      const isActive = (linkPath === currentPath) ||
                       (linkPath !== '/' && currentPath.startsWith(linkPath));
      return `
        <a href="${link.href}" class="nav-link ${isActive ? 'active' : ''}">
          <span class="nav-icon">${link.icon}</span>
          <span class="nav-label">${link.label}</span>
        </a>
      `;
    }).join('');

    return `
      <nav class="nav-bar">
        <a href="#/" class="nav-brand">
          <span class="nav-brand-icon">🏭</span>
          <span class="nav-brand-text">DialFactory</span>
        </a>
        <div class="nav-links">
          ${linksHtml}
        </div>
      </nav>
    `;
  }

  function mount() {
    const target = document.getElementById('nav-container');
    if (target) {
      target.innerHTML = render();
    }
  }

  /** Update active link after navigation */
  function refresh() {
    mount();
  }

  return { render, mount, refresh };
})();
