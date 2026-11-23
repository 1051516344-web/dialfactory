-- ============================================================
-- DialFactory V1 · Migration 022 — 批次起始工序 + 历史回填
-- 目的：解决「先走工序、后建批次」导致的批次空窗——
--       批次不知道自己从哪道工序出生，于是既没有当前位置、也没有历史。
--
-- 变更内容：
--   1. production_batches.start_node_id —— 批次「出生工序」（可空）
--   2. backfill_batch_progress() —— 幂等回填：
--        · start_node_id 为空时，自动取订单当前 active 节点作为出生点
--        · 把「出生点起、所有已 done 的节点」补进 batch_progress（qty_in = 批次数量）
--        · 把批次当前位置更新为订单当前 active 节点
--   3. split_batch() —— 替换：子批次继承父批次的当前位置作为出生点，并逐批回填
--
-- 语义（重要）：
--   · 出生点 = 当前 active 节点 → 新批次「0 道完成 · 当前：X工序」，历史如实为空
--   · 出生点更早 → 会补上它确实走过的 done 节点
--   · 不碰 order_nodes、不影响单 active、不新增任何 UI 按钮
--
-- 在 Supabase Dashboard → SQL Editor（东京项目 wzfkmwrqnvjegunjueka）手动执行。
-- ============================================================


-- ----------------------------------------------------------
-- 1. 出生工序列
-- ----------------------------------------------------------
ALTER TABLE production_batches
    ADD COLUMN IF NOT EXISTS start_node_id UUID
    REFERENCES order_nodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_batches_start_node ON production_batches(start_node_id);


-- ----------------------------------------------------------
-- 2. 回填函数（幂等）
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION backfill_batch_progress(p_batch_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_order_id    UUID;
    v_qty         INTEGER;
    v_start_node  UUID;
    v_start_seq   INTEGER;
    v_active_node UUID;
    v_active_name TEXT;
    b             record;
BEGIN
    SELECT order_id, quantity, start_node_id
      INTO v_order_id, v_qty, v_start_node
      FROM production_batches
     WHERE id = p_batch_id;

    IF v_order_id IS NULL THEN
        RAISE EXCEPTION '批次不存在';
    END IF;

    -- 出生点为空 → 取订单当前 active 节点（建批次那一刻的自然出生点）
    IF v_start_node IS NULL THEN
        SELECT n.id INTO v_start_node
          FROM order_nodes n
         WHERE n.order_id = v_order_id AND n.status = 'active'
         ORDER BY n.seq
         LIMIT 1;
        IF v_start_node IS NOT NULL THEN
            UPDATE production_batches SET start_node_id = v_start_node WHERE id = p_batch_id;
        END IF;
    END IF;

    -- 只有明确知道出生点，才回填历史；否则（订单已完成等）不编造历史
    IF v_start_node IS NOT NULL THEN
        SELECT seq INTO v_start_seq FROM order_nodes WHERE id = v_start_node;

        FOR b IN
            SELECT n.id AS node_id, n.process_name, n.updated_at
              FROM order_nodes n
             WHERE n.order_id = v_order_id
               AND n.status = 'done'
               AND (v_start_seq IS NULL OR n.seq >= v_start_seq)
             ORDER BY n.seq
        LOOP
            INSERT INTO batch_progress
                (batch_id, node_id, order_id, process_name, qty_in, completed_at)
            VALUES
                (p_batch_id, b.node_id, v_order_id, b.process_name, v_qty, COALESCE(b.updated_at, now()))
            ON CONFLICT (batch_id, node_id) DO NOTHING;
        END LOOP;
    END IF;

    -- 当前位置 = 订单当前 active 节点
    SELECT n.id, n.process_name
      INTO v_active_node, v_active_name
      FROM order_nodes n
     WHERE n.order_id = v_order_id AND n.status = 'active'
     ORDER BY n.seq
     LIMIT 1;

    UPDATE production_batches
       SET current_node_id      = v_active_node,
           current_process_name = v_active_name,
           location_updated_at  = now()
     WHERE id = p_batch_id;
END;
$$;


-- ----------------------------------------------------------
-- 3. 替换 split_batch：子批次继承父批次当前位置，并逐批回填
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION split_batch(p_source_id UUID, p_children JSONB)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_order_id       UUID;
    v_source_qty     INTEGER;
    v_status         TEXT;
    v_src_current    UUID;
    v_src_start      UUID;
    v_src_cur_name   TEXT;
    v_child_start    UUID;
    v_allocated      INTEGER;
    v_total          INTEGER;
    child            JSONB;
    v_child_qty      INTEGER;
    v_child_id       UUID;
BEGIN
    SELECT order_id, quantity, status, current_node_id, start_node_id, current_process_name
      INTO v_order_id, v_source_qty, v_status, v_src_current, v_src_start, v_src_cur_name
      FROM production_batches
     WHERE id = p_source_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '批次不存在';
    END IF;

    IF v_status NOT IN ('active', 'partially_split') THEN
        RAISE EXCEPTION '批次状态为 %，不可拆分', v_status;
    END IF;

    SELECT COALESCE(SUM(quantity), 0)
      INTO v_allocated
      FROM batch_relations
     WHERE source_batch_id = p_source_id;

    SELECT COALESCE(SUM((e->>'quantity')::INTEGER), 0)
      INTO v_total
      FROM jsonb_array_elements(p_children) AS e;

    IF v_total <= 0 THEN
        RAISE EXCEPTION '拆分数量必须大于 0';
    END IF;

    IF v_allocated + v_total > v_source_qty THEN
        RAISE EXCEPTION '拆分数量超过可分配数量（剩余 % 片）', (v_source_qty - v_allocated);
    END IF;

    -- 子批次出生点 = 父批次当前所在节点（拆分发生的物理位置）
    v_child_start := COALESCE(v_src_current, v_src_start);

    FOR child IN SELECT * FROM jsonb_array_elements(p_children) LOOP
        v_child_qty := (child->>'quantity')::INTEGER;
        IF v_child_qty <= 0 THEN
            RAISE EXCEPTION '子批次数量必须大于 0';
        END IF;

        INSERT INTO production_batches
            (batch_no, order_id, quantity, color, status, created_by,
             start_node_id, current_node_id, current_process_name)
        VALUES
            (child->>'batch_no', v_order_id, v_child_qty, NULLIF(child->>'color', ''), 'active', auth.uid(),
             v_child_start, v_src_current, v_src_cur_name)
        RETURNING id INTO v_child_id;

        INSERT INTO batch_relations (source_batch_id, target_batch_id, relation_type, quantity, created_by)
        VALUES (p_source_id, v_child_id, 'split', v_child_qty, auth.uid());

        -- 逐批回填（幂等；父批次当前位置为空时函数会自动兜底）
        PERFORM backfill_batch_progress(v_child_id);
    END LOOP;

    UPDATE production_batches
       SET status = CASE WHEN v_allocated + v_total >= v_source_qty THEN 'split' ELSE 'partially_split' END
     WHERE id = p_source_id;
END;
$$;


NOTIFY pgrst, 'reload schema';
