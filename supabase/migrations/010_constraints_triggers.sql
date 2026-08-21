-- ============================================================
-- DialFactory V1 · Migration 010 — Data quality & triggers
-- 1. Backfill + harden production_records.created_at (B7)
-- 2. duration_minutes auto-calc in DB (B8)
-- 3. updated_at auto-maintenance (C5)
-- 4. Business CHECK constraints (C4)
-- ============================================================

-- ----------------------------------------------------------
-- 1. production_records.created_at — stop NULL "待生产" rows
-- ----------------------------------------------------------
UPDATE production_records SET created_at = now() WHERE created_at IS NULL;
ALTER TABLE production_records ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE production_records ALTER COLUMN created_at SET NOT NULL;

-- ----------------------------------------------------------
-- 2. duration_minutes auto-calculated on completion (B8)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION set_duration_minutes() RETURNS trigger AS $$
BEGIN
  IF NEW.status = '已完成' AND OLD.status IS DISTINCT FROM '已完成' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    IF NEW.created_at IS NOT NULL THEN
      NEW.duration_minutes := ROUND(EXTRACT(EPOCH FROM (COALESCE(NEW.completed_at, now()) - NEW.created_at)) / 60)::int;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_production_records_duration ON production_records;
CREATE TRIGGER trg_production_records_duration
  BEFORE UPDATE ON production_records
  FOR EACH ROW EXECUTE FUNCTION set_duration_minutes();

-- ----------------------------------------------------------
-- 3. updated_at auto-maintenance (C5)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_order_nodes_updated_at ON order_nodes;
CREATE TRIGGER trg_order_nodes_updated_at BEFORE UPDATE ON order_nodes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------
-- 4. Business CHECK constraints (C4)
-- ----------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_order_qty') THEN
    ALTER TABLE orders ADD CONSTRAINT chk_orders_order_qty CHECK (order_qty > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pr_good_qty') THEN
    ALTER TABLE production_records ADD CONSTRAINT chk_pr_good_qty CHECK (good_qty IS NULL OR good_qty >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pr_bad_qty') THEN
    ALTER TABLE production_records ADD CONSTRAINT chk_pr_bad_qty CHECK (bad_qty IS NULL OR bad_qty >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pr_duration') THEN
    ALTER TABLE production_records ADD CONSTRAINT chk_pr_duration CHECK (duration_minutes IS NULL OR duration_minutes >= 0);
  END IF;
END $$;

-- customers.code is used as a business key — enforce uniqueness where present
CREATE UNIQUE INDEX IF NOT EXISTS ux_customers_code ON customers(code) WHERE code IS NOT NULL;

NOTIFY pgrst, 'reload schema';
