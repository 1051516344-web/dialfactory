/* ============================================================
   DialFactory V1 · DOM Helpers
   ============================================================ */

const DOM = (() => {

  /** Create element with attributes and children */
  function create(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, val] of Object.entries(attrs)) {
      if (key === 'className') {
        el.className = val;
      } else if (key === 'dataset') {
        Object.assign(el.dataset, val);
      } else if (key.startsWith('on') && typeof val === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), val);
      } else {
        el.setAttribute(key, val);
      }
    }
    for (const child of children) {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        el.appendChild(child);
      }
    }
    return el;
  }

  /** Shortcut: querySelector */
  function $(selector, parent = document) {
    return parent.querySelector(selector);
  }

  /** Shortcut: querySelectorAll */
  function $$(selector, parent = document) {
    return Array.from(parent.querySelectorAll(selector));
  }

  /** Clear container and set innerHTML */
  function render(container, html) {
    if (typeof container === 'string') {
      container = $(container);
    }
    if (container) {
      container.innerHTML = html;
    }
    return container;
  }

  /**
   * HTML-escape a string for BOTH text and attribute contexts.
   * Escapes & < > " ' — the per-page escapeHTML helpers only escaped
   * & < > (via textContent), leaving attribute-context XSS (B15).
   */
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Show element */
  function show(el) {
    if (typeof el === 'string') el = $(el);
    if (el) el.style.display = '';
  }

  /** Hide element */
  function hide(el) {
    if (typeof el === 'string') el = $(el);
    if (el) el.style.display = 'none';
  }

  return { create, $, $$, render, show, hide, escapeHtml };
})();
