# DialFactory AI Project Guide

> **用途：** AI 进入 DialFactory 项目后的行为规范。
> **优先级：** 最高。任何 AI（Claude / GPT / Cursor / 其他）必须在执行任务前阅读本文件。
> **最后更新：** 2026-08-06

---

## 1. 项目读取顺序（强制）

任何 AI 进入项目时，必须按照以下顺序读取：

```
Step 1:  00_PROJECT_STATUS_FREEZE.md     ← 最高优先级，定义"项目现在在哪"
Step 2:  AI_CONTEXT/                     ← 理解"项目是什么"（背景、业务、原则）
Step 3:  当前 Phase 文件夹               ← 理解"当前在做什么"（阶段目标、产出）
```

**禁止：** 直接读取大量历史文件后自行总结。

**原因：** 避免上下文污染和历史版本冲突。Freeze 文件已经过人工确认，是唯一可信的状态入口。

---

## 2. 文件权限等级

### Level 0 — Project Freeze

| 属性 | 值 |
|------|-----|
| **路径** | `00_PROJECT_STATUS_FREEZE.md` |
| **性质** | 最高优先级。定义当前项目状态、已完成阶段、当前阶段、禁止事项 |
| **规则** | **只读。禁止修改。** 仅 Phase 完成时由指定流程更新 |

---

### Level 1 — Context Knowledge

| 属性 | 值 |
|------|-----|
| **路径** | `AI_CONTEXT/` |
| **内容** | 长期稳定知识：工厂背景、业务定义、核心原则、架构设计、V1 Scope |
| **规则** | **只能新增版本。禁止覆盖已有文件。** 修改需经过 Proposal → 人工确认流程 |

Level 1 包含：
- `1-项目目标.md` ~ `6-开发规范.md`：项目基础设定
- `7-架构设计-v1.md`：系统架构
- `8-业务模型审查报告.md`：业务模型审查
- `9-V1-Scope-Definition.md`：V1 范围定义（冻结）
- `10-Business-Model-V1.md`：V1 业务模型（冻结）
- `11-Data-Entry-Templates.md`：数据录入模板
- `12-Field-Verification-Checklist.md`：现场确认清单

---

### Level 2 — Phase Output

| 属性 | 值 |
|------|-----|
| **路径** | `AI_CONTEXT/Phase{0,1,...}/` + `phases/Phase{0,1,...}/` |
| **内容** | 各阶段分析成果：映射、审查、缺口分析、决策日志、Schema 设计 |
| **规则** | **可以新增。禁止修改已完成阶段的文件。** |

当前阶段产出：
- `AI_CONTEXT/Phase0/`：Phase 0 逆向工程全部产出（已冻结）
- `AI_CONTEXT/Phase1/`：Phase 1 实施准备产出
- `phases/`：阶段归档目录（新建，后续阶段使用）

---

### Level 3 — Raw Data

| 属性 | 值 |
|------|-----|
| **路径** | `raw_data/`（如存在） |
| **内容** | 未经 AI 处理的原始输入：Excel、Word、图片、工厂提供的任何源文件 |
| **规则** | **AI 不得修改。** 只能读取后生成分析文件到 Level 2 |

---

## 3. 数据流规则

```
raw_data (L3)
    │
    ▼
analysis ──→ phase output (L2)
    │
    ▼
decision ──→ freeze (L0)
```

**禁止反向：**
- ❌ Phase Output → 修改 Raw Data
- ❌ AI 总结覆盖原始数据
- ❌ 跨级写入（如直接修改 L0 或 L1）

---

## 4. Phase 切换规则

当一个 Phase 完成时，必须生成 **Phase Completion Report**，包含：

| 字段 | 说明 |
|------|------|
| **Phase** | 阶段编号与名称 |
| **Input** | 输入了哪些文件/数据 |
| **Output** | 产出了哪些文件 |
| **Decisions** | 本阶段做出的关键决策 |
| **Open Questions** | 未解决的问题（含阻塞原因） |
| **Next Phase Entry** | 下一阶段的入口条件与目标 |

完成后，更新 `00_PROJECT_STATUS_FREEZE.md`：
- 将当前 Phase 移至 Completed
- 更新 Current Phase
- 更新禁止事项

---

## 5. AI 执行前检查

任何任务开始前，AI 必须回答以下 4 个问题：

| # | 问题 | 答案来源 |
|---|------|---------|
| 1 | **当前 Phase 是什么？** | `00_PROJECT_STATUS_FREEZE.md` §1 |
| 2 | **输入文件是什么？** | 当前 Phase 的 Output 文件 |
| 3 | **是否允许修改？** | 对照本文件 §2 权限等级 |
| 4 | **输出文件应该放哪里？** | 当前 Phase 对应的 `phases/` 或 `AI_CONTEXT/Phase{N}/` 目录 |

**如果无法确认以上 4 个问题：停止，不执行。向用户确认后再继续。**

---

## 6. 变更提案流程

当 AI 发现需要修改 Level 1 或 Level 2 已冻结文件时：

```
发现问题
    │
    ▼
生成 Proposal（放入 proposals/ 或在当前 Phase 目录中标注）
    │
    ▼
人工确认
    ├── 通过 → 执行修改 + 更新 Freeze
    └── 驳回 → 记录原因，归档
```

---

## 7. 禁止事项总览

| # | 禁止行为 | 原因 |
|---|---------|------|
| 1 | 跳过 Freeze 直接读文件开始工作 | 缺乏状态上下文，容易基于旧信息决策 |
| 2 | 修改 `00_PROJECT_STATUS_FREEZE.md`（非 Phase 切换时） | 破坏唯一可信状态源 |
| 3 | 覆盖 `AI_CONTEXT/` 中的基准文件 | 破坏知识库版本完整性 |
| 4 | 修改 Raw Data | 污染原始数据 |
| 5 | 跨 Phase 操作（如 Phase 1 阶段修改 Phase 0 产出） | 违反阶段冻结原则 |
| 6 | 未经确认执行破坏性操作（删表、删文件、改模型） | 不可逆操作需要人工决策 |

---

> **核心原则：先读 Freeze → 确认 Phase → 检查权限 → 执行任务。任何不确定都先停下来问。**
