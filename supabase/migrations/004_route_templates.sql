-- ============================================================
-- Phase 4: Route Template Auto-Collection
-- Auto-collect order process routes during trial phase.
-- Deduplication: same route → increment used_count.
-- ============================================================

CREATE TABLE process_route_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_name   TEXT NOT NULL,
    process_list    JSONB NOT NULL,
    process_count   INTEGER NOT NULL,
    used_count      INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT now(),
    last_used_at    TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_route_templates_used ON process_route_templates(used_count DESC);

-- RLS (single-user V1)
ALTER TABLE process_route_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON process_route_templates
    USING (true) WITH CHECK (true);
