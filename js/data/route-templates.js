/* ============================================================
   DialFactory V1 · Route Templates API
   Phase 4: Auto-collect process routes during trial phase.
   ============================================================ */

const RouteTemplatesAPI = (() => {

  /**
   * Save a route as a template. If the exact same (process, department)
   * sequence already exists, increment used_count instead of creating new.
   *
   * @param {Array} processList - [{ order, process, department }, ...]
   * @returns { ok, data } - data is the template record (new or updated)
   */
  async function saveRouteTemplate(processList) {
    if (!processList || processList.length === 0) return { ok: false, error: 'Empty process list' };

    // 1. Generate fingerprint: ordered (process, dept) pairs
    const fingerprint = JSON.stringify(processList.map(p => [p.process, p.department]));

    // 2. Fetch ALL templates with process_list in one query
    const { ok, data: allTemplates } = await DB.call(
      DB.get().from('process_route_templates')
        .select('id, used_count, process_list')
        .order('created_at', { ascending: true })
    );

    // 3. Check for duplicate by comparing fingerprints
    if (ok && allTemplates) {
      for (const tpl of allTemplates) {
        const existingFp = JSON.stringify(
          (tpl.process_list || []).map(p => [p.process, p.department])
        );
        if (existingFp === fingerprint) {
          // Match — increment used_count
          return DB.call(
            DB.get().from('process_route_templates')
              .update({
                used_count: tpl.used_count + 1,
                last_used_at: new Date().toISOString()
              })
              .eq('id', tpl.id)
              .select().single()
          );
        }
      }
    }

    // 4. No match — create new template
    const count = (ok && allTemplates) ? allTemplates.length + 1 : 1;
    const name = `Route-${String(count).padStart(3, '0')}`;

    return DB.call(
      DB.get().from('process_route_templates')
        .insert({
          template_name: name,
          process_list: processList,
          process_count: processList.length,
          used_count: 1,
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

  return { saveRouteTemplate, list, getById };
})();
