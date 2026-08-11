-- ============================================================
-- DialFactory V1 · Migration 003
-- Phase 4: Production Records for process time tracking
-- Additive only — no existing tables altered
-- ============================================================

CREATE TABLE production_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    process_name    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT '待生产'
                    CHECK (status IN ('待生产', '生产中', '已完成')),
    created_at      TIMESTAMPTZ DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    good_qty        INTEGER,
    bad_qty         INTEGER,
    operator        TEXT,
    remark          TEXT
);

-- Query patterns: per-order timeline, by-status, by-process
CREATE INDEX idx_prod_records_order   ON production_records(order_id);
CREATE INDEX idx_prod_records_status  ON production_records(status);
CREATE INDEX idx_prod_records_process ON production_records(process_name, status);

-- RLS
ALTER TABLE production_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "V1: full access" ON production_records FOR ALL USING (true);
