-- ============================================================
-- Phase 4: Route Template Signature Optimization
-- Add route_signature (unique process-name fingerprint) and
-- associated_orders (track which orders use this template).
-- Deduplication: same route_signature → no new template.
-- ============================================================

ALTER TABLE process_route_templates
  ADD COLUMN IF NOT EXISTS route_signature TEXT;

ALTER TABLE process_route_templates
  ADD COLUMN IF NOT EXISTS associated_orders JSONB DEFAULT '[]';

CREATE UNIQUE INDEX IF NOT EXISTS idx_route_signature
  ON process_route_templates(route_signature);

NOTIFY pgrst, 'reload schema';
