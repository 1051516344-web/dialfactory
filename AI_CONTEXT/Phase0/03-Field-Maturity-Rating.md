# DialFactory Phase 0-A.3 · 字段成熟度评级

> 状态：Phase 0 执行中
> 输入：V1 Business Model (10)、V1 Scope DDL (9)、Business Language Library (Phase 0-A)、Phase 0-A.2 Gap Analysis
> 方法：逐字段判定 L1/L2/L3，交叉参考工厂语言库和业务模型
> 约束：不修改 context 文件，仅输出评级

---

## 评级框架

| 标签 | 含义 | 数据库策略 | 录入行为 | 判定标准 |
|------|------|-----------|---------|---------|
| **L1** | 已确认，强制 | `NOT NULL` 或有 `DEFAULT` | 必填或系统自动 | 工厂语言库直接证实 + V1 核心流转依赖 |
| **L2** | 经验规则 | 可空，`DEFAULT` 推荐值 | 可选，提示推荐值 | 逻辑合理但缺少工厂明确确认 / 值域未完整验证 |
| **L3** | 待收集 | `DEFAULT NULL`，前端隐藏 | 不收数据 | 无工厂数据支撑 / V1 预留字段 / 延后到 V1.5+ |

---

## 一、主数据表

### 1.1 departments（部门）

| # | 字段 | 级别 | 依据 | 数据来源 |
|---|------|------|------|---------|
| D01 | `name` | **L1** | 工厂语言库 A-01~A-04 直接证实"一/二/三/四"四个生产部门。V1 预置 5 个值（制一~四 + 总QC） | [01](01-Business-Language-Mapping.md) A类 |
| D02 | `seq` | **L1** | 工厂物理流程：制一→制二→制三→制四→总QC。线性顺序无歧义 | 工厂车间布局 |
| D03 | `type` | **L2** | 制一~四 = "生产"（L1）。总QC = "检验" 存疑——源数据暗示制四内含QC职能（[01](01-Business-Language-Mapping.md) Q-A04-1），可能不是独立部门 | [01](01-Business-Language-Mapping.md) A-04 |

> **评级说明：** `type` 字段对制一~四为 L1，对总QC为 L2（待确认QC是否独立部门）。整体标记 L2。

---

### 1.2 customers（客户）

| # | 字段 | 级别 | 依据 | 数据来源 |
|---|------|------|------|---------|
| C01 | `name` | **L3** | 工厂语言库未包含任何客户名称。V1 假设 17 家客户，但无一被实际数据证实 | — |
| C02 | `code` | **L3** | 同上。短码格式（如"C01"）是 V1 假设，未经验证 | — |
| C03 | `is_active` | **L2** | 逻辑合理——区分活跃/停用客户是基本需求。但无工厂数据 | — |

> **评级说明：** customers 整表数据处于 L3——17 家客户的名字、编号、活跃状态均未在任何源数据中出现。V1 建表时可预置空表，等待工厂填入。不影响 V1 核心流转（订单创建时可通过自由文本输入客户名过渡）。

---

## 二、工艺表

### 2.1 processes（工序目录）

| # | 字段 | 级别 | 依据 | 数据来源 |
|---|------|------|------|---------|
| P01 | `code` | **L2** | P01-P99 编号体系被 V1 模型假设。工厂语言库未直接出现"P01"等编号，但工序概念本身被确认（车/球/冲/网/电/搪/印背/组装等 12 个工序术语）。编号需工厂分配 | [01](01-Business-Language-Mapping.md) B类 |
| P02 | `name` | **L2** | 工厂语言库提供了 ~20 个工序概念，但：(a) 部分工序的精确名称待确认（"网印" vs "移印"是否为同一工序？Q-H05），(b) 车床的 4 种子类型如何命名待确认（Q-H02），(c) 工序粒度待确认（冲孔和冲板是否拆分？Q-H03） | [01](01-Business-Language-Mapping.md) B类 |
| P03 | `type` | **L1** | 三类（加工/检验/辅助）已被业务模型审查确认且与工厂语言库一致。B 类术语全部映射为"加工"，总QC映射为"检验" | [01](01-Business-Language-Mapping.md) B类；[10](../10-Business-Model-V1.md) E3 |
| P04 | `default_dept_id` | **L2** | 每个工序术语在语言库中有部门归属（如"车"→制一、"球"→制三）。但部分工序归属待确认（Q-M03: 搪瓷面属于制二还是制三？Q-M05: 印背属于制四？Q-M06: 组装在哪个部门？） | [01](01-Business-Language-Mapping.md) B类 |
| P05 | `is_required` | **L2** | 逻辑概念已被 Phase 0-A.2 路线审查确认——必修工序在订单创建时不可取消。但具体哪些工序是必修的（除总QC外）未向工厂确认 | Phase 0-A.2 ADL-001 |
| P06 | `is_active` | **L1** | 系统字段。停用工序保留编号是成熟设计模式，不依赖工厂数据 | — |

> **评级说明：** 工序的"存在性"被工厂语言库证实（L1级别），但精确名称、编号、部门归属仍有个别待确认项，整体标记 L2。

---

### 2.2 process_routes（路线模板）

| # | 字段 | 级别 | 依据 | 数据来源 |
|---|------|------|------|---------|
| PR01 | `name` | **L3** | 工厂语言库未包含任何路线名称（如"标准银白路线"）。V1 假设的 3-5 条路线完全未经真实数据验证 | — |
| PR02 | `is_active` | **L1** | 系统字段 | — |

> **评级说明：** process_routes 是 V1 依赖的核心表，但路线名称完全是 V1 假设。这是 Phase 0-B（用真实订单验证路线）的核心输入。

---

### 2.3 route_steps（路线步骤）

| # | 字段 | 级别 | 依据 | 数据来源 |
|---|------|------|------|---------|
| RS01 | `route_id` | **L1** | 外键，系统管理 | — |
| RS02 | `process_id` | **L1** | 外键，系统管理 | — |
| RS03 | `seq` | **L1** | 系统管理 | — |

> **评级说明：** route_steps 全部字段为系统级，L1。但表中数据的正确性完全依赖 processes 和 process_routes 的数据质量。

---

## 三、核心业务表

### 3.1 orders（订单）

| # | 字段 | 级别 | 依据 | 数据来源 |
|---|------|------|------|---------|
| O01 | `order_no` | **L2** | 订单号概念被 V13 验证。但编号格式是"工厂自编"还是"客户给的单号"待确认（[12](../12-Field-Verification-Checklist.md) Q1.3）。格式影响交互设计（自动生成 vs 手动输入） | V13 验证 |
| O02 | `customer_id` | **L2** | 外键引用 customers。因 customers 表为 L3，此字段的引用完整性在 V1 初期不可用。建议 V1 允许临时用文本输入客户名 | — |
| O03 | `order_qty` | **L1** | 跟单员必须知道"客户要多少"。V1 必填。工厂语言库未直接出现但业务逻辑强制 | [10](../10-Business-Model-V1.md) E2 |
| O04 | `due_date` | **L1** | 交期是跟单员首要工作依据（[8](../8-业务模型审查报告.md) §1.2）。业务模型审查明确标注为"必加字段" | [8](../8-业务模型审查报告.md) 问题2 |
| O05 | `route_id` | **L1** | 外键引用 process_routes。系统级——即使路线数据为 L3，外键字段本身是 L1 | — |
| O06 | `base_texture` | **L2** | 工厂语言库证实了"CD纹""太阳纹"两个值（B-01 子类型）。但：(a) "无底纹"未在语言库中出现，(b) 是否遗漏"搪瓷面"作为纹理类型（Q-D01-1），(c) 是否遗漏"喷漆"类表面处理（Q-B09-2） | [01](01-Business-Language-Mapping.md) B-01, D类 |
| O07 | `plate_color` | **L2** | V1 假设银白60s/金色/玫瑰金。工厂语言库新增"象牙"(E-01)。完整颜色清单未确认（Q-E01-2）。"60s"含义未确认（Q-E01-3） | [01](01-Business-Language-Mapping.md) E-01 |
| O08 | `sand_type` | **L3** | V1 假设重砂/轻砂/中砂/-。**工厂语言库完全未出现喷砂术语。** 可能工厂不用喷砂，或用其他术语描述。需确认此字段是否必要 | — |
| O09 | `specs` | **L3** | Phase 0-A.2 预留字段（C4）。用于容纳 base_texture/plate_color/sand_type 装不下的规格参数（字钉类型、消光程度等）。当前无工厂数据填充 | Phase 0-A.2 C4 |
| O10 | `second_route_id` | **L3** | Phase 0-A.2 预留字段（C3）。仅当工厂确认表盘多层且上下层路线不同时启用。当前无触发条件 | Phase 0-A.2 C3 |
| O11 | `status` | **L1** | 自动计算字段（in_production/paused/completed），从 order_nodes 推导。系统级 | — |
| O12 | `note` | **L1** | 自由文本，选填。系统能力 | — |
| — | `created_at` | **L1** | 系统时间戳 | — |
| — | `updated_at` | **L1** | 系统时间戳 | — |

> **评级说明：** orders 表评级分化明显——核心追踪字段（数量、交期、路线）为 L1；规格描述字段（纹理、颜色、喷砂）为 L2-L3，工厂语言库未完整覆盖。`sand_type` 评为 L3 是重要发现——如果工厂实际不使用喷砂概念，该字段应删除或合并到 specs。

---

### 3.2 order_nodes（工序执行记录）

| # | 字段 | 级别 | 依据 | 数据来源 |
|---|------|------|------|---------|
| N01 | `order_id` | **L1** | 外键，系统管理 | — |
| N02 | `process_id` | **L1** | 外键，系统管理 | — |
| N03 | `process_name` | **L1** | 快照字段，创建时自动复制。系统级 | — |
| N04 | `dept_id` | **L1** | 外键，系统管理 | — |
| N05 | `dept_name` | **L1** | 快照字段，创建时自动复制。系统级 | — |
| N06 | `status` | **L1** | V13 验证的核心状态（waiting/active/done/paused）。四态模型已被 Phase 0-A 确认 | V13；Phase 0-A ADL-003 |
| N07 | `seq` | **L1** | 系统管理。Phase 0-A.2 确认了动态追加时的 seq 重算规则 | Phase 0-A.2 §2.4 |
| N08 | `rework_pass` | **L1** | 返工是日常操作。工厂语言库中"电镀返工"是高频场景。Phase 0-A.2 明确了同工序递增 vs 新工序=0 的语义 | [01](01-Business-Language-Mapping.md) B-05；Phase 0-A.2 A3 |
| N09 | `qty_out` | **L2** | "仅检验类型节点必填"是业务模型审查的明确结论（[8](../8-业务模型审查报告.md) 问题4）。但工厂是否确实只在总QC记录数量待确认（Q7.1）。部分部门（制一QC）可能有检验节点（[01](01-Business-Language-Mapping.md) Q-C04-2） | [8](../8-业务模型审查报告.md) 问题4 |
| N10 | `pause_reason` | **L2** | Phase 0-A.2 C1——V1 确定执行。工厂语言库中"待办"(G-01) 直接对应 pause_reason 的一个值。但完整的暂停原因列表（等客户/等物料/等排期/客户暂停/质量暂停）未向工厂确认（Q-G01-1） | Phase 0-A.2 C1；[01](01-Business-Language-Mapping.md) G-01 |
| N11 | `layer` | **L3** | Phase 0-A.2 预留字段（C2）。仅当工厂确认表盘多层结构（GAP-2）时启用。当前无触发条件 | Phase 0-A.2 C2 |
| N12 | `is_outsourced` | **L2** | V1 预留字段。工厂语言库确认了外协概念——"创亿外印"(F-01)、"外印"(F-02)、"外发"(F-03)。V1 不使用但字段已在表中，可标记为"已知概念，V1.5 启用" | [01](01-Business-Language-Mapping.md) F类 |
| N13 | `supplier_id` | **L2** | 同上。工厂语言库已有供应商名称（"创亿"），但 V1 不使用 | [01](01-Business-Language-Mapping.md) F-01 |
| N14 | `note` | **L1** | 自由文本，选填。系统能力 | — |
| — | `created_at` | **L1** | 系统时间戳 | — |
| — | `updated_at` | **L1** | 系统时间戳。这是 V1 的"卡了多久"核心数据源 | — |

> **评级说明：** order_nodes 是评级最高的表——16 个字段中 11 个 L1。核心追踪功能已被 V13 和生产现场充分验证。仅规格相关预留字段（layer）和待采集字段（qty_out/pause_reason/is_outsourced）为 L2/L3。

---

### 3.3 exception_events（异常/质量事件）

| # | 字段 | 级别 | 依据 | 数据来源 |
|---|------|------|------|---------|
| E01 | `node_id` | **L1** | 关联执行记录。不设外键约束（节点删除后保留），系统级 | — |
| E02 | `type` | **L2** | V1 预设：色差/电镀不良/划伤/沙眼/变形/其他。工厂语言库未直接提供缺陷类型列表，但暗示了"电镀不良""色差"是高频类型（电镀是瓶颈工序，返工高频）。完整列表待工厂确认（[12](../12-Field-Verification-Checklist.md) Q3.1） | [12](../12-Field-Verification-Checklist.md) Q3.1 |
| E03 | `qty` | **L1** | 异常数量必填——不良品统计的基础。业务模型审查确认 | [8](../8-业务模型审查报告.md) §3.1 |
| E04 | `resolution` | **L2** | V1 预设：返回电镀/返回磨板/重做/特采/报废。工厂语言库未直接提供处理方式列表。GAP-4 发现"挪用"可能是一种额外处理方式（用库存替代），但不影响 V1 预设的完整性 | [12](../12-Field-Verification-Checklist.md) Q3.2；[01](01-Business-Language-Mapping.md) G-02 |
| — | `created_at` | **L1** | 系统时间戳 | — |

> **评级说明：** 异常事件的核心字段（关联节点、数量）为 L1。类型和处理方式的预设列表为 L2——值域可能不完整但 V1 有"其他"选项兜底。

---

## 四、评级汇总

### 4.1 逐表统计

| 表 | L1 | L2 | L3 | 总计 | L1 占比 |
|----|----|----|----|----|----|
| `departments` | 2 | 1 | 0 | 3 | 67% |
| `customers` | 0 | 1 | 2 | 3 | 0% |
| `processes` | 2 | 4 | 0 | 6 | 33% |
| `process_routes` | 1 | 0 | 1 | 2 | 50% |
| `route_steps` | 3 | 0 | 0 | 3 | 100% |
| `orders` | 7 | 4 | 3 | 14 | 50% |
| `order_nodes` | 11 | 4 | 1 | 16 | 69% |
| `exception_events` | 3 | 2 | 0 | 5 | 60% |
| **总计** | **29** | **16** | **7** | **52** | **56%** |

> 注：含系统字段（created_at/updated_at）。纯业务字段 L1 占比约 45%。

### 4.2 L1 字段清单（29 个，建表时必须 NOT NULL 或有 DEFAULT）

| 表 | L1 字段 |
|----|---------|
| departments | `name`, `seq` |
| customers | （无） |
| processes | `type`, `is_active` |
| process_routes | `is_active` |
| route_steps | `route_id`, `process_id`, `seq` |
| orders | `order_qty`, `due_date`, `route_id`, `status`, `note`, `created_at`, `updated_at` |
| order_nodes | `order_id`, `process_id`, `process_name`, `dept_id`, `dept_name`, `status`, `seq`, `rework_pass`, `note`, `created_at`, `updated_at` |
| exception_events | `node_id`, `qty`, `created_at` |

### 4.3 L2 字段清单（16 个，建表时可空 + DEFAULT 推荐值）

| 表 | L2 字段 | 待确认项 |
|----|---------|---------|
| departments | `type` | Q-A04-1: 总QC是否独立部门 |
| customers | `is_active` | — |
| processes | `code`, `name`, `default_dept_id`, `is_required` | Q-H02~Q-H05, Q-M03, Q-M05, Q-M06 |
| orders | `order_no`, `customer_id`, `base_texture`, `plate_color` | Q1.3, Q-E01-2, Q-E01-3 |
| order_nodes | `qty_out`, `pause_reason`, `is_outsourced`, `supplier_id` | Q7.1, Q-G01-1, Q-C04-2 |
| exception_events | `type`, `resolution` | Q3.1, Q3.2 |

### 4.4 L3 字段清单（7 个，建表时 DEFAULT NULL，前端隐藏）

| 表 | L3 字段 | 原因 |
|----|---------|------|
| customers | `name`, `code` | 无工厂数据，等待填入 |
| process_routes | `name` | 路线名称完全未经真实数据验证 |
| orders | `sand_type` | 工厂语言库零出现——可能不需要此字段 |
| orders | `specs` | Phase 0-A.2 预留，无触发条件 |
| orders | `second_route_id` | Phase 0-A.2 预留，等待 GAP-2 确认 |
| order_nodes | `layer` | Phase 0-A.2 预留，等待 GAP-2 确认 |

---

## 五、L3 字段的数据库策略

| 策略 | 字段 | 说明 |
|------|------|------|
| **V1 建表但前端隐藏** | `specs`, `second_route_id`, `layer` | Phase 0-A.2 预留字段。表中有列但 V1 界面不暴露。工厂确认需要时仅改前端 |
| **V1 建表，用替代方案过渡** | `customers.name`, `customers.code` | 订单创建时允许直接输入客户文本名，待客户数据就绪后建立外键关联 |
| **V1 建表，标记待评估** | `sand_type` | 如果 Phase 0-B 的真实订单数据中确实没有喷砂信息 → Proposal 建议删除 |
| **V1 建表，等待工厂填入** | `process_routes.name` | 路线数据是 V1 核心依赖。Phase 0-B 的首要输入 |

---

## 六、关键发现

### 发现 1：customers 整表数据缺失

工厂语言库（30 条术语）**零客户名称**。所有 12 份 AI_CONTEXT 文档均未包含任何真实客户数据。V1 假设 17 家客户但无一被证实。

**建议：** V1 建表时预置空 customers 表。订单创建页面允许直接输入客户名（文本），建表后再逐步建立客户主数据。不阻塞 V1 核心流转。

### 发现 2：sand_type 可能不需要

V1 设计了 `sand_type` 字段（重砂/轻砂/中砂/-），但工厂语言库 30 条术语中**零出现**。可能：(a) 工厂不用喷砂，(b) 喷砂被归入其他术语（如"哑光""消光"），(c) 喷砂是特殊订单的罕见需求。

**建议：** Phase 0-B 用真实订单数据验证。如果 10 张历史订单中均无喷砂信息 → 生成 Proposal 建议将 sand_type 合并到 specs JSONB 或删除。

### 发现 3：processes 的精确粒度待确认

工厂语言库暴露了 ~20 道工序概念，但 V1 当前仅有 9 道示例工序。工序粒度（如车床的 4 种子类型如何处理、冲孔冲板是否拆分、网印移印是否同一工序）是当前模型最大的未验证假设。

**建议：** 这是 Phase 0-B 的核心验证目标。输入：工厂提供的工艺路线明细（Sheet 4）。

### 发现 4：Phase 0-A.2 预留字段全部合理

4 个预留字段（specs/layer/second_route_id/pause_reason）的触发条件明确，默认 NULL 零成本。评级均为 L3 是合理的——它们不是"模型缺失"，而是"等待触发条件"。

---

## 七、产生的 Proposal

> 本次评级未发现需要对 V1 模型立即做结构性调整的问题。以下 2 项为建议性 Proposal，不阻塞 Phase 0。

### Proposal-001：sand_type 字段存续评估

- **触发条件：** Phase 0-B 真实订单数据中喷砂信息出现频率 = 0
- **建议：** 将 `sand_type` 合并到 `specs JSONB`，减少订单表字段
- **优先级：** 低（不影响 V1 核心流转，仅是字段整理）

### Proposal-002：customers 表 V1 初期使用文本过渡

- **触发条件：** Phase 0-B 开始时仍未获得客户清单
- **建议：** V1 前端在订单创建时允许"客户名"为自由文本输入（而非外键下拉）。待客户数据就绪后切换为下拉选择
- **优先级：** 中（影响订单创建 UI 设计）

---

## 八、Phase 0-A 关闭确认

Phase 0-A 三份产出物全部完成：

| # | 产出 | 文件 | 状态 |
|---|------|------|------|
| Phase 0-A | 业务语言逆向映射 | [01-Business-Language-Mapping.md](01-Business-Language-Mapping.md) | ✅ |
| Phase 0-A.2 | 模型缺口影响分析 | [Phase0-A.2-Model-Gap-Analysis.md](Phase0-A.2-Model-Gap-Analysis.md) | ✅ |
| Phase 0-A.2 | 路线架构审查 | [Phase0-A.2-Route-Architecture-Review.md](../Phase0-A.2-Route-Architecture-Review.md) | ✅ |
| Phase 0-A.2 | 架构决策日志 | [ADL-Architecture-Decision-Log.md](ADL-Architecture-Decision-Log.md) | ✅ |
| Phase 0-A.3 | 字段成熟度评级 | 本文档 | ✅ |

**Phase 0-A 可以正式关闭。**

---

> **下一阶段 Phase 0-B 入口条件：** (1) 工厂提供至少 2-3 张完整订单的工序执行记录；(2) 工厂确认 3-5 条常用工艺路线的具体工序步骤；(3) 高优先级 5 个问题（Q-H01~Q-H05）的工厂反馈。
