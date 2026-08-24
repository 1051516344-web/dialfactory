-- ============================================================
-- DialFactory V1 · Migration 012
-- Production Batch layer: a Batch is a physical, movable,
-- independently-processable unit of material on the shop floor.
--   production_batches — the batches themselves (no parent_batch_id;
--                        parent/child is expressed via batch_relations)
--   batch_relations     — "which batch was split out of which"
--
-- Batch ≠ Order. Order stays the customer order; Batch models the
-- real production units that get split by color/process/rush/rework.
-- Phase 1: only relation_type = 'split'. QuantityEvent deferred.
-- ============================================================

-- ----------------------------------------------------------
-- 1. production_batches
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS production_batches (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_no             TEXT UNIQUE NOT NULL,
    order_id             UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    quantity             INTEGER NOT NULL CHECK (quantity > 0),
    color                TEXT,
    status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'partially_split', 'split', 'completed', 'cancelled')),
    current_process_id   UUID,
    current_process_name TEXT,
    current_location     TEXT,
    location_updated_at  TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by           UUID,
    note                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_batches_order  ON production_batches(order_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON production_batches(status);

-- ----------------------------------------------------------
-- 2. batch_relations — physical split relations only
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS batch_relations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_batch_id UUID NOT NULL REFERENCES production_batches(id) ON DELETE RESTRICT,
    target_batch_id UUID NOT NULL REFERENCES production_batches(id) ON DELETE RESTRICT,
    relation_type   TEXT NOT NULL CHECK (relation_type IN ('split')),
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,
    note            TEXT,
    -- a batch cannot be split out of itself
    CHECK (source_batch_id <> target_batch_id)
);

CREATE INDEX IF NOT EXISTS idx_relations_source ON batch_relations(source_batch_id);
CREATE INDEX IF NOT EXISTS idx_relations_target ON batch_relations(target_batch_id);

-- ----------------------------------------------------------
-- 3. RLS — authenticated-only (matches migration 009)
-- ----------------------------------------------------------
ALTER TABLE production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_relations     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth full access" ON production_batches
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth full access" ON batch_relations
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ----------------------------------------------------------
-- 4. split_batch() — atomic split (single transaction)
--    Allowed source status: active / partially_split
--    Forbidden:            completed / cancelled / split
--    Any failure rolls back the whole split.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION split_batch(p_source_id UUID, p_children JSONB)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_order_id    UUID;
    v_source_qty  INTEGER;
    v_status      TEXT;
    v_allocated   INTEGER;
    v_total       INTEGER;
    child         JSONB;
    v_child_qty   INTEGER;
    v_child_id    UUID;
BEGIN
    -- Lock the source row for the duration of the split (prevents concurrent over-split)
    SELECT order_id, quantity, status
      INTO v_order_id, v_source_qty, v_status
      FROM production_batches
     WHERE id = p_source_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '批次不存在';
    END IF;

    IF v_status NOT IN ('active', 'partially_split') THEN
        RAISE EXCEPTION '批次状态为 %，不可拆分', v_status;
    END IF;

    -- Already-allocated quantity = sum of existing outgoing relations
    SELECT COALESCE(SUM(quantity), 0)
      INTO v_allocated
      FROM batch_relations
     WHERE source_batch_id = p_source_id;

    -- Total being split now
    SELECT COALESCE(SUM((e->>'quantity')::INTEGER), 0)
      INTO v_total
      FROM jsonb_array_elements(p_children) AS e;

    IF v_total <= 0 THEN
        RAISE EXCEPTION '拆分数量必须大于 0';
    END IF;

    IF v_allocated + v_total > v_source_qty THEN
        RAISE EXCEPTION '拆分数量超过可分配数量（剩余 % 片）', (v_source_qty - v_allocated);
    END IF;

    -- Create children + relations
    FOR child IN SELECT * FROM jsonb_array_elements(p_children) LOOP
        v_child_qty := (child->>'quantity')::INTEGER;
        IF v_child_qty <= 0 THEN
            RAISE EXCEPTION '子批次数量必须大于 0';
        END IF;

        INSERT INTO production_batches (batch_no, order_id, quantity, color, status, created_by)
        VALUES (child->>'batch_no', v_order_id, v_child_qty, NULLIF(child->>'color', ''), 'active', auth.uid())
        RETURNING id INTO v_child_id;

        INSERT INTO batch_relations (source_batch_id, target_batch_id, relation_type, quantity, created_by)
        VALUES (p_source_id, v_child_id, 'split', v_child_qty, auth.uid());
    END LOOP;

    -- Update parent status: fully allocated → split, else partially_split
    UPDATE production_batches
       SET status = CASE WHEN v_allocated + v_total >= v_source_qty THEN 'split' ELSE 'partially_split' END
     WHERE id = p_source_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
