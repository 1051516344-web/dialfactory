-- ============================================================
-- DialFactory V1 · Migration 009 — SECURITY
-- Replace the open "FOR ALL USING (true)" policies with
-- authenticated-only access. anon gets ZERO access.
--
-- ⚠️  IMPORTANT — run this AFTER wiring up Supabase Auth login
--     AND creating at least one authenticated user, otherwise the
--     app will be locked out. The frontend login screen must be
--     deployed before applying this migration.
-- ============================================================

-- Drop the permissive policies created by 001/003/004
DROP POLICY IF EXISTS "V1: full access" ON departments;
DROP POLICY IF EXISTS "V1: full access" ON customers;
DROP POLICY IF EXISTS "V1: full access" ON processes;
DROP POLICY IF EXISTS "V1: full access" ON process_routes;
DROP POLICY IF EXISTS "V1: full access" ON route_steps;
DROP POLICY IF EXISTS "V1: full access" ON orders;
DROP POLICY IF EXISTS "V1: full access" ON order_nodes;
DROP POLICY IF EXISTS "V1: full access" ON exception_events;
DROP POLICY IF EXISTS "V1: full access" ON production_records;
DROP POLICY IF EXISTS "Allow all" ON process_route_templates;

-- Authenticated-only, full access (single trusted team in V1).
-- V2 can split these into per-table/per-role policies.
CREATE POLICY "auth full access" ON departments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth full access" ON customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth full access" ON processes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth full access" ON process_routes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth full access" ON route_steps FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth full access" ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth full access" ON order_nodes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth full access" ON exception_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth full access" ON production_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth full access" ON process_route_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
