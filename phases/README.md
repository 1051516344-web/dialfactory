# Phases

本目录存放 DialFactory 项目各阶段的归档文件。

## 目录结构

```
phases/
├── PHASE_TEMPLATE.md      ← 新建 Phase 时复制此模板
├── Phase0/
│   ├── outputs/           ← Phase 0 分析产出归档
│   └── decisions/         ← Phase 0 决策记录归档
└── Phase1/
    ├── reviews/           ← Phase 1 审查文件
    ├── schema/            ← Phase 1 Schema 设计
    └── implementation/    ← Phase 1 实施文件（DDL、脚本等）
```

## 与 AI_CONTEXT 的关系

- `AI_CONTEXT/`：项目**基准知识库**（Level 1）。长期稳定，不可覆盖。
- `phases/`：阶段**归档目录**（Level 2 扩展）。阶段性产出归档位置。
- 当前活跃产出的工作文件在 `AI_CONTEXT/Phase{N}/` 中；完成后归档到 `phases/Phase{N}/`。

## 新建 Phase

1. 复制 `PHASE_TEMPLATE.md` → `Phase{N}/README.md`
2. 填写 Objective、Input、Output
3. 在 `00_PROJECT_STATUS_FREEZE.md` 中更新 Current Phase
