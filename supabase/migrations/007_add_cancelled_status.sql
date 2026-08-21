-- ============================================================
-- DialFactory V1 · Migration 007
-- Add 'cancelled' to orders.status CHECK constraint.
-- The design docs planned this as 002_add_cancelled_status.sql,
-- but that filename was taken by customer alias migration.
-- ============================================================

-- The inline CHECK in 001 has an auto-generated name orders_status_check.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('in_production', 'paused', 'completed', 'cancelled'));

NOTIFY pgrst, 'reload schema';
