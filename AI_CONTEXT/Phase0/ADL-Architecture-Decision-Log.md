# DialFactory · Architecture Decision Log

> 用途：记录关键架构决策及其依据。每条决策包含：背景、决策内容、替代方案、影响范围、关联文档。

---

## ADL-001 · 路线模板 ≠ 生产路线

**日期：** 2026-08-06
**阶段：** Phase 0-A
**状态：** 已确认

### 背景

Phase 0-A 方向调整：DialFactory V1 不采用"AI 自动生成工艺路线"模式。需要明确定义路线模板与订单实际执行工序之间的关系。

### 决策

**路线模板是"建议集"，不是"强制集"。生产路线由跟单员人工确认。**

核心流程：
```
标准路线模板 (process_routes + route_steps)
        │
        ▼
建单时确认/调整（跟单员逐项确认或取消非必修工序）
        │
        ▼
生成订单节点 (order_nodes = 真实生产轨迹)
        │
        ▼
生产过程中允许动态追加返工节点（人工触发）
```

具体规则：
1. 工厂维护标准路线模板（`process_routes` + `route_steps`）——作为建议
2. 创建订单时，系统展示路线的全部建议工序，跟单员确认或取消（`processes.is_required=true` 的工序不可取消）
3. 确认结果写入 `orders.route_snapshot` (JSONB)：每个步骤标记 `confirmed: true/false`
4. 仅 `confirmed=true` 的工序展开为 `order_nodes`
5. 生产过程中，跟单员可通过"动态追加节点"插入任意工序（返工/重洗/退回重做），seq 自动重算
6. AI 路线推荐 / 历史订单匹配延后至 V2+，不作为 V1 核心决策机制

### 替代方案（已否决）

| 方案 | 否决原因 |
|------|---------|
| 系统自动展开全部路线步骤，不允许调整 | 不符合生产灵活性——并非每张订单都需要路线的全部工序 |
| 系统根据订单参数自动选择工序 | AI 决策缺乏数据验证，高风险。V1 阶段跟单员比系统更了解生产现场 |
| 为每条路线定义"可选步骤" vs "必选步骤" | 过度设计。V1 路线少（3-5条），跟单员逐项确认即可 |

### 影响范围

| 层面 | 影响 |
|------|------|
| 数据库 | 无 DDL 变更。`route_snapshot` JSONB 内容增加 `confirmed` 标记 |
| V1 功能 | 功能清单 9→10 项：新增"动态追加节点"；订单创建流程增加"工序确认步骤" |
| 前端 | 创建订单页增加工序确认 UI（展示建议工序列表，勾选/取消） |
| 业务流程 | 跟单员从"选路线→自动生成"变为"选模板→确认→生成" |

### 关联文档

- [Phase0-A.2-Route-Architecture-Review.md](Phase0-A.2-Route-Architecture-Review.md) — 完整审查报告
- [9-V1-Scope-Definition.md](9-V1-Scope-Definition.md) — V1 功能清单已更新至 10 项
- [10-Business-Model-V1.md](10-Business-Model-V1.md) — 业务规则已同步
- [7-架构设计-v1.md](7-架构设计-v1.md) — 架构决策已同步
- [3-核心业务模型.md](3-核心业务模型.md) — 模型总览已更新

---

## ADL-002 · 返工由人工决策，不做系统自动路由

**日期：** 2026-08-06
**阶段：** Phase 0-A.2
**状态：** 已确认

### 背景

原架构设计（[7-架构设计-v1.md](7-架构设计-v1.md) §3.5）定义了 5 种自动返工策略（none/repeat_node/back_to_prev/back_to_first/fork）。Phase 0-A.2 审查认为 V1 应由跟单员人工决策返工目标，而非系统自动判断。

### 决策

1. **快捷返工（repeat_node）：** 保留为快捷操作——跟单员点"返工"，系统自动创建相同工序的 rework_pass+1 节点
2. **动态追加节点：** 新的通用操作——跟单员选择任意工序和插入位置，系统创建新节点，seq 自动重算
3. **V1 不在 processes 表设置 rework_strategy 字段**
4. AI 推荐返工目标延后至 V1.5+

### 影响范围

- `processes` 表不包含 `rework_strategy` / `rework_target_id` 字段
- `order_nodes.rework_pass` 语义明确：同工序重做时递增，新工序追加时=0

---

## ADL-003 · V1 四态模型（移除 handing_off）

**日期：** 2026-08-06
**阶段：** Phase 0-A (V1 Scope Definition)
**状态：** 已确认（本文档仅做交叉引用记录）

### 决策

节点状态从五态（waiting/active/done/paused/handing_off）简化为四态（waiting/active/done/paused）。`handing_off` 仅在外协发出等返回场景有意义，外协整体不在 V1。

详见 [9-V1-Scope-Definition.md](9-V1-Scope-Definition.md) §六。

---

> **日志维护规则：** 新决策按 ADL-{序号} 追加。每条决策链接到产生它的 Review/Proposal 文件。决策变更时标注"已废弃"并引用替代决策编号。
