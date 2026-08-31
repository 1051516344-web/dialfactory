/* ============================================================
   DialFactory V1 · Toast Notifications
   ============================================================ */

const Toast = (() => {

  let containerEl = null;

  function ensureContainer() {
    if (!containerEl) {
      containerEl = document.createElement('div');
      containerEl.className = 'toast-container';
      document.body.appendChild(containerEl);
    }
    return containerEl;
  }

  function show(message, type = 'info', duration = 3000) {
    const container = ensureContainer();
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.2s';
      setTimeout(() => el.remove(), 200);
    }, duration);
  }

  function success(msg) { show(msg, 'success', 2500); }
  function error(msg)   { show(msg, 'error',   4000); }
  function warning(msg) { show(msg, 'warning', 5000); }
  function info(msg)    { show(msg, 'info',    3000); }

  return { show, success, error, warning, info };
})();
