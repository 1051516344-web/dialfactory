# DialFactory Phase 3-B · Business Adaptation Plan

> **状态：** Design — Awaiting Review
> **目标：** 将 V1.0 Demo 版本调整为真实工厂试用版本 (V1.1)
> **基于：** [32-Factory-Reality-Gap-Analysis.md](32-Factory-Reality-Gap-Analysis.md)
> **原则：** Freeze 优先。最小 Schema 变更。先解决阻塞问题。

---

## 0. V1.1 Scope

### 必须开发 (P0 — 阻塞工厂试用)

| # | 功能 | 原因 |
|:--|------|------|
| F1 | Order Route Builder (3 modes) | 无模板时无法创建订单 |
| F2 | Undo 机制 (5分钟窗口) | 操作错误无法回退 |
| F3 | Cancelled 订单状态 | 基本业务操作缺失 |

### 延后开发 (P1 — V1.5)

| # | 功能 | 原因 |
|:--|------|------|
| D1 | Route Editor 页面 | 管理员维护路线模板 |
| D2 | 部门待办→订单列表联动 | Dashboard 增强 |
| D3 | 异常统计聚合 | P6 增强 |
| D4 | 工序字典管理 UI | Supabase Dashboard 临时可用 |

### 永不开发

| # | 功能 | 原因 |
|:--|------|------|
| N1 | 自建后端服务器 | Supabase BaaS 已足够 |
| N2 | 自动排产 | 属于 MES 范畴 |
| N3 | 财务/库存/采购模块 | 属于 ERP 范畴 |
| N4 | 移动原生 App | PWA 可覆盖 |

---

## 1. Order Route Builder — 详细设计

### 1.1 问题陈述

V1.0 订单创建强制要求选择路线模板 (`process_routes`)。但工厂没有标准化的路线模板（"每个订单实际路线不同"）。当 `process_routes` 表为空时，创建订单完全阻塞。

### 1.2 三种构建模式

```
┌─────────────────────────────────────────────────────┐
│                 Order Route Builder                  │
│                                                     │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐        │
│  │ 模板模式  │   │ 历史复制  │   │ 手工构建  │        │
│  │ Template │   │Historical│   │  Manual  │        │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘        │
│       │              │              │               │
│       ▼              ▼              ▼               │
│  process_routes  历史orders     processes字典       │
│  + route_steps   .route_snapshot  (35道工序)        │
│       │              │              │               │
│       └──────────────┼──────────────┘               │
│                      │                              │
│                      ▼                              │
│              确认工序列表                            │
│           (confirmed / cancelled)                   │
│                      │                              │
│                      ▼                              │
│              route_snapshot                         │
│              order_nodes                            │
└─────────────────────────────────────────────────────┘
```

### 1.3 模式一：模板模式 (Template)

**适用场景：** 工厂已定义了标准路线模板。

**入口条件：** `process_routes` 表有数据。

**流程：**
```
1. 下拉选择路线模板
2. 系统加载 route_steps → 展示工序列表
3. 跟单员确认/取消每道工序 (ADL-001)
4. is_required=true 的工序锁定不可取消
5. 确认完成 → 生成 route_snapshot + order_nodes
```

**与 V1.0 一致。** 不需要修改。

### 1.4 模式二：历史复制 (Historical Copy)

**适用场景：** 跟单员记得"上次给时诺做的那批差不多"，想复用之前的路线。

**入口条件：** 有历史订单（`orders` 表有数据）。

**流程：**
```
1. 选择来源订单:
   - 下拉列表: 最近20条订单 (order_no + customer + date)
   - 或搜索: 按客户/日期范围查找

2. 加载该历史订单的 route_snapshot.steps[]
   - 展示: seq, process_code, process_name, dept_name, is_required
   - 全部默认 confirmed=true (该订单当时的确认状态)

3. 跟单员微调:
   - 取消不需要的工序 (toggle)
   - 可以追加新工序 (从 processes 字典中选择)
   - is_required 工序锁定

4. 确认完成 → 生成 route_snapshot (source='historical', source_order_id=xxx) + order_nodes
```

**数据来源：**
```javascript
// 获取可选的历史订单
OrdersAPI.list({ pageSize: 20, order: 'created_at.desc' })

// 加载选中订单的 snapshot
const { data: order } = await OrdersAPI.getById(sourceOrderId);
const steps = order.route_snapshot?.steps || [];
```

**UI：**
```
┌──────────────────────────────────────────────┐
│ 复制历史路线                                  │
│                                              │
│ 选择来源订单: [#0088 时诺 太阳纹+银白 ▾]      │
│                                              │
│ 该订单的路线 (2026-08-06 创建):               │
│ ✅ P01 冲板 · 制一                            │
│ ✅ P15 刷太阳纹 · 制二                        │
│ ❌ P13 喷砂 · 制二           [点击切换]       │
│ ✅ P16 电镀 · 制二                            │
│ ...                                          │
│                                              │
│ [+ 追加工序]                                  │
│                                              │
│ 已确认: 10 道 · 已取消: 2 道                  │
│              [创建订单 ✓]                     │
└──────────────────────────────────────────────┘
```

### 1.5 模式三：手工构建 (Manual Build)

**适用场景：** 无模板可用，无历史可参考。从零开始构建。

**入口条件：** 无。始终可用。当 `process_routes` 为空时自动默认选中。

**流程：**
```
1. 展示全部 35 道工序 (按部门分组)
2. 跟单员逐道勾选需要的工序
3. is_required=true 的工序默认勾选且不可取消
4. 选择后自动排序 (按部门seq + 工序code)
5. 可以手动调整顺序 (拖拽或上下移动)
6. 确认完成 → 生成 route_snapshot (source='manual') + order_nodes
```

**UI：**
```
┌──────────────────────────────────────────────┐
│ 手工构建路线                                  │
│                                              │
│ 制一 (11道)                                   │
│ ☑ P01 冲板 [必修]    ☐ P04 允窗              │
│ ☑ P02 冲孔           ☐ P05 平压              │
│ ☑ P03 焊脚 [必修]    ☐ P07 车圈              │
│ ☑ P06 撕胶纸 [必修]  ☐ P08 车窗              │
│ ☐ P09 车唱片纹        ☐ P10 倒喇叭孔          │
│ ☐ P11 磨毛刺                                  │
│                                              │
│ 制二 (14道)                                   │
│ ☑ P16 电镀 [必修]    ☐ P12 磨板              │
│ ☑ P17 打底 [必修]    ☐ P13 喷砂              │
│ ☑ P19 消光 [必修]    ☐ P14 刷直线纹           │
│ ☑ P15 刷太阳纹       ☐ P18 喷漆              │
│ ☑ P20 烤板 [必修]    ☐ P21 洗板              │
│ ☑ P23 QC板面 [必修]  ☐ P22 抛光              │
│ ☑ P24 QC排版移交[必修]                        │
│ ☑ P25 QC接板移交[必修]                        │
│                                              │
│ 制三 (2道)                                    │
│ ☐ P26 网印           ☐ P27 球印              │
│                                              │
│ 制四 (7道)                                    │
│ ☐ P28 穴修           ☐ P32 点夜光            │
│ ☐ P29 装钉           ☐ P33 贴UP              │
│ ☐ P30 打胶           ☐ P34 组装配件          │
│ ☐ P31 调钉                                    │
│                                              │
│ 总QC                                          │
│ ☑ P35 总QC [必修]                             │
│                                              │
│ 已选择: 18 道工序                             │
│ [按部门自动排序] [手动调整顺序]                 │
│                                              │
│              [确认工序 → 创建订单]             │
└──────────────────────────────────────────────┘
```

### 1.6 V1.1 默认行为

| `process_routes` 状态 | 默认模式 | 可切换 |
|---------------------|:------:|:-----:|
| 有数据 (≥1条) | 模板模式 | ✅ 可切换到历史/手工 |
| 无数据 (0条) | **手工构建** | ✅ 可切换到历史 |

### 1.7 Schema 影响

**无。** `route_id` 已允许 NULL。`route_snapshot` 新增 `source` 字段（JSONB 内部，非表结构）。

---

## 2. Undo 机制设计

### 2.1 与 Rework 的区别

| 维度 | Undo | Rework |
|------|------|--------|
| **触发** | "点错了，撤销" | "质量不好，重做" |
| **数据操作** | UPDATE status 回退 | INSERT 新节点 |
| **rework_pass** | 不变 | +1 |
| **时间限制** | 5 分钟窗口 | 无限制 |
| **按钮样式** | 灰色小字"撤销" | 橙色按钮"返工" |
| **确认对话框** | 无 (撤销不需要确认) | 有 ("确认返工？") |
| **可见性** | 仅 undo_window 内 | 始终可见 (done 节点) |

### 2.2 撤销规则

```
规则 1: 只能撤销最近一次操作
规则 2: 5分钟内有效 (CONFIG.UNDO_WINDOW_MINUTES)
规则 3: 仅撤销状态变更，不删除数据
规则 4: 如果有下游节点被自动激活 → 同步回退
规则 5: cancelled 状态不可撤销
规则 6: 不支持撤销 rework/append 创建的节点（那是新数据，不是错误）

撤销矩阵:
  done → active    (撤销"完成")
  active → waiting  (撤销"自动激活")
  paused → active   (撤销"暂停")
```

### 2.3 实现伪代码

```javascript
NodeActions.undo(node):
  // 1. 时间窗口检查
  const elapsed = Date.now() - new Date(node.updated_at).getTime();
  if (elapsed > UNDO_WINDOW_MS) {
    return { ok: false, error: '已超过撤销时间窗口' };
  }

  // 2. 状态回退
  const undoMap = {
    'done':   { status: 'active',  cascade: 'deactivate_next' },
    'paused': { status: 'active',  cascade: null },
    'active': { status: 'waiting', cascade: null }
  };
  const undoAction = undoMap[node.status];
  if (!undoAction) return { ok: false, error: '当前状态不支持撤销' };

  // 3. 执行回退
  await OrdersAPI.updateNode(node.id, {
    status: undoAction.status,
    pause_reason: null
  });

  // 4. 级联处理
  if (undoAction.cascade === 'deactivate_next') {
    const nextNode = findNextNode(node);
    if (nextNode && nextNode.status === 'active') {
      await OrdersAPI.updateNode(nextNode.id, { status: 'waiting' });
    }
  }

  // 5. 重新推导订单状态
  await updateOrderStatus();
```

### 2.4 UI 表现

```
节点卡片 (done, 3分钟前完成):
┌──────────────────────────────────┐
│ ✓ P01 冲板 · 制一                │
│   已完成 · 3分钟前                │
│                                  │
│ [返工] [+ 追加工序] [记录异常]    │
│ 撤销                            │  ← 灰色小字，无背景
└──────────────────────────────────┘

节点卡片 (done, 10分钟前完成):
┌──────────────────────────────────┐
│ ✓ P01 冲板 · 制一                │
│   已完成 · 10分钟前               │
│                                  │
│ [返工] [+ 追加工序] [记录异常]    │
│            (撤销已超时)           │  ← 不显示
└──────────────────────────────────┘
```

### 2.5 Schema 影响

**无。** 纯应用层逻辑。

---

## 3. Cancelled 订单状态设计

### 3.1 状态机

```
                    ┌──────────────────────────────┐
                    │        in_production          │
                    └──────────────┬───────────────┘
                                   │
              ┌────────────────────┼──────────────────┐
              ▼                    ▼                  ▼
         ┌─────────┐         ┌─────────┐       ┌──────────┐
         │ paused  │         │completed│       │cancelled │
         └────┬────┘         └─────────┘       └──────────┘
              │                    ▲                  
              └──── resume ────────┘                  
                                                       
         in_production ──── cancel ────→ cancelled     
         paused ────────── cancel ────→ cancelled     
                                                       
         cancelled ──→ 任何状态: ❌ 不可逆              
```

### 3.2 取消操作

```
触发: 跟单员在 P4 Order Detail 点击"取消订单"
条件: 订单状态 ≠ 'completed' 且 ≠ 'cancelled'
确认: 二次确认对话框
  ┌─────────────────────────────────┐
  │ 确认取消订单 #DEMO-001？         │
  │                                 │
  │ 取消后所有进行中的工序将暂停。    │
  │ 此操作不可撤销。                 │
  │                                 │
  │         [返回]  [确认取消]       │
  └─────────────────────────────────┘

执行:
  1. 所有 active/waiting 节点 → paused
  2. orders.status = 'cancelled'
  3. 记录取消时间 (updated_at)

不可逆:
  cancelled 状态不可更改任何节点
  所有操作按钮隐藏
```

### 3.3 权限

V1.0: 无角色区分（单一跟单员）。任何人可取消。

V2: 仅 admin/跟单员可取消。viewer 无权限。

### 3.4 Schema 变更

**Migration 002:**
```sql
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('in_production', 'paused', 'completed', 'cancelled'));
```

---

## 4. 历史 Excel 数据未来导入方案

### 4.1 15 年订单数据的现实

工厂提到有 15 年的订单数据。但这需要澄清：

| 问题 | 可能的情况 |
|------|----------|
| 数据格式 | 纸质跟单本？Excel？ERP导出？ |
| 数据完整度 | 每张订单的完整工序轨迹？还是只有订单号+客户？ |
| 数据量 | 15年 × 年均订单数 = ？ |
| 数字化程度 | 需要手工录入还是可以文件导入？ |

### 4.2 分阶段策略

```
Phase 3 (当前):
  不导入。先让跟单员用系统创建新订单。
  15年纸质数据留在跟单本上。

Phase 4 (运营1个月后):
  评估导入需求。
  如果跟单员频繁回头查纸质本 → 批量补录最近3个月的订单。
  工具: Python 脚本 (CSV → Supabase API)。

Phase 5 (运营6个月后):
  如果工厂确实有完整的电子数据 (Excel/CSV):
    开发批量导入工具。
    包含: orders + route_snapshot + order_nodes + exception_events。
  
  如果数据是纸质的:
    建议只导入"代表性订单"（每种路线2-3张）。
    不需要导入全部15年。
```

### 4.3 路线经验沉淀

15年的跟单经验是核心资产。沉淀方式：

**短期 (Phase 3-4):**
- 跟单员用"手工构建"和"历史复制"模式创建订单
- 系统自动积累 `route_snapshot` 数据
- 每张订单的实际路线被保留为可复用的模板

**中期 (Phase 5):**
- 分析积累的 route_snapshot 数据
- 找出高频工序组合 → 生成推荐模板
- 管理员审核后加入 `process_routes` 作为正式模板

**长期 (V2+):**
- 基于规格参数 (base_texture + plate_color + sand_type) 的路线推荐
- 客户偏好路线学习
- 质量数据与工序关联分析

### 4.4 Schema 影响

**无。** 导入工具使用现有表结构。

---

## 5. V1.1 范围冻结

### 5.1 必须开发 (F1-F3)

| ID | 功能 | 文件 | Effort |
|:--|------|------|:------:|
| F1 | Route Builder — 模板模式 | 不变 (V1.0 已有) | 0 |
| F1 | Route Builder — 历史复制模式 | `order-create.js` + `order-create.js` (domain) | Medium |
| F1 | Route Builder — 手工构建模式 | `order-create.js` + `order-create.js` (domain) | Medium |
| F2 | Undo — NodeActions.undo() | `node-actions.js` + `order-detail.js` | Small |
| F3 | Cancelled 订单状态 | `order-state.js` + `order-detail.js` + `dashboard.js` | Small |
| — | Migration 002 | `supabase/migrations/002_add_cancelled.sql` | 1 line |

### 5.2 延后开发 (D1-D4) → V1.5

| ID | 功能 | 原因 |
|:--|------|------|
| D1 | Route Editor (路线CRUD) | 先用 Supabase Dashboard 维护 |
| D2 | 部门待办联动 | Dashboard 增强，非阻塞 |
| D3 | 异常统计聚合 | P6 增强 |
| D4 | 工序字典管理 UI | Supabase Dashboard 可临时用 |

### 5.3 永不开发 (N1-N4)

| ID | 功能 | 替代 |
|:--|------|------|
| N1 | 自建后端 | Supabase BaaS |
| N2 | 自动排产 | 工厂排产靠经验，不做算法 |
| N3 | 财务/库存模块 | 交给 ERP |
| N4 | 移动 App | PWA |

---

## 6. Schema 影响评估

### 6.1 V1.0 → V1.1 变更

| # | Change | DDL | Migration |
|:--|--------|:---:|-----------|
| 1 | `orders.status` + `cancelled` | ALTER CHECK | 002 |

**唯一 Schema 变更：1 行 ALTER TABLE。**

### 6.2 不涉及 Schema 的变更

| 功能 | 原因 |
|------|------|
| Route Builder (3 modes) | `route_id` 已允许 NULL。snapshot 使用现有 JSONB |
| Undo | 纯应用层：UPDATE status |
| 历史复制 | 读取现有 `route_snapshot` |
| 手工构建 | 读取 `processes` 表 |

### 6.3 Migration 002 执行计划

```
1. 创建 supabase/migrations/002_add_cancelled.sql
2. 本地验证 SQL 语法
3. 推送 → GitHub Actions 自动部署
4. 或手动: npx supabase db push
5. 验证:
   INSERT INTO orders (order_no, order_qty, due_date, status)
   VALUES ('TEST-CANCEL', 1, '2026-12-31', 'cancelled');
   -- 应成功
   DELETE FROM orders WHERE order_no = 'TEST-CANCEL';
```

---

## 7. Phase 3-B 文件清单

| # | 文件 | Action | Purpose |
|:--|------|:------:|---------|
| 1 | `supabase/migrations/002_add_cancelled.sql` | Create | DDL |
| 2 | `js/domain/order-create.js` | Modify | Route Builder logic |
| 3 | `js/domain/node-actions.js` | Modify | +undo() |
| 4 | `js/domain/order-state.js` | Modify | +cancelled handling |
| 5 | `js/pages/order-create.js` | Modify | 3-mode UI |
| 6 | `js/pages/order-detail.js` | Modify | Undo button + cancel button |
| 7 | `js/pages/dashboard.js` | Modify | +cancelled stat card |
| 8 | `js/config.js` | Modify | +UNDO_WINDOW_MINUTES |

**Total: 1 Migration + 7 JS files.**

---

> **Plan ready. V1.1 scope frozen. 1 Schema change. 3 new features. Awaiting approval.**
