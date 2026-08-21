-- ============================================================
-- DialFactory V1 · Migration 005
-- Add missing columns discovered during trial phase.
--   - production_records.duration_minutes: auto-calculated on completion
-- ============================================================

-- 005a: Add duration_minutes to production_records
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

COMMENT ON COLUMN production_records.duration_minutes IS 'Auto-calculated: minutes between created_at and completed_at';

NOTIFY pgrst, 'reload schema';
