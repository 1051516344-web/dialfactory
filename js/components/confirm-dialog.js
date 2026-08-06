/* ============================================================
   DialFactory V1 · Confirm Dialog
   Reusable modal for: pause reason, rework confirm,
   append form, exception form, qty_out input.
   ============================================================ */

const ConfirmDialog = (() => {

  let overlayEl = null;

  function show({ title, content, confirmLabel = '确认', cancelLabel = '取消', onConfirm, onCancel, dangerous = false }) {
    // Remove existing
    close();

    overlayEl = document.createElement('div');
    overlayEl.className = 'dialog-overlay';
    overlayEl.innerHTML = `
      <div class="dialog-box">
        <div class="dialog-title">${escapeHTML(title)}</div>
        <div class="dialog-content">${content}</div>
        <div class="dialog-actions">
          <button class="btn btn-ghost cancel-btn">${escapeHTML(cancelLabel)}</button>
          <button class="btn ${dangerous ? 'btn-danger' : 'btn-primary'} confirm-btn">${escapeHTML(confirmLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlayEl);

    // Events
    const confirmBtn = overlayEl.querySelector('.confirm-btn');
    const cancelBtn = overlayEl.querySelector('.cancel-btn');

    function cleanup() {
      if (overlayEl) {
        overlayEl.remove();
        overlayEl = null;
      }
    }

    confirmBtn.addEventListener('click', () => {
      // Collect form data
      const inputs = overlayEl.querySelectorAll('input, select, textarea');
      const formData = {};
      inputs.forEach(el => {
        if (el.name) formData[el.name] = el.value;
      });
      cleanup();
      if (onConfirm) onConfirm(formData);
    });

    cancelBtn.addEventListener('click', () => {
      cleanup();
      if (onCancel) onCancel();
    });

    // Click overlay to cancel
    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) {
        cleanup();
        if (onCancel) onCancel();
      }
    });

    // ESC to cancel
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        cleanup();
        if (onCancel) onCancel();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Focus confirm button
    setTimeout(() => confirmBtn?.focus(), 100);
  }

  function close() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  return { show, close };
})();
