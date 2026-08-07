# DialFactory Phase 3-A · Factory Data Migration Plan

> **状态：** Plan — Awaiting Review
> **阶段：** Phase 3-A — Factory Data Assessment
> **来源：** [Phase 0-B Historical Data Validation](../Phase0/04-Historical-Data-Validation.md) · [Phase 0-A Business Language Mapping](../Phase0/01-Business-Language-Mapping.md)
> **约束：** 不修改 Freeze Schema。不新增表。不新增字段。

---

## 1. Demo vs Real Factory Gap Analysis

### 1.1 Departments

| 维度 | Demo (当前) | Real Factory | 差距 |
|------|-----------|-------------|:----:|
| 数量 | 5 | 5 | ✅ 一致 |
| 名称 | 制一~总QC | 制一~总QC | ✅ 一致 |
| 职能 | 无 | 制一11项, 制二12项, 制三3项, 制四7项, 总QC2项 | 🔴 缺失 |
| 关键修正 | — | **P16电镀在制二，非制三** | 🔴 V1假设错误 |

**Action:** 更新 `processes.default_dept_id` 使 P16 电镀归属制二。

### 1.2 Customers

| 维度 | Demo (当前) | Real Factory | 差距 |
|------|-----------|-------------|:----:|
| 数量 | 1 (虚构"时诺") | 16 (15活跃+1停用) | 🔴 缺15家 |
| 数据完整度 | SN (虚构) | 简称+全称+活跃状态 | ✅ Phase 0-A L3→L1 |

**Action:** 迁移全部 16 家真实客户。删除虚构"时诺"。

### 1.3 Processes

| 维度 | Demo (当前) | Real Factory | 差距 |
|------|-----------|-------------|:----:|
| 数量 | 5 (P01/P03/P05/P07/P09) | **35** (P01-P35) | 🔴 缺30道 |
| 命名 | V1假设名称 | 工厂真实术语 | 🔴 多处不一致 |
| 必经工序 | P01+P09 (2道) | **11道** | 🟡 需更新 |
| 部门归属 | V1假设 | 工厂实际 | 🔴 P16电镀→制二 |

**关键术语差异：**

| V1 Demo 名称 | 工厂真实名称 | 编号 |
|-------------|------------|:----:|
| 冲压成型 | **冲板** + **冲孔** | P01, P02 |
| CD纹加工 | **车唱片纹** | P09 |
| 太阳纹加工 | **刷太阳纹** | P15 |
| 银白电镀 | **电镀** (含多种颜色) | P16 |
| 移印 | (不存在—工厂用 **网印**+**球印**) | P26, P27 |
| 装字钉 | **装钉** | P29 |
| 总QC检验 | **总QC** | P35 |

**Action:** 全量迁移 35 道工序。使用工厂真实名称和编号。

### 1.4 Routes

| 维度 | Demo (当前) | Real Factory | 差距 |
|------|-----------|-------------|:----:|
| 数量 | 1 (标准太阳纹+银白) | 仅1行不完整数据 | 🔴 工厂未标准化路线 |
| 步骤 | 5步 | 仅填了P01 | 🔴 |

**关键发现 (Sheet 4):** 工厂回答 "当前每个订单实际路线不同需要进一步总结规律" — 路线不是标准化的。

**Action:** 暂不迁移路线数据。等待工厂补充。现有 Demo Route 保留作为参考模板。

### 1.5 Orders & Nodes

| 维度 | Demo (当前) | Real Factory | 差距 |
|------|-----------|-------------|:----:|
| 订单 | 0 | 1行示例(SN-2026-0088) | 🟡 |
| 执行记录 | 0 | 1行示例 | 🔴 核心数据缺失 |

**Action:** 暂不迁移。由跟单员通过 UI 创建真实订单。

---

## 2. Migration Execution Plan

### Phase 3-A-1: Seed Real Data (No Schema Change)

**Step 1: Clean Demo Data**
```sql
DELETE FROM route_steps;
DELETE FROM process_routes;
DELETE FROM processes;
DELETE FROM customers WHERE code = 'SN';
```

**Step 2: Insert Real Customers (16 rows)**
```
ACC · ACCENDO HONG KONG LTD
ATT · 艺时香港有限公司
FAF · 俊光实业有限公司
REN · Reniey Watch Manufacturing Co.Ltd
OW · Oruebtak Wheel International
冠球 · 冠球代理人有限公司
TSI · TIMER SHINE INDUSTRY,CO.LTD
TEL · 晶宝电子有限公司
WEL · 三井表业有限公司
THA · 深圳市金辰宇科技有限公司
GLB · 东莞高宝精密钟表制品有限公司
PYX · 长安翡仕实业有限公司 (is_active=false)
APW · 东莞亚太表业有限公司
JIP · 钦州金泰精密制造有限公司
CES · 格致
```

**Step 3: Insert Real Processes (35 rows)**
全部 P01-P35，使用工厂真实名称、类型、部门归属、必经标记。

**Step 4: Wait for Route Data**
路线数据不完整 — 待工厂补充标准路线后再插入。

---

## 3. Management Capabilities Assessment

当前 V1 前端页面是**只读**的（P5 Route List 只展示，P3 Order Create 只选择）。真实数据迁移后需要管理能力：

### 3.1 工序管理 (Process Management)

| 需求 | V1 当前 | 是否需要新页面 |
|------|:------:|:-----:|
| 查看全部35道工序 | P5 只显示路线中的工序 | 建议新增 Process List 页或扩展 P5 |
| 启用/停用工序 | ❌ | 需通过 Supabase Dashboard |
| 修改工序名称/部门 | ❌ | 需通过 Supabase Dashboard |

**建议：** V1 阶段不新增 CRUD 页面。工序字典通过 Supabase Dashboard 维护（`processes.is_active` 切换）。跟单员不需要日常修改工序。

### 3.2 路线管理 (Route Management)

| 需求 | V1 当前 | 是否需要新页面 |
|------|:------:|:-----:|
| 创建/编辑路线模板 | ❌ | 🔴 **高优先级** |
| 路线步骤排序 | ❌ | 🔴 |
| 复制路线 | ❌ | 🟡 |

**建议：** 这是最大的能力缺口。工厂尚未标准化路线，需要一个 Route Editor 页面让管理员定义和调整路线。**建议 Phase 3-B 优先级实现。**

### 3.3 部门管理 (Department Management)

| 需求 | V1 当前 | 是否需要新页面 |
|------|:------:|:-----:|
| 查看部门职能 | ❌ | 建议扩展 P5 或 Dashboard |

**建议：** V1 不新增。部门预置数据不变（5个），职能描述可通过 `departments` 表增加字段或通过文档记录。

### 3.4 产品模板管理 (Product Template)

当前不存在。`orders` 表的 `base_texture`/`plate_color`/`sand_type` 是文本字段。工厂可能有多订单复用同一规格的需求。

**建议：** V1 不新增。使用 `orders.specs` JSONB 记录规格参数。V2 评估是否需要 `product_specs` 表。

---

## 4. Implementation Priority

| Priority | Task | Effort | Dependencies |
|:--------:|------|:------:|-------------|
| **P0** | 迁移 16 家真实客户 | 小 (API batch insert) | 无 |
| **P0** | 迁移 35 道真实工序 | 中 (API batch insert) | Departments 数据正确 |
| **P0** | 修正 P16 电镀部门归属 | 包含在上一步 | 确认制二ID |
| **P1** | Route Editor 页面 | 大 (新页面+API) | Phase 3-B |
| **P2** | 扩展 P5 显示全部工序 | 小 (扩展现有页面) | 工序数据就绪 |
| **P2** | 部门职能展示 | 小 (文档或页面) | 工厂确认 |
| **Out of V1** | 产品模板管理 | — | V2 |

---

## 5. Freeze Compliance

| Check | Status |
|-------|:------:|
| Tables modified | **0** — 只 INSERT/DELETE 数据行 |
| New tables | **0** |
| New fields | **0** |
| FK policy | Unchanged |
| ADL-001~003 | Unchanged |
| ADP-001~005 | Unchanged |
| Migration files | 不需要 — 这是数据操作，非 DDL |

---

## 6. Risk & Open Questions

| # | Risk / Question | Impact |
|:--|-----------------|:------:|
| Q1 | 路线数据不完整 — 工厂需要提供至少 2-3 条标准路线及其步骤 | 阻塞 P3 Order Create 的实际使用 |
| Q2 | 35道工序哪些属于"常用路线"？ | 影响 Route 数据初始化 |
| Q3 | P16电镀在制二 — 其他部门归属是否有更多偏差？ | 需要工厂逐工序确认 |
| Q4 | 制一有11道工序 — `seq` 顺序是否已确定？ | 影响路线步骤排序 |

---

> **Phase 3-A Plan ready. Next: Phase 3-B data migration execution. Awaiting factory answers to Q1-Q4.**
