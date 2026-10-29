/* ============================================================
   DialFactory V1 · Customers API
   ============================================================ */

const CustomersAPI = (() => {

  async function list() {
    return DB.call(
      DB.get().from('customers')
        .select('id, name, code, short_name')
        .eq('is_active', true)
        .order('name', { ascending: true })
    );
  }

  async function search(query) {
    if (!query || query.trim().length === 0) return list();
    return DB.call(
      DB.get().from('customers')
        .select('id, name, code, short_name')
        .eq('is_active', true)
        .ilike('name', `%${query.trim()}%`)
        .order('name', { ascending: true })
    );
  }

  /**
   * Display name: short_name if available, otherwise full name.
   */
  function displayName(customer) {
    if (!customer) return '—';
    return customer.short_name || customer.name || '—';
  }

  /**
   * Exact-match a recognized customer name against the cached list.
   * Matches name / short_name / code, case-insensitive. No fuzzy guessing —
   * returns null when nothing matches exactly (caller leaves the field empty).
   */
  function match(customerList, rawName) {
    if (!rawName || !customerList || customerList.length === 0) return null;
    const q = String(rawName).trim().toLowerCase();
    if (!q) return null;
    return customerList.find(c =>
      (c.name && String(c.name).trim().toLowerCase() === q) ||
      (c.short_name && String(c.short_name).trim().toLowerCase() === q) ||
      (c.code && String(c.code).trim().toLowerCase() === q)
    ) || null;
  }

  /**
   * Create a customer from a raw name (e.g. OCR text with no archive entry).
   * Dedupes by exact name / short_name / code (case-insensitive) before inserting;
   * returns the existing record with `deduped: true` when a match is found.
   */
  async function create({ name, short_name = null, code = null }) {
    const trimmed = (name || '').trim();
    if (!trimmed) return { ok: false, error: `客户名称不能为空` };

    // 去重：查「全表」（含已停用客户，不能只查 is_active=true），
    // 否则会出现"停用了旧客户，又建出一个同名新客户"的脏数据。
    // 注意必须把 is_active 一起查出来，用于命中后判断是否需要复活。
    const existing = await DB.call(
      DB.get().from('customers').select('id, name, code, short_name, is_active')
    );
    if (existing.ok && Array.isArray(existing.data)) {
      const lower = (v) => String(v || '').trim().toLowerCase();
      const hit = existing.data.find(c =>
        lower(c.name) === lower(trimmed) ||
        (short_name && lower(c.short_name) === lower(short_name)) ||
        (code && lower(c.code) === lower(code)));
      if (hit) {
        // 命中已停用档案 → 自动复活。
        // 否则下拉框（只列 is_active=true）依然选不到它，形成"已存在但不可选"的死锁。
        if (hit.is_active === false) {
          const revived = await DB.call(
            DB.get().from('customers')
              .update({ is_active: true })
              .eq('id', hit.id)
              .select()
              .single()
          );
          if (!revived.ok) return { ok: false, error: revived.error || '客户档案已停用，恢复失败' };
          return { ok: true, data: revived.data, deduped: true, revived: true };
        }
        return { ok: true, data: hit, deduped: true };
      }
    }

    return DB.call(
      DB.get().from('customers')
        .insert({ name: trimmed, short_name, code, is_active: true })
        .select()
        .single()
    );
  }

  return { list, search, displayName, match, create };
})();
