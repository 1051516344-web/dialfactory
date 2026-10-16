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

  return { list, search, displayName, match };
})();
