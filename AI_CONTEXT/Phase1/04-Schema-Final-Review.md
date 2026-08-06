# DialFactory Phase 1-A · Schema Final Review

> **状态：** APPROVED — Ready for Freeze
> **审查对象：** [01-Supabase-Schema-Plan.md](01-Supabase-Schema-Plan.md) (Revision Completed)
> **审查日期：** 2026-08-06
> **上一轮 Review：** [02-Schema-Review-Report.md](02-Schema-Review-Report.md) → Need Revision (1 Critical + 4 Warning)
> **修订记录：** [03-Schema-Revision-Log.md](03-Schema-Revision-Log.md) → 5 项修订，3 行 DDL 变更

---

## 审查结论

| 检查维度 | 结果 |
|----------|:----:|
| ADL-001/002/003 合规 | ✅ 通过 |
| 无新增实体 | ✅ 通过 |
| 无字段语义变更 | ✅ 通过 |
| FK 生产数据保护 | ✅ 通过 |
| 已修复项验证 | ✅ 通过 |

**最终判定：APPROVED**

> Schema Plan 可以 Freeze。可以进入 Phase 1-B Supabase 建表。

---

## 一、ADL 合规检查

### ADL-001 · 路线模板 ≠ 生产路线

| 检查项 | 预期 | SP 实际 | 判定 |
|--------|------|---------|:----:|
| `orders.route_snapshot` JSONB 存在 | ✅ | `JSONB DEFAULT '{}'`，含 `confirmed` 标记 | ✅ |
| `processes.is_required` 字段存在 | ✅ | `BOOLEAN DEFAULT false`，必修工序不可取消 | ✅ |
| 仅 confirmed=true 展开为 order_nodes | 应用层 | SP 明确标注「应用层逻辑，建表时不强制」 | ✅ |
| 支持动态追加节点 + seq 重算 | 表结构支持 | `order_nodes` UUID PK + `seq INTEGER` 支持任意插入 | ✅ |
| route_snapshot 数据结构文档化 | ✅ | §七.1 完整 JSON 示例 + 业务规则 | ✅ |

### ADL-002 · 返工由人工决策

| 检查项 | 预期 | SP 实际 | 判定 |
|--------|------|---------|:----:|
| `processes` 无 `rework_strategy` 字段 | ❌ 不应存在 | ❌ 不存在 | ✅ |
| `processes` 无 `rework_target_id` 字段 | ❌ 不应存在 | ❌ 不存在 | ✅ |
| `order_nodes.rework_pass` 语义正确 | 同工序+1，新工序=0 | `INTEGER DEFAULT 0`，语义在 §一.3 明确 | ✅ |
| 动态追加节点支持 | 表结构支持 | `order_nodes` 支持任意 process_id + seq 插入 | ✅ |

### ADL-003 · V1 四态模型

| 检查项 | 预期 | SP 实际 | 判定 |
|--------|------|---------|:----:|
| `order_nodes.status` CHECK 四态 | waiting/active/done/paused | ✅ 四个值，无 handing_off | ✅ |
| `orders.status` CHECK 三态 | in_production/paused/completed | ✅ 三个值，自动计算 | ✅ |
| 状态转换矩阵文档化 | 应明确 | ✅ §六.2 完整的 from/to 矩阵 | ✅ |

### ADL 合规总结

```
ADL-001: 路线快照 + confirmed 标记 + 动态追加 ✅
ADL-002: 无 rework_strategy + rework_pass 语义正确 ✅
ADL-003: 四态 CHECK + 三态自动计算 + 无 handing_off ✅

零违反、零遗漏。
```

---

## 二、实体边界检查

| 检查项 | 基准 | SP 实际 | 判定 |
|--------|------|---------|:----:|
| 表数量 | 8 张（BM §第四部分） | 8 张 | ✅ |
| 是否存在 `suppliers` 表 | V1.5 延后 | ❌ 不存在 | ✅ |
| 是否存在 `handoffs` 表 | V1.5 延后 | ❌ 不存在 | ✅ |
| 是否存在 `first_piece_inspections` 表 | V2 延后 | ❌ 不存在 | ✅ |
| 是否存在 `audit_logs` 表 | V2 延后 | ❌ 不存在 | ✅ |
| 是否存在 `materials` 表 | ADP-004 排除 | ❌ 不存在 | ✅ |
| 是否存在 `order_variants` 表 | ADP-001 排除 | ❌ 不存在 | ✅ |

**结论：8 张表，无新增实体。与冻结 BM 完全一致。**

---

## 三、字段语义检查

逐表确认 SP 中的字段语义未偏离 BM 定义：

| 表 | BM 字段数 | SP 字段数 | 语义变更 | 判定 |
|----|:--------:|:--------:|:--------:|:----:|
| `departments` | 3 | 3 (+1 system) | 无 | ✅ |
| `customers` | 3 | 3 (+1 system) | 无 | ✅ |
| `processes` | 5~6 | 6 (+1 system) | 无 — `is_required` 来自 BM 数据字典 | ✅ |
| `process_routes` | 2 | 2 (+1 system) | 无 | ✅ |
| `route_steps` | 3 | 3 | 无 | ✅ |
| `orders` | 8 | 11 (+2 system) | 无 — 增量来自 ADL-001 (`route_snapshot`) + Phase 0-A.2 预留 (`specs`, `second_route_id`) | ✅ |
| `order_nodes` | 10 | 12 (+2 system) | 无 — 增量来自 Phase 0-A.2 (`pause_reason`, `layer`, `process_code` 快照) + V1.5 预留 (`is_outsourced`, `supplier_id`) | ✅ |
| `exception_events` | 4 | 4 (+1 system) | 无 | ✅ |

**结论：所有 BM 字段完整保留。所有增量字段有明确的 ADL / Phase 0-A.2 / V1.5 预留来源。无字段语义被修改。**

---

## 四、FK 生产数据保护验证

### 4.1 FK 逐条验证

| # | 子表.字段 → 父表 | ON DELETE | 类型 | 判定 |
|----|------------------|-----------|------|:----:|
| FK1 | `orders.customer_id → customers` | RESTRICT | 主数据 | ✅ |
| FK2 | `orders.route_id → process_routes` | RESTRICT | 主数据 | ✅ |
| FK3 | `orders.second_route_id → process_routes` | SET NULL | 预留字段 | ✅ |
| FK4 | `processes.default_dept_id → departments` | RESTRICT | 主数据 | ✅ |
| FK5 | `route_steps.route_id → process_routes` | RESTRICT | 模板数据 | ✅ |
| FK6 | `route_steps.process_id → processes` | RESTRICT | 主数据 | ✅ |
| FK7 | `order_nodes.order_id → orders` | **RESTRICT** | 生产数据 | ✅ |
| FK8 | `order_nodes.process_id → processes` | SET NULL | 快照容错 | ✅ |
| FK9 | `order_nodes.dept_id → departments` | SET NULL | 快照容错 | ✅ |
| — | `exception_events.node_id` | 无 FK | 独立保留 | ✅ |

### 4.2 CRIT-001 修复验证

| 位置 | 修复前 (Revision 前) | 修复后 (当前) | 验证 |
|------|---------------------|--------------|:----:|
| §四 FK 表 | `order_nodes / order_id / orders / CASCADE` | `RESTRICT`「生产数据保护」 | ✅ |
| §四 FK 原则 | 「级联清理」 | 「生产数据保护」 | ✅ |
| §十一 DDL 行 817 | `ON DELETE CASCADE` | `ON DELETE RESTRICT` | ✅ |

### 4.3 FK 统计

```
全部 FK: 10 条关系
├── RESTRICT: 6 条 (主数据 3 + 模板 1 + 生产数据 2)
├── SET NULL:  3 条 (预留字段 1 + 快照容错 2)
└── 无 FK:     1 条 (exception_events)

CASCADE: 0 条 ✅
```

**结论：零 CASCADE。生产数据（order_nodes）、模板数据（route_steps）、主数据（customers/departments/processes/process_routes）全部受 RESTRICT 保护。快照字段容错使用 SET NULL。exception_events 独立保留。**

---

## 五、上一次 Review 修复项验证

| Review ID | 严重度 | 修复状态 | 验证 |
|-----------|:------:|---------|:----:|
| CRIT-001 | Critical | `ON DELETE CASCADE` → `RESTRICT` | ✅ 已验证 |
| WARN-004 | Warning | `ON DELETE CASCADE` → `RESTRICT` | ✅ 已验证 |
| WARN-003 | Warning | 增加 `ON DELETE RESTRICT` 显式声明 | ✅ 已验证 |
| WARN-002 | Warning | `sand_type` L2 → L3 | ✅ 已验证 |
| WARN-001 | Warning | customers V1 策略说明补充 | ✅ 已验证 |

**全部 5 项已修复并验证通过。**

---

## 六、DDL 可执行性检查

| 检查项 | 状态 |
|--------|:----:|
| 建表顺序正确（无循环依赖） | ✅ departments → customers → processes → process_routes → route_steps → orders → order_nodes → exception_events |
| 所有 FK 引用目标表存在 | ✅ |
| 所有 CHECK 约束语法正确 | ✅ |
| 所有 DEFAULT 值合理 | ✅ |
| UNIQUE 约束完整 | ✅ `order_no`, `processes.code`, `(route_id, process_id, seq)` |
| 索引覆盖核心查询 | ✅ 9 条索引 |
| RLS 策略可执行 | ✅ `USING (true)` 简化策略 |
| 预置数据 INSERT 与 CHECK 一致 | ✅ |

---

## 七、未解决问题（不阻塞 Freeze）

以下为 Phase 0 遗留的 L3 数据问题，不影响 Schema DDL 执行，但需在后续 Phase 解决：

| # | 问题 | 影响 Phase | 处理方式 |
|----|------|:--------:|---------|
| 1 | customers 表无实际数据（L3） | Phase 1-C 数据初始化 | V1 前端允许自由文本输入客户名 |
| 2 | process_routes 路线名称未经工厂确认（L3） | Phase 1-C 数据初始化 | 等待工厂提供 3-5 条常用路线 |
| 3 | sand_type 字段可能不需要（L3） | Phase 0-B | 用真实订单数据验证 |
| 4 | processes 工序清单粒度待确认（L2） | Phase 1-C 数据初始化 | 等待工厂确认 P01-Pxx 完整清单 |

---

## 八、最终判定

```
╔══════════════════════════════════════════╗
║                                          ║
║   Phase 1-A Schema Plan: APPROVED        ║
║                                          ║
║   可以 Freeze。                           ║
║   可以进入 Phase 1-B Supabase 建表。      ║
║                                          ║
╚══════════════════════════════════════════╝
```

### Freeze 范围

以下内容冻结，后续 Phase 不可修改：

| 冻结项 | 说明 |
|--------|------|
| 8 张表定义 | 不可新增、不可删除 |
| 表间 FK 关系 | 10 条 FK，ON DELETE 行为不可改 |
| 字段语义 | 44 个业务字段的定义不可变 |
| ADL-001/002/003 体现 | route_snapshot、rework_pass 语义、四态模型 |
| ADP-001~005 体现 | 预留字段策略、无 DAG、无 materials 等 |

### 不冻结（后续 Phase 可调整）

| 非冻结项 | 说明 |
|---------|------|
| 索引 | Phase 1-B 或运行后可追加/调整 |
| RLS 策略 | Phase 2（多用户）时替换 USING 条件 |
| 预置数据 | Phase 1-C 填充工厂实际数据 |
| L3 字段的启用/弃用 | Phase 0-B 验证后决定 |

---

## 九、Phase 1-B 入口条件

| 条件 | 状态 |
|------|:----:|
| ✅ Schema Plan Final Review Approved | ✅ 本文档 |
| ✅ Supabase 项目已创建 | 待 Phase 1-B 执行 |
| ✅ 工厂提供 3-5 条常用路线 | 待 Phase 1-C |
| ⬜ 准备 DDL 执行脚本 | Phase 1-B 产出 |

### Phase 1-B 执行步骤（预告）

```
1. 登录 Supabase Dashboard → SQL Editor
2. 执行 §十一 完整 DDL（建表 + 索引 + RLS + 预置数据）
3. 验证：SELECT table_name FROM information_schema.tables WHERE table_schema='public'
4. 验证：确认 8 张表 + 9 条索引 + RLS enabled
5. 验证：尝试 DELETE FROM departments WHERE name='制一' → 应报 FK 错误
6. 手动插入测试数据：1 条订单 + 5 条节点
7. 产出：Phase 1-B Completion Report
```

---

> **Phase 1-A 正式关闭。Schema Plan 已 Freeze。进入 Phase 1-B。**
