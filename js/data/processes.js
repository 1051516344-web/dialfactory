/* ============================================================
   DialFactory V1 · Processes API
   (Route management removed — superseded by auto-collected
    process_route_templates. See C1/#15.)
   ============================================================ */

const ProcessesAPI = (() => {

  /**
   * List all active processes (dictionary).
   */
  async function listProcesses() {
    return DB.call(
      DB.get().from('processes')
        .select('id, code, name, type, is_required, is_active, default_dept_id, default_dept:departments(name)')
        .eq('is_active', true)
        .order('code', { ascending: true })
    );
  }

  return { listProcesses };
})();
