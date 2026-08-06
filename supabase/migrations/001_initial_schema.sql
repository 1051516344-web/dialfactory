-- ============================================================
-- DialFactory V1 · Initial Schema Migration
-- ============================================================
--
-- Source:   DialFactory-V1-Freeze.md (docs/FREEZE/)
-- Schema:   Phase 1-A Approved (04-Schema-Final-Review.md)
-- Based on: 01-Supabase-Schema-Plan.md §十一 (FROZEN)
-- Generated: Phase 1-B-2
-- Migration: 001_initial_schema
--
-- DO NOT MODIFY WITHOUT CHANGE PROPOSAL
-- See: docs/FREEZE/DialFactory-V1-Freeze.md §Change Management Rule
--
-- Freeze Baseline:
--   8 Tables · 44 Business Fields · 58 Total Fields
--   FK Policy: 6 RESTRICT · 3 SET NULL · 1 NO FK · 0 CASCADE
--   ADL-001/002/003 · ADP-001~005
-- ============================================================


-- ============================================================
-- Phase 0: Extension
-- ============================================================

-- UUID Primary Key generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- Phase 1: Tables (ordered by FK dependency)
-- ============================================================

-- ----------------------------------------------------------
-- 1. departments（部门）— 预置数据，V1 无 CRUD
-- ----------------------------------------------------------
CREATE TABLE departments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    type        TEXT NOT NULL DEFAULT 'production'
        CHECK (type IN ('production', 'qc')),
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------
-- 2. customers（客户）— 预置数据，V1 无 CRUD
-- ----------------------------------------------------------
CREATE TABLE customers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    code        TEXT,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------
-- 3. processes（工序目录）
-- ----------------------------------------------------------
CREATE TABLE processes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT '加工'
        CHECK (type IN ('加工', '检验', '辅助')),
    default_dept_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
    is_required     BOOLEAN DEFAULT false,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------
-- 4. process_routes（工艺路线模板）
-- ----------------------------------------------------------
CREATE TABLE process_routes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------
-- 5. route_steps（路线步骤）
-- ----------------------------------------------------------
CREATE TABLE route_steps (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id    UUID NOT NULL REFERENCES process_routes(id) ON DELETE RESTRICT,
    process_id  UUID NOT NULL REFERENCES processes(id) ON DELETE RESTRICT,
    seq         INTEGER NOT NULL,
    UNIQUE (route_id, process_id, seq)
);

-- ----------------------------------------------------------
-- 6. orders（订单）
-- ----------------------------------------------------------
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_no        TEXT NOT NULL UNIQUE,
    customer_id     UUID REFERENCES customers(id) ON DELETE RESTRICT,
    order_qty       INTEGER NOT NULL,
    due_date        DATE NOT NULL,
    base_texture    TEXT,
    plate_color     TEXT,
    sand_type       TEXT,
    route_id        UUID REFERENCES process_routes(id) ON DELETE RESTRICT,
    route_snapshot  JSONB DEFAULT '{}',
    second_route_id UUID DEFAULT NULL REFERENCES process_routes(id) ON DELETE SET NULL,
    specs           JSONB DEFAULT '{}',
    status          TEXT DEFAULT 'in_production'
        CHECK (status IN ('in_production', 'paused', 'completed')),
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------
-- 7. order_nodes（工序执行记录 · 核心追踪单元）
-- ----------------------------------------------------------
CREATE TABLE order_nodes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    process_id      UUID REFERENCES processes(id) ON DELETE SET NULL,
    process_name    TEXT,
    process_code    TEXT,
    dept_id         UUID REFERENCES departments(id) ON DELETE SET NULL,
    dept_name       TEXT,
    status          TEXT DEFAULT 'waiting'
        CHECK (status IN ('waiting', 'active', 'done', 'paused')),
    seq             INTEGER NOT NULL,
    rework_pass     INTEGER DEFAULT 0,
    pause_reason    TEXT DEFAULT NULL,
    layer           TEXT DEFAULT NULL,
    qty_out         INTEGER,
    is_outsourced   BOOLEAN DEFAULT false,
    supplier_id     UUID,
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------
-- 8. exception_events（质量事件）
-- node_id: NO FOREIGN KEY by design — 节点删除后异常记录保留
-- ----------------------------------------------------------
CREATE TABLE exception_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id     UUID NOT NULL,
    type        TEXT NOT NULL,
    qty         INTEGER NOT NULL,
    resolution  TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- Phase 2: Indexes
-- ============================================================

-- orders
CREATE INDEX idx_orders_status_created ON orders (status, created_at DESC);
CREATE INDEX idx_orders_customer ON orders (customer_id);
CREATE INDEX idx_orders_due_date ON orders (due_date);

-- order_nodes (核心查询)
CREATE INDEX idx_nodes_order_seq ON order_nodes (order_id, seq);
CREATE INDEX idx_nodes_dept_status ON order_nodes (dept_id, status);
CREATE INDEX idx_nodes_status ON order_nodes (status);

-- route_steps
CREATE INDEX idx_steps_route_seq ON route_steps (route_id, seq);

-- exception_events
CREATE INDEX idx_exceptions_node ON exception_events (node_id);
CREATE INDEX idx_exceptions_type_time ON exception_events (type, created_at DESC);


-- ============================================================
-- Phase 3: Row Level Security
-- ============================================================

-- Enable RLS on all 8 tables
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE exception_events ENABLE ROW LEVEL SECURITY;

-- V1 Policy: trusted intranet users, full access
-- V2 will replace USING (true) with role-based conditions
CREATE POLICY "V1: full access" ON departments FOR ALL USING (true);
CREATE POLICY "V1: full access" ON customers FOR ALL USING (true);
CREATE POLICY "V1: full access" ON processes FOR ALL USING (true);
CREATE POLICY "V1: full access" ON process_routes FOR ALL USING (true);
CREATE POLICY "V1: full access" ON route_steps FOR ALL USING (true);
CREATE POLICY "V1: full access" ON orders FOR ALL USING (true);
CREATE POLICY "V1: full access" ON order_nodes FOR ALL USING (true);
CREATE POLICY "V1: full access" ON exception_events FOR ALL USING (true);


-- ============================================================
-- Phase 4: Seed Data
-- ============================================================

-- Idempotent: only inserts if departments table is empty
INSERT INTO departments (name, seq, type)
SELECT * FROM (VALUES
    ('制一', 1, 'production'),
    ('制二', 2, 'production'),
    ('制三', 3, 'production'),
    ('制四', 4, 'production'),
    ('总QC', 5, 'qc')
) AS v(name, seq, type)
WHERE NOT EXISTS (SELECT 1 FROM departments LIMIT 1);


-- ============================================================
-- Verification Checklist (Phase 1-B-3)
-- ============================================================
--
-- Execute the following queries to verify migration success:
--
-- [ ] V1: 8 tables created
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('departments','customers','processes','process_routes',
--                        'route_steps','orders','order_nodes','exception_events');
--   -- Expected: 8 rows
--
-- [ ] V2: 9 indexes created
--   SELECT indexname FROM pg_indexes
--   WHERE schemaname = 'public' AND indexname LIKE 'idx_%';
--   -- Expected: 9 rows
--
-- [ ] V3: RLS enabled on all 8 tables
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public'
--     AND tablename IN ('departments','customers','processes','process_routes',
--                       'route_steps','orders','order_nodes','exception_events');
--   -- Expected: 8 rows, rowsecurity = true
--
-- [ ] V4: 8 policies created
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public';
--   -- Expected: 8 rows, policyname = 'V1: full access'
--
-- [ ] V5: Seed data inserted
--   SELECT * FROM departments ORDER BY seq;
--   -- Expected: 5 rows (制一~总QC)
--
-- [ ] V6: FK RESTRICT enforcement (should ERROR)
--   DELETE FROM departments WHERE name = '制一';
--   -- Expected: ERROR — foreign key constraint
--
-- [ ] V7: 0 CASCADE confirmed
--   -- Verified at code review: grep REFERENCES.*ON DELETE → 0 CASCADE
--   -- All FK: 6 RESTRICT · 3 SET NULL · 1 NO FK
--
-- [ ] V8: UUID generation works
--   INSERT INTO customers (name) VALUES ('__migration_test__') RETURNING id;
--   -- Expected: UUID v4 format
--   DELETE FROM customers WHERE name = '__migration_test__';
--
-- ============================================================
-- End of Migration 001_initial_schema
-- ============================================================
