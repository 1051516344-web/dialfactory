/* ============================================================
   DialFactory V1 · Route Templates API
   Phase 4: Auto-collect process routes during trial phase.
   Deduplication: route_signature (ordered process names).
   Same signature → increment used_count + append order.
   ============================================================ */

const RouteTemplatesAPI = (() => {

  /**
   * Generate a route signature from process names in order.
   * Example: "冲板-切窗-磨板-电镀-喷漆-网印-装钉-QC"
   * @param {Array} processList - [{ order, process, department }, ...]
   * @returns {string}
   */
  function buildSignature(processList) {
    return processList
      .sort((a, b) => a.order - b.order)
      .map(p => p.process)
      .join('-');
  }

  /**
   * Auto-generate a readable template name from the signature.
   * Uses first and last process names when brevity is needed,
   * otherwise falls back to "Route-NNN".
   * @param {string} signature - e.g. "冲板-切窗-电镀"
   * @param {number} seq - sequence number for fallback
   * @returns {string}
   */
  function generateName(signature, seq) {
    const parts = signature.split('-');
    if (parts.length <= 4) return signature;
    // Longer routes: use first + last
    return parts[0] + ' → ' + parts[parts.length - 1];
  }

  /**
   * Save a route as a template.
   * If a template with the same route_signature already exists,
   * increment used_count, update last_used_at, and append the order.
   * Only creates a new template when the signature is truly new.
   *
   * @param {Array} processList - [{ order, process, department }, ...]
   * @param {string} orderId   - UUID of the order being saved
   * @returns { ok, data } - data is the template record (new or updated)
   */
  async function saveRouteTemplate(processList, orderId) {
    if (!processList || processList.length === 0) {
      return { ok: false, error: 'Empty process list' };
    }

    const routeSignature = buildSignature(processList);

    // 1. Query by route_signature directly (database-level dedup)
    const { ok, data: existing } = await DB.call(
      DB.get().from('process_route_templates')
        .select('id, used_count, associated_orders')
        .eq('route_signature', routeSignature)
        .maybeSingle()
    );

    // 2. Match found — increment + append order
    if (ok && existing) {
      const prevOrders = existing.associated_orders || [];
      const newOrders = orderId && !prevOrders.includes(orderId)
        ? [...prevOrders, orderId]
        : prevOrders;

      return DB.call(
        DB.get().from('process_route_templates')
          .update({
            used_count: existing.used_count + 1,
            last_used_at: new Date().toISOString(),
            associated_orders: newOrders
          })
          .eq('id', existing.id)
          .select().single()
      );
    }

    // 3. No match — create new template
    // Get current count for sequence number
    const { count } = await DB.call(
      DB.get().from('process_route_templates')
        .select('*', { count: 'exact', head: true })
    );
    const seq = (count || 0) + 1;
    const name = generateName(routeSignature, seq);

    return DB.call(
      DB.get().from('process_route_templates')
        .insert({
          template_name: name,
          route_signature: routeSignature,
          process_list: processList,
          process_count: processList.length,
          used_count: 1,
          associated_orders: orderId ? [orderId] : [],
          last_used_at: new Date().toISOString()
        })
        .select().single()
    );
  }

  /**
   * List all templates, newest first.
   */
  async function list() {
    return DB.call(
      DB.get().from('process_route_templates')
        .select('*')
        .order('last_used_at', { ascending: false })
    );
  }

  /**
   * Get a single template by ID.
   */
  async function getById(id) {
    return DB.call(
      DB.get().from('process_route_templates')
        .select('*')
        .eq('id', id)
        .single()
    );
  }

  return { saveRouteTemplate, list, getById, buildSignature };
})();
