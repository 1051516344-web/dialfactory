/* ============================================================
   DialFactory V1 · Processes & Routes API
   ============================================================ */

const ProcessesAPI = (() => {

  /**
   * List all active process routes with their steps.
   * Returns: [{ id, name, is_active, created_at, steps: [...] }]
   */
  async function listRoutes() {
    const db = DB.get();

    // Fetch routes
    const { ok, data: routes, error } = await DB.call(
      db.from('process_routes')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
    );
    if (!ok) return { ok: false, error, data: [] };

    // Fetch steps for all routes in one query
    const routeIds = routes.map(r => r.id);
    if (routeIds.length === 0) return { ok: true, data: [] };

    const stepsResult = await DB.call(
      db.from('route_steps')
        .select(`
          id, seq,
          route_id,
          process:processes!inner(code, name, type, is_required)
        `)
        .in('route_id', routeIds)
        .order('seq', { ascending: true })
    );
    if (!stepsResult.ok) {
      // Routes exist but steps query failed — return routes without steps
      return {
        ok: true,
        data: routes.map(r => ({ ...r, steps: [] }))
      };
    }

    // Group steps by route_id
    const stepsByRoute = {};
    for (const s of stepsResult.data) {
      if (!stepsByRoute[s.route_id]) stepsByRoute[s.route_id] = [];
      stepsByRoute[s.route_id].push(s);
    }

    // Assemble
    const result = routes.map(r => ({
      ...r,
      steps: (stepsByRoute[r.id] || []).map(s => ({
        id: s.id,
        seq: s.seq,
        code: s.process.code,
        name: s.process.name,
        type: s.process.type,
        is_required: s.process.is_required,
      }))
    }));

    return { ok: true, data: result };
  }

  /**
   * Get a single route with full step details.
   */
  async function getRouteWithSteps(routeId) {
    const db = DB.get();

    const [routeResult, stepsResult] = await Promise.all([
      DB.call(db.from('process_routes').select('*').eq('id', routeId).single()),
      DB.call(
        db.from('route_steps')
          .select(`
            id, seq,
            process:processes!inner(
              code, name, type, is_required,
              default_dept:departments(name)
            )
          `)
          .eq('route_id', routeId)
          .order('seq', { ascending: true })
      )
    ]);

    if (!routeResult.ok) return routeResult;
    if (!stepsResult.ok) return stepsResult;

    return {
      ok: true,
      data: {
        ...routeResult.data,
        steps: stepsResult.data.map(s => ({
          id: s.id,
          seq: s.seq,
          code: s.process.code,
          name: s.process.name,
          type: s.process.type,
          is_required: s.process.is_required,
          dept_name: s.process.default_dept?.name || '—',
        }))
      }
    };
  }

  /**
   * List all active processes (dictionary).
   */
  async function listProcesses() {
    return DB.call(
      DB.get().from('processes')
        .select('id, code, name, type, is_required, is_active')
        .eq('is_active', true)
        .order('code', { ascending: true })
    );
  }

  return { listRoutes, getRouteWithSteps, listProcesses };
})();
