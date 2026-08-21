-- ============================================================
-- DialFactory V1 · Migration 011 — link production_records to order_nodes
-- B5: production_records previously keyed only on process_name, so rework/append
--     nodes sharing a name couldn't be told apart. Add a nullable FK (SET NULL
--     keeps the record even if its node is ever removed).
-- ============================================================

ALTER TABLE production_records
    ADD COLUMN IF NOT EXISTS node_id UUID REFERENCES order_nodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prod_records_node ON production_records(node_id);

NOTIFY pgrst, 'reload schema';
