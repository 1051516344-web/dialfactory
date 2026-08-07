# DialFactory Phase 3-A · Business Model Revision Review

> **状态：** Analysis — Awaiting Review
> **触发：** Phase 3-A Factory Data Gap Analysis
> **来源：** [Phase 0-B Historical Data](../Phase0/04-Historical-Data-Validation.md) · [ADL-001~003](../Phase0/ADL-Architecture-Decision-Log.md)
> **约束：** 不写代码。不修改数据库。仅分析和建议。

---

## Executive Summary

V1 的设计基于 **5 项假设**。Phase 0-B 的真实工厂数据推翻了其中 **3 项**：

| # | V1 假设 | 工厂实际 | 影响 |
|:--|--------|---------|:----:|
| 1 | 路线是标准化的（3-5条固定模板） | 🔴 路线不标准——"每个订单实际路线不同" | Route 模型需重新定位 |
| 2 | 电镀在制三 | 🔴 电镀(P16)在制二 | 工序部门归属修正 |
| 3 | 9-15道工序 | 🔴 **35道工序** | 工序字典扩容 |
| 4 | 仅总QC一个检验点 | 🟠 每个部门内含QC | 路线模板中需包含部门QC |
| 5 | 订单走完整路线 | 🟡 可能跳过非必修工序 | ADL-001已覆盖（confirmed机制） |

---

## 1. 订单删除/取消机制

### 1.1 当前 V1 设计

```
orders.status ∈ {in_production, paused, completed}
```

- 无 `cancelled` 状态
- 无软删除机制
- FK RESTRICT 阻止物理删除（保护数据）
- V1 实际上**不允许取消订单**

### 1.2 生产现场需求

| 场景 | 频率 | 当前处理 |
|------|:----:|---------|
| 客户取消订单 | 偶发 | 无法表达——订单只能 completed 或 paused |
| 录入错误（建了错单） | 偶发 | 无法删除——FK RESTRICT 阻止 |
| 订单暂停时间过长等同于取消 | 可能 | paused 状态语义模糊 |

### 1.3 推荐方案

**方案 A: 增加 `cancelled` 状态（需要 Schema 变更）**

```sql
-- 修改 CHECK 约束
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('in_production', 'paused', 'completed', 'cancelled'));
```

- 影响：DDL 变更（需 Change Proposal）
- 前端：Dashboard 增加"已取消"统计
- 节点：取消后所有非 done 节点 → paused

**方案 B: 使用 `note` + paused 模拟（无 Schema 变更）**

- `orders.status = 'paused'` + `note = 'CANCELLED: 客户取消'`
- V1 可用，语义不精确
- Dashboard 无法区分"暂停"和"取消"

**方案 C: 保留现状，等待 V1.5**

- V1 运行后观察：取消频率如何？
- 如果 < 5次/月 → 方案 B 临时方案可接受

### 1.4 建议

```
推荐：方案 A（增加 cancelled 状态）
理由：取消是基本业务操作。CHECK 约束变更是最小 DDL 变更。
优先级：Phase 3-B（与 Route Editor 同期）
Schema影响：1 行 ALTER TABLE
```

---

## 2. 工序推进错误撤销机制

### 2.1 当前 V1 设计

V1 Feature #9 "状态回退" 被标记但在 D-3 实现中延后：
- `NodeActions` 只有 forward 操作（advance/pause/resume/rework/append）
- 无 `undo()` 方法
- 错误的推进只能通过返工（rework）来补偿——创建新节点而非回退状态

### 2.2 生产现场需求

| 场景 | 现场频率 | 后果 |
|------|:------:|------|
| 点错了——把没做完的工序标记为完成 | 日常 | 需要通过返工创建新节点来"弥补" |
| 返工后发现其实是下游的问题 | 偶发 | 错误创建了多余的返工节点 |
| 暂停选错了原因 | 日常 | 只能恢复→重新暂停 |

### 2.3 推荐方案

**方案 A: 基于 `updated_at` 的时间窗口撤销（无 Schema 变更）**

```javascript
NodeActions.undo(node):
  // 1. Check: node.updated_at is within UNDO_WINDOW (e.g. 5 minutes)
  // 2. Reverse last status change:
  //    done → active (revert advance)
  //    paused → active (revert pause)
  //    active → waiting (revert manual activation)
  // 3. Update to previous status
  // 4. Cascade: if reverting done, deactivate auto-activated downstream
```

- 影响：仅 `NodeActions` 新增方法。无 Schema 变更
- 前端：节点卡片增加"撤销"按钮（在时间窗口内显示）
- 撤销窗口建议：5 分钟

**方案 B: 完整操作历史（需要新表）**

- 新增 `node_history` 表记录每次状态变更
- V1 不做（audit_logs 延后至 V2）

### 2.4 建议

```
推荐：方案 A（时间窗口撤销）
优先级：Phase 3-B
Schema影响：无（仅应用层）
撤销窗口：5分钟（configurable via CONFIG.UNDO_WINDOW_MINUTES）
```

---

## 3. Route 模型重新定位

### 3.1 当前 V1 设计 (ADL-001)

```
process_routes (模板) → 跟单员选择 → 确认/取消工序
    → route_snapshot (JSONB) → order_nodes (仅 confirmed=true)
```

核心假设：工厂有 **3-5 条标准化路线模板**，跟单员选择后微调。

### 3.2 工厂实际

| 工厂原话 | 含义 |
|---------|------|
| "当前每个订单实际路线不同需要进一步总结规律" | 路线不是标准化的 |
| 35道工序，但每条订单只走其中一部分 | 路线是每次"组合"的结果 |
| 每张订单的工序选择取决于产品规格 | 路线由规格参数决定 |

**核心矛盾：V1 假设"路线模板 → 微调 → 执行"，但工厂实际是"规格参数 → 经验判断 → 逐单确定"。**

### 3.3 当前 route_snapshot 已有能力

ADL-001 的 `route_snapshot` JSONB 已经是正确的方向：

```json
{
  "route_id": "1a1158f2-...",
  "route_name": "太阳纹+银白路线",
  "snapshot_at": "2026-08-06T...",
  "steps": [
    { "seq": 1, "process_code": "P01", "process_name": "冲板",
      "dept_name": "制一", "is_required": true, "confirmed": true },
    { "seq": 2, "process_code": "P15", "process_name": "刷太阳纹",
      "dept_name": "制二", "is_required": false, "confirmed": true },
    { "seq": 3, "process_code": "P13", "process_name": "喷砂",
      "dept_name": "制二", "is_required": false, "confirmed": false }
  ]
}
```

**这个设计已经支持非标准路线：** 不管跟单员如何选工序，最终都会被快照记录。

### 3.4 推荐：强化 Snapshot-First 模型

```
当前 (Template-First):
  选模板 → 微调 → 快照 → 节点
      ↑
   工厂没有标准模板

修订 (Snapshot-First):
  选规格参数 → 推荐工序列表 → 确认 → 快照 → 节点
      ↑
   基于规格自动推荐 (Phase 3-C AI)
```

**短期（V1）：** 保留现有流程。对于"没有模板"的情况，跟单员可以：
1. 选择一个近似模板作为起点（即使不完美）
2. 使用"动态追加"任意工序
3. route_snapshot 记录每次的实际选择

**中期（V1.5）：** 
- 规格驱动推荐：`base_texture='太阳纹'` → 自动推荐包含 P15(刷太阳纹) 的工序列表
- 历史订单匹配：跟单员选客户+规格 → 系统推荐该客户上次使用的工序

**Schema 影响：无。** route_snapshot 已完全支持此模型。

---

## 4. 历史订单 Excel 导入方案

### 4.1 当前 V1 设计

- 订单创建仅通过前端 P3 页面
- 无批量导入能力
- `DialFactory_数据采集模板.xlsx` 包含 10 个 Sheet，但多数为空

### 4.2 工厂实际

| Sheet | 内容 | 完整度 |
|-------|------|:------:|
| 部门清单 | 5行完整 | ✅ |
| 客户清单 | 16行完整 | ✅ |
| 工序清单 | 35行完整 | ✅ |
| 工艺路线 | 仅1行 | 🔴 |
| 历史订单 | 仅1行示例 | 🔴 |
| 工序执行记录 | 仅1行 | 🔴 |

### 4.3 推荐方案

**Phase 3-C: 轻量导入工具**

不开发完整的 Excel 解析引擎。使用 Python 脚本：

```python
# tools/import_historical_orders.py
# 1. 读取 Excel Sheet
# 2. 逐行映射到 orders + order_nodes + route_snapshot
# 3. 通过 Supabase REST API 批量插入
# 4. 输出导入日志
```

**Schema 影响：无。** 使用现有表结构。

**限制：**
- 只导入具有完整工序执行记录的历史订单
- Sheet 5-6 目前仅1行数据——导入价值有限
- 优先补充工厂数据而非开发导入工具

---

## 5. AI 路线规律分析方案

### 5.1 当前 V1 设计

AI 完全延后至 V1.5+。ADL-001 明确："AI 路线推荐 / 历史订单匹配延后至 V2+，不作为 V1 核心决策机制。"

### 5.2 为什么现在评估

工厂数据揭示了一个结构性矛盾：
- V1 需要路线模板来创建订单
- 工厂没有标准化的路线模板
- 跟单员每次凭经验决定走哪些工序

**如果工厂无法提供标准路线，V1 的"选模板→确认"流程就失去了数据基础。**

### 5.3 推荐：V1 最小可行方案

**不需要 AI。使用简单规则匹配：**

```
规格参数 → 工序推荐规则

base_texture = '太阳纹'   → 推荐 P15(刷太阳纹), P19(消光)
base_texture = 'CD纹'     → 推荐 P09(车唱片纹), P19(消光)
plate_color = '银白*'     → 推荐 P16(电镀), P17(打底)
plate_color = '金色*'     → 推荐 P16(电镀), P17(打底)
sand_type  != '-'         → 推荐 P13(喷砂)
```

这可以在前端静态配置（`CONFIG.TEXTURE_PROCESS_MAP`），不需要 AI。

**中期（V1.5）：** 基于历史订单的工序出现频率统计
- 选择"客户X + 太阳纹 + 银白" → 系统查找该客户+规格组合的历史订单 → 推荐最常用的工序列表
- 随着订单数据积累自动优化

**Schema 影响：无。** 纯应用层逻辑。

---

## 6. 综合建议：Schema 变更评估

| # | 变更 | DDL | 优先级 | Phase |
|:--|------|:---:|:------:|:-----|
| 1 | `orders.status` 增加 `cancelled` | ALTER CHECK | P1 | 3-B |
| 2 | 撤销机制 (时间窗口) | 无 | P1 | 3-B |
| 3 | Route 模型强化 Snapshot | 无 | — | V1 已有 |
| 4 | Excel 导入工具 | 无 | P2 | 3-C |
| 5 | 规格→工序推荐规则 | 无 | P2 | 3-C |

**唯一 Schema 变更：1 行 ALTER TABLE（`cancelled` 状态）。其他全部是应用层增强。**

---

## 7. Phase 3 后续开发路线

```
Phase 3-A  Factory Data Assessment     ✅ COMPLETE (28-Phase3A)
Phase 3-A  Business Model Revision      ✅ 本文档 (30-Phase3A)
Phase 3-B  V1 Enhancements
  ├── orders.status + 'cancelled'       DDL: ALTER CHECK
  ├── NodeActions.undo()                应用层: 时间窗口撤销
  ├── Route Editor 页面                 新页面: 路线CRUD
  └── 真实数据迁移                      16 Customers + 35 Processes
Phase 3-C  Tooling
  ├── 规格→工序推荐 (规则引擎)          应用层
  ├── Excel 导入脚本 (可选)             Python tool
  └── 历史订单匹配 (V1.5 preview)       应用层
Phase 3-D  Validation & Freeze Update
  ├── 全流程端到端测试
  └── Freeze Manifest 更新 (V1.1)
```

---

## 8. Decision Points (需人工确认)

| # | 决策 | 选项 | 推荐 |
|:--|------|------|:----:|
| D1 | 增加 `cancelled` 状态？ | A: 是 / B: 延后 V1.5 / C: 用 note 模拟 | **A** |
| D2 | 实现撤销机制？ | A: 5分钟窗口 / B: 完整操作历史 / C: 不实现 | **A** |
| D3 | 路线模型方向？ | A: 维持 Template-First / B: 转向 Snapshot-First / C: 两者并存 | **C** (模板作为起点，Snapshot为真值) |
| D4 | Route Editor 页面？ | A: Phase 3-B 开发 / B: Supabase Dashboard 维护 / C: 不需要 | **A** |
| D5 | Excel 导入工具？ | A: Phase 3-C 开发 / B: 手动录入 / C: 不需要 | **B** (数据太少，导入价值有限) |

---

> **Phase 3-A Revision complete. 1 Schema change proposed (cancelled status). All other enhancements are application-layer. Awaiting decisions D1-D5.**
