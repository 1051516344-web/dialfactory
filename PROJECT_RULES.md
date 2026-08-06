# DialFactory AI Collaboration Rules

## 当前阶段

Phase 0 — Reverse Engineering（历史生产数据逆向建模）

---

## 文件修改权限

### 原则

1. `AI_CONTEXT/` 中的设计文档属于**基准文件**，AI 默认**只读取，不修改**
2. 所有分析结果必须生成**新的 Review / Analysis 文件**，不覆盖基准文件
3. 任何对 V1 模型的修改建议：
   - 必须先生成 **Proposal 文件**（放入 `proposals/`）
   - 等待**人工确认**后才能修改源文件
4. 不自行假设业务规则——所有未知字段必须标记「待确认」

---

## 文件分类

| 目录 | 性质 | 权限 | 说明 |
|------|------|------|------|
| `AI_CONTEXT/` | 项目基准知识库 | **只读** | 12 份基准设计文档，不可修改 |
| `AI_CONTEXT/Phase0/` | AI 分析结果 | 可写 | Phase 0 阶段的分析产出 |
| `proposals/` | 修改建议 | 可写 | 对基准文件的变更提案，待人工审批 |
| `src/` | 未来代码 | 暂未开放 | 进入阶段 1 后启用 |
| `PROJECT_RULES.md` | 协作规则 | 人工更新 | 本文件，AI 可读取不可修改 |

---

## 修改流程

AI 发现问题时的标准操作链路：

```
发现模型问题 / 缺口
        │
        ▼
生成 Review 文件（放入 AI_CONTEXT/Phase0/）
   - 描述发现、定位来源、评估影响范围
        │
        ▼
生成 Proposal 文件（放入 proposals/）
   - 提出最小调整方案
   - 标注是否涉及 DDL / 新实体 / 字段变更
        │
        ▼
人工确认
   - 审批通过 → AI 更新 AI_CONTEXT/ 基准文件
   - 审批驳回 → Proposal 归档，记录驳回原因
   - 需工厂反馈 → 标记为 BLOCKED，等待外部输入
        │
        ▼
更新 AI_CONTEXT/ 基准文件
   - 同步更新关联文档的交叉引用
```

---

## 文件命名规范

| 类型 | 格式 | 示例 |
|------|------|------|
| Review | `Phase{X}-{Topic}-Review.md` | `Phase0-A.2-Route-Architecture-Review.md` |
| Analysis | `Phase{X}-{Topic}-Analysis.md` | `Phase0-A.2-Model-Gap-Analysis.md` |
| Proposal | `Proposal-{序号}-{简述}.md` | `Proposal-001-Add-Pause-Reason.md` |
| Mapping | `0{X}-{Topic}-Mapping.md` | `01-Business-Language-Mapping.md` |

---

## Phase 0 特定规则

1. 当前阶段**不写代码、不建数据库、不创建 Supabase 项目**
2. 所有分析基于 `AI_CONTEXT/` 中的已有设计文档 + 工厂提供的原始数据
3. 禁止重新设计系统——只分析、映射、验证
4. 禁止扩大 V1 Scope——V1 边界由 [9-V1-Scope-Definition.md](AI_CONTEXT/9-V1-Scope-Definition.md) 定义
5. 所有字段映射必须标注确认级别：L1（已确认）/ L2（经验假设）/ L3（待收集）

---

## Page Baseline Protocol (Phase 1-C+)

自 Phase 1-C 起，所有完成开发并通过验收的页面，必须建立 Page Baseline 文档。

### 规则

1. **页面完成后必须建立 Page Baseline。** 存放于 `docs/VALIDATION/`。命名：`P{N}-{Name}-Baseline.md`
2. **任何后续修改页面前，必须先读取对应 Baseline。** 理解页面当前状态后才能修改
3. **修改后必须更新 Baseline。** 保持文档与代码一致
4. **Baseline 状态分为：** Draft → BASELINED → Modified
5. **如果修改影响 Freeze 基线，必须进入 Change Management**

### Baseline 创建条件

- [ ] 页面开发完成
- [ ] 功能验收通过
- [ ] Freeze Compliance 检查通过
- [ ] 无阻塞 Bug

### Baseline 标准结构

参考 [docs/VALIDATION/P5-Route-List-Baseline.md](docs/VALIDATION/P5-Route-List-Baseline.md)：
1. Page Information
2. Purpose
3. Data Dependency (Tables Used + Read/Write matrix)
4. Data Flow
5. API Layer
6. Components
7. User Interactions
8. States (Loading / Success / Empty / Error)
9. Validation Checklist
10. Freeze Compliance
11. Known Limitations
12. Future Extension

---

> **核心规则：基准文件不可变。AI 产出走 Review → Proposal → 人工确认 → 更新。**
