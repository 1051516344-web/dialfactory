/* ============================================================
   DialFactory V1 · Loading Skeleton
   ============================================================ */

const Skeleton = (() => {

  /** Single skeleton card placeholder */
  function card() {
    return `
      <div class="skeleton-card">
        <div class="skeleton-line skeleton-line-lg"></div>
        <div class="skeleton-line skeleton-line-sm"></div>
        <div class="skeleton-line skeleton-line-md"></div>
      </div>
    `;
  }

  /** Multiple skeleton cards */
  function cards(count = 3) {
    return Array.from({ length: count }, () => card()).join('');
  }

  /** Full page loading skeleton */
  function page() {
    return `
      <div class="skeleton-page">
        <div class="skeleton-header">
          <div class="skeleton-line skeleton-line-xl"></div>
        </div>
        ${cards(5)}
      </div>
    `;
  }

  return { card, cards, page };
})();
