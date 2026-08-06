/* ============================================================
   DialFactory V1 · Customers API
   ============================================================ */

const CustomersAPI = (() => {

  async function list() {
    return DB.call(
      DB.get().from('customers')
        .select('id, name, code')
        .eq('is_active', true)
        .order('name', { ascending: true })
    );
  }

  async function search(query) {
    if (!query || query.trim().length === 0) return list();
    return DB.call(
      DB.get().from('customers')
        .select('id, name, code')
        .eq('is_active', true)
        .ilike('name', `%${query.trim()}%`)
        .order('name', { ascending: true })
    );
  }

  return { list, search };
})();
